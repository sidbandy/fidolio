from fastapi import APIRouter, Query, BackgroundTasks, Body
import psycopg2
import requests
import os
import time
import calendar
from datetime import datetime
from dotenv import load_dotenv
from core import spotify_api

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))
router = APIRouter()
DB_URL = os.getenv("DATABASE_URL")

DEFAULT_USER = "0tz6fep2m5bx1vq85g48518u9"

SCOPE = " ".join([
    "user-library-read", "user-read-recently-played", "user-top-read",
    "playlist-read-private", "playlist-modify-public", "playlist-modify-private",
    "user-read-currently-playing", "user-read-playback-state",
])

def get_conn():
    return psycopg2.connect(DB_URL)


# ── Niche mood matrix ─────────────────────────────────────────────────────────
# Composite of audio features (valence/energy/tempo/acousticness/danceability).
# A track can match several moods; each is applied strictly when the metrics fit.
# 13 niche moods. Predicates are conjunctions of comparisons on the audio features
# so the Python mirror (compute_moods) matches the SQL EXACTLY — the badge shown on
# a track is always what the ?moods= filter would include (verified by parity test).
# Optional features (acousticness/danceability/instrumentalness) only appear in >=
# / lower-bound checks, so a missing value (coerced to 0) correctly fails the
# predicate, matching SQL's NULL-excludes-the-row behaviour.
MOODS = [
    ("euphoric",   "Euphoric",   "valence>=0.7 AND energy>=0.7 AND danceability>=0.6"),
    ("hype",       "Hype",       "energy>=0.8 AND tempo>=125 AND danceability>=0.55"),
    ("anthemic",   "Anthemic",   "valence>=0.6 AND energy>=0.72 AND tempo BETWEEN 100 AND 150"),
    ("frenetic",   "Frenetic",   "energy>=0.85 AND tempo>=140"),
    ("aggressive", "Aggressive", "valence<=0.42 AND energy>=0.8 AND tempo>=120"),
    ("playful",    "Playful",    "valence>=0.65 AND danceability>=0.65 AND energy BETWEEN 0.5 AND 0.8"),
    ("sensual",    "Sensual",    "valence BETWEEN 0.4 AND 0.72 AND danceability>=0.6 AND energy BETWEEN 0.35 AND 0.7 AND tempo<=118"),
    ("brooding",   "Brooding",   "valence<=0.42 AND energy BETWEEN 0.45 AND 0.72"),
    ("hypnotic",   "Hypnotic",   "instrumentalness>=0.5 AND energy BETWEEN 0.3 AND 0.78"),
    ("wistful",    "Wistful",    "valence BETWEEN 0.45 AND 0.78 AND energy<=0.45 AND tempo<=110"),
    ("serene",     "Serene",     "valence>=0.5 AND energy<=0.4 AND acousticness>=0.4"),
    ("dreamy",     "Dreamy",     "acousticness>=0.5 AND energy<=0.45 AND valence BETWEEN 0.35 AND 0.72"),
    ("melancholy", "Melancholy", "valence<=0.4 AND energy<=0.45"),
]


def compute_moods(valence, energy, tempo, acousticness, danceability, instrumentalness=None):
    """Python mirror of the MOODS SQL predicates — tags a track in the response.
    Pass instrumentalness so the 'hypnotic' badge matches the ?moods= filter."""
    def _f(x):
        try:
            return float(x)
        except (TypeError, ValueError):
            return None
    v, e, t, a, d, i = (_f(valence), _f(energy), _f(tempo),
                        _f(acousticness), _f(danceability), _f(instrumentalness))
    if v is None or e is None:
        return []
    a = a or 0.0
    d = d or 0.0
    i = i or 0.0
    out = []
    if v >= 0.7 and e >= 0.7 and d >= 0.6: out.append("euphoric")
    if e >= 0.8 and t is not None and t >= 125 and d >= 0.55: out.append("hype")
    if v >= 0.6 and e >= 0.72 and t is not None and 100 <= t <= 150: out.append("anthemic")
    if e >= 0.85 and t is not None and t >= 140: out.append("frenetic")
    if v <= 0.42 and e >= 0.8 and t is not None and t >= 120: out.append("aggressive")
    if v >= 0.65 and d >= 0.65 and 0.5 <= e <= 0.8: out.append("playful")
    if 0.4 <= v <= 0.72 and d >= 0.6 and 0.35 <= e <= 0.7 and t is not None and t <= 118: out.append("sensual")
    if v <= 0.42 and 0.45 <= e <= 0.72: out.append("brooding")
    if i >= 0.5 and 0.3 <= e <= 0.78: out.append("hypnotic")
    if 0.45 <= v <= 0.78 and e <= 0.45 and t is not None and t <= 110: out.append("wistful")
    if v >= 0.5 and e <= 0.4 and a >= 0.4: out.append("serene")
    if a >= 0.5 and e <= 0.45 and 0.35 <= v <= 0.72: out.append("dreamy")
    if v <= 0.4 and e <= 0.45: out.append("melancholy")
    return out


# ── Artist photos (Deezer proxy + cache) — powers the Top Artists cards ──
_ARTIST_IMG_CACHE = {}


def _deezer_artist_image(name: str):
    """(image_url | None, definitive?) — `definitive` means a successful HTTP 200 lookup.
    Deezer rate-limits bursts (429); retry once on a throttle. Callers only CACHE when
    definitive, so a transient failure never freezes into a permanent missing image."""
    for _ in range(2):
        try:
            r = requests.get("https://api.deezer.com/search/artist",
                             params={"q": name, "limit": 1}, timeout=8)
            if r.status_code == 200:
                data = r.json().get("data", [])
                img = (data[0].get("picture_medium") or data[0].get("picture_big") or data[0].get("picture")) if data else None
                return img, True
            if r.status_code == 429:
                time.sleep(0.6)
                continue
        except Exception:
            pass
        time.sleep(0.3)
    return None, False


@router.get("/artist-image")
def artist_image(name: str):
    key = (name or "").strip().lower()
    if not key:
        return {"name": name, "image": None}
    if key in _ARTIST_IMG_CACHE:
        return {"name": name, "image": _ARTIST_IMG_CACHE[key]}
    img, ok = _deezer_artist_image(name)
    if ok:
        _ARTIST_IMG_CACHE[key] = img
    return {"name": name, "image": img}


@router.get("/artist-images")
def artist_images(names: str):
    """Batch sibling of /artist-image — resolve many artists in ONE request, server-paced with a
    small worker pool so a 100-tile scroll never bursts Deezer into a rate limit. Returns
    {lower(name): url|null}. Misses aren't cached so they can recover on a later request."""
    raw = [n for n in (names or "").split("|") if n.strip()][:40]
    out, todo = {}, []
    for n in raw:
        k = n.strip().lower()
        if k in _ARTIST_IMG_CACHE:
            out[k] = _ARTIST_IMG_CACHE[k]
        else:
            todo.append((k, n))
    if todo:
        from concurrent.futures import ThreadPoolExecutor
        def one(item):
            k, n = item
            img, ok = _deezer_artist_image(n)
            return k, img, ok
        with ThreadPoolExecutor(max_workers=4) as ex:
            for k, img, ok in ex.map(one, todo):
                out[k] = img
                if ok:
                    _ARTIST_IMG_CACHE[k] = img
    return {"images": out}


# ── Album covers (Deezer proxy + cache) — Top Albums + discovery studio ──
# Deezer's album search returns the cover AND nb_tracks in one call, so we get
# both the artwork and the completion denominator (owned / total) for free.
_ALBUM_COVER_CACHE = {}


def fetch_album_cover(album: str, artist: str = ""):
    """{cover, nb_tracks, artist} for an album via Deezer. Cached in-process."""
    key = f"{(artist or '').strip().lower()}|{(album or '').strip().lower()}"
    if key in _ALBUM_COVER_CACHE:
        return _ALBUM_COVER_CACHE[key]
    out = {"cover": None, "nb_tracks": None, "artist": artist}
    if album:
        q = f'{artist} {album}'.strip()
        try:
            r = requests.get("https://api.deezer.com/search/album",
                             params={"q": q, "limit": 1}, timeout=6)
            data = r.json().get("data", [])
            if data:
                a = data[0]
                out = {
                    "cover": a.get("cover_medium") or a.get("cover_big") or a.get("cover"),
                    "nb_tracks": a.get("nb_tracks"),
                    "artist": (a.get("artist") or {}).get("name") or artist,
                }
        except Exception:
            pass
    _ALBUM_COVER_CACHE[key] = out
    return out


@router.get("/album-cover")
def album_cover(album: str, artist: str = ""):
    return {"album": album, **fetch_album_cover(album, artist)}


@router.get("/search-albums")
def search_albums(q: str, user_id: str = Query(DEFAULT_USER), limit: int = Query(6, le=15)):
    """Owned-album typeahead for the discovery studio's album seeds."""
    conn = get_conn(); cur = conn.cursor()
    cur.execute("""SELECT album, artist, COUNT(*) FROM tracks
                   WHERE user_id=%s AND album ILIKE %s AND album != ''
                   GROUP BY album, artist ORDER BY COUNT(*) DESC LIMIT %s""",
                (user_id, f"%{q}%", limit))
    rows = cur.fetchall(); cur.close(); conn.close()
    return {"albums": [{"album": r[0], "artist": r[1], "owned": r[2]} for r in rows]}


# ── One-time enrichment backfill ──────────────────────────────────────────────
# ~2,042 older tracks were inserted without ReccoBeats audio features, so they're
# invisible to moods + feature-based recs. This fills them via the same _enrich
# the sync uses. Bounded per call (re-call until unenriched_total stops dropping).
def _run_enrich_backfill(user_id, ids):
    from sync_library import _enrich
    conn = get_conn(); cur = conn.cursor()
    try:
        _enrich(cur, conn, ids)
        print(f"[backfill] processed {len(ids)} tracks for {user_id}")
    except Exception as e:
        print(f"[backfill] error: {e}")
    finally:
        cur.close(); conn.close()


@router.get("/enrich-status")
def enrich_status(user_id: str = Query(DEFAULT_USER)):
    conn = get_conn(); cur = conn.cursor()
    cur.execute("""SELECT COUNT(*), COUNT(*) FILTER (WHERE reccobeats_id IS NOT NULL)
                   FROM tracks WHERE user_id = %s""", (user_id,))
    total, enriched = cur.fetchone()
    cur.close(); conn.close()
    return {"total": total, "enriched": enriched, "unenriched": total - enriched}


@router.post("/enrich-backfill")
def enrich_backfill(background_tasks: BackgroundTasks,
                    user_id: str = Query(DEFAULT_USER),
                    limit: int = Query(600, le=3000)):
    conn = get_conn(); cur = conn.cursor()
    cur.execute("""SELECT id FROM tracks WHERE user_id = %s AND reccobeats_id IS NULL
                   ORDER BY saved_at DESC LIMIT %s""", (user_id, limit))
    ids = [r[0] for r in cur.fetchall()]
    cur.execute("SELECT COUNT(*) FROM tracks WHERE user_id = %s AND reccobeats_id IS NULL", (user_id,))
    remaining = cur.fetchone()[0]
    cur.close(); conn.close()
    if ids:
        background_tasks.add_task(_run_enrich_backfill, user_id, ids)
    return {"queued": len(ids), "unenriched_total": remaining,
            "note": "runs in background; re-call until unenriched_total stops dropping"}


@router.post("/unsave")
def unsave_tracks(payload: dict = Body(...), user_id: str = Query(DEFAULT_USER)):
    """Swipe-to-remove: un-save tracks from the Spotify library + drop them locally
    so dead-saves/duplicates stay in sync. Needs the user-library-modify scope on the
    cached token (re-authorize once if Spotify rejects it)."""
    ids = [i for i in (payload.get("ids") or []) if i][:300]
    if not ids:
        return {"success": False, "removed": 0, "error": "no track ids"}
    try:
        from core.spotify_client import get_spotify_client
        sp = get_spotify_client()
        for i in range(0, len(ids), 50):
            sp.current_user_saved_tracks_delete(tracks=ids[i:i + 50])
    except Exception as e:
        return {"success": False, "removed": 0,
                "error": f"Spotify rejected the un-save ({e}). Re-authorize with the library-modify scope."}
    db_removed = 0
    try:
        conn = get_conn(); cur = conn.cursor()
        cur.execute("DELETE FROM listening_history WHERE track_id = ANY(%s)", (ids,))
        cur.execute("DELETE FROM tracks WHERE id = ANY(%s) AND user_id = %s", (ids, user_id))
        db_removed = cur.rowcount
        conn.commit(); cur.close(); conn.close()
    except Exception as e:
        print(f"[unsave] local cleanup skipped: {e}")
    return {"success": True, "removed": len(ids), "db_removed": db_removed}


def get_spotify():
    import spotipy
    from spotipy.oauth2 import SpotifyOAuth
    cache = os.path.abspath(os.getenv("SPOTIFY_CACHE_PATH") or
        os.path.join(os.path.dirname(__file__), '..', '..', '..', '.cache'))
    return spotipy.Spotify(auth_manager=SpotifyOAuth(
        client_id=os.getenv("SPOTIFY_CLIENT_ID"),
        client_secret=os.getenv("SPOTIFY_CLIENT_SECRET"),
        redirect_uri=os.getenv("SPOTIFY_REDIRECT_URI"),
        scope=SCOPE, open_browser=False, cache_path=cache,
    ))


# ─── Monthly auto-playlists ───────────────────────────────────────────────────
# Idempotent: each (user, year, month) maps to one Spotify playlist tracked here.

def ensure_monthly_table():
    conn = get_conn(); cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS monthly_playlists (
            id            SERIAL PRIMARY KEY,
            user_id       TEXT,
            year          INTEGER,
            month         INTEGER,
            playlist_id   TEXT,
            playlist_url  TEXT,
            track_count   INTEGER,
            last_synced_at TIMESTAMP,
            created_at    TIMESTAMP DEFAULT NOW(),
            UNIQUE(user_id, year, month)
        )
    """)
    conn.commit(); cur.close(); conn.close()


def month_track_ids(cur, user_id, year, month):
    last_day  = calendar.monthrange(year, month)[1]
    month_str = f"{year}-{str(month).zfill(2)}"
    cur.execute("""
        SELECT id FROM tracks
        WHERE user_id = %s AND saved_at >= %s AND saved_at <= %s
        ORDER BY saved_at ASC
    """, (user_id, f"{month_str}-01 00:00:00", f"{month_str}-{last_day} 23:59:59"))
    return [r[0] for r in cur.fetchall()]


def create_or_sync_month(sp, user_id, year, month, force=False):
    """
    Create (or re-sync) the Spotify playlist for one month of saves.
    Returns a dict describing what happened. Idempotent via monthly_playlists.
    """
    ensure_monthly_table()
    conn = get_conn(); cur = conn.cursor()
    track_ids = month_track_ids(cur, user_id, year, month)

    if not track_ids:
        cur.close(); conn.close()
        return {"year": year, "month": month, "status": "skipped_empty", "track_count": 0}

    cur.execute("""
        SELECT playlist_id, playlist_url, track_count FROM monthly_playlists
        WHERE user_id = %s AND year = %s AND month = %s
    """, (user_id, year, month))
    existing = cur.fetchone()

    # Already exists and unchanged and not forced → nothing to do
    if existing and not force and existing[2] == len(track_ids):
        cur.close(); conn.close()
        return {"year": year, "month": month, "status": "unchanged",
                "track_count": len(track_ids), "playlist_url": existing[1]}

    month_name = calendar.month_name[month]
    pl_name    = f"Fidolio: {month_name} {year}"

    uris = [f"spotify:track:{t}" for t in track_ids]
    try:
        if existing and existing[0]:
            playlist_id  = existing[0]
            playlist_url = existing[1]
            spotify_api.replace_items(sp, playlist_id, uris)
            status = "synced"
        else:
            pl = spotify_api.create_playlist(
                sp, pl_name, public=False,
                description=f"Everything you saved in {month_name} {year} — auto-built by Fidolio",
            )
            playlist_id  = pl["id"]
            playlist_url = pl["url"]
            spotify_api.add_items(sp, playlist_id, uris)
            status = "created"
    except Exception as e:
        cur.close(); conn.close()
        msg = str(e)
        if "403" in msg or "Forbidden" in msg:
            msg = "Spotify 403 — run python scripts/reauth_server.py to refresh the token."
        return {"year": year, "month": month, "status": "error", "error": msg}

    cur.execute("""
        INSERT INTO monthly_playlists
            (user_id, year, month, playlist_id, playlist_url, track_count, last_synced_at, created_at)
        VALUES (%s,%s,%s,%s,%s,%s,NOW(),NOW())
        ON CONFLICT (user_id, year, month) DO UPDATE
            SET playlist_id=EXCLUDED.playlist_id, playlist_url=EXCLUDED.playlist_url,
                track_count=EXCLUDED.track_count, last_synced_at=NOW()
    """, (user_id, year, month, playlist_id, playlist_url, len(track_ids)))
    conn.commit(); cur.close(); conn.close()

    return {"year": year, "month": month, "status": status,
            "track_count": len(track_ids), "playlist_url": playlist_url, "name": pl_name}


@router.get("/monthly-playlists")
def list_monthly_playlists(user_id: str = Query(DEFAULT_USER)):
    ensure_monthly_table()
    conn = get_conn(); cur = conn.cursor()
    cur.execute("""
        SELECT year, month, playlist_url, track_count, last_synced_at
        FROM monthly_playlists WHERE user_id = %s
        ORDER BY year DESC, month DESC
    """, (user_id,))
    rows = cur.fetchall()
    cur.close(); conn.close()
    return {"playlists": [{
        "year": r[0], "month": r[1],
        "month_name": calendar.month_name[r[1]],
        "playlist_url": r[2], "track_count": r[3],
        "last_synced_at": str(r[4])[:16] if r[4] else None,
    } for r in rows]}


@router.post("/monthly-playlists/sync-current")
def sync_current_month(user_id: str = Query(DEFAULT_USER)):
    """Create or refresh the playlist for the current calendar month."""
    now = datetime.now()
    sp  = get_spotify()
    result = create_or_sync_month(sp, user_id, now.year, now.month, force=True)
    return result


def _run_saved_sync():
    """Background job: incremental saved-tracks sync (insert new tracks + enrich)."""
    try:
        from sync_library import sync_saved_tracks
        sync_saved_tracks(verbose=False)
    except Exception as e:
        print(f"[sync-saved] background sync failed: {e}")


@router.post("/sync-saved")
def sync_saved(background_tasks: BackgroundTasks, user_id: str = Query(DEFAULT_USER)):
    """
    Manually pull newly-saved Spotify tracks into the library (incremental) — the
    same sync the cron (run_poller.py) runs every 30 min. Verifies the Spotify
    token up front so auth problems surface in the response, then runs the sync in
    the background so the request returns instantly (no proxy timeout on enrich).
    """
    try:
        from core.spotify_client import get_spotify_client
        get_spotify_client().current_user()
    except Exception as e:
        return {"success": False, "error": f"Spotify auth failed in cloud: {e}"}

    conn = get_conn(); cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM tracks WHERE user_id = %s", (user_id,))
    before = cur.fetchone()[0]
    cur.close(); conn.close()

    background_tasks.add_task(_run_saved_sync)
    return {
        "success": True,
        "message": "Auth OK — saved-tracks sync running in the background. "
                   "Reload the app in ~1 minute to see the new count.",
        "count_before": before,
    }


@router.get("/monthly-rewind")
def monthly_rewind(user_id: str = Query(DEFAULT_USER)):
    """
    Browse every month you've saved music — computed from the local DB,
    NO Spotify writes. Shows which months you've already pushed to Spotify.
    """
    ensure_monthly_table()
    conn = get_conn(); cur = conn.cursor()

    # All months with saves + aggregate vibe
    cur.execute("""
        SELECT EXTRACT(YEAR FROM saved_at)::int  AS y,
               EXTRACT(MONTH FROM saved_at)::int AS m,
               COUNT(*),
               ROUND(AVG(energy)::numeric, 2),
               ROUND(AVG(valence)::numeric, 2),
               ROUND(AVG(tempo)::numeric, 0),
               COUNT(DISTINCT artist)
        FROM tracks
        WHERE user_id = %s AND saved_at IS NOT NULL
        GROUP BY y, m
        ORDER BY y DESC, m DESC
    """, (user_id,))
    months = cur.fetchall()

    # Which months are already in Spotify
    cur.execute("""
        SELECT year, month, playlist_url, track_count
        FROM monthly_playlists WHERE user_id = %s
    """, (user_id,))
    in_spotify = {(r[0], r[1]): {"url": r[2], "count": r[3]} for r in cur.fetchall()}

    cur.close(); conn.close()

    out = []
    for r in months:
        y, m, count, avg_e, avg_v, avg_t, artists = r
        sp_rec = in_spotify.get((y, m))
        out.append({
            "year": y, "month": m, "month_name": calendar.month_name[m],
            "track_count": count,
            "avg_energy":  float(avg_e) if avg_e is not None else None,
            "avg_valence": float(avg_v) if avg_v is not None else None,
            "avg_tempo":   int(avg_t)   if avg_t is not None else None,
            "unique_artists": artists,
            "in_spotify":   bool(sp_rec),
            "playlist_url": sp_rec["url"] if sp_rec else None,
        })
    return {"months": out, "total_months": len(out)}


@router.get("/month-tracks")
def month_tracks(year: int = Query(...), month: int = Query(...),
                 user_id: str = Query(DEFAULT_USER)):
    """Full track list for one month (for the expand/preview view)."""
    last_day  = calendar.monthrange(year, month)[1]
    month_str = f"{year}-{str(month).zfill(2)}"
    conn = get_conn(); cur = conn.cursor()
    cur.execute("""
        SELECT id, name, artist, album, saved_at,
               tempo, energy, valence, release_year, language
        FROM tracks
        WHERE user_id = %s AND saved_at >= %s AND saved_at <= %s
        ORDER BY saved_at ASC
    """, (user_id, f"{month_str}-01 00:00:00", f"{month_str}-{last_day} 23:59:59"))
    rows = cur.fetchall()
    cur.close(); conn.close()
    return {"tracks": [{
        "id": r[0], "name": r[1], "artist": r[2], "album": r[3],
        "saved_at": str(r[4])[:10],
        "tempo":   round(float(r[5]), 1) if r[5] else None,
        "energy":  round(float(r[6]), 2) if r[6] else None,
        "valence": round(float(r[7]), 2) if r[7] else None,
        "release_year": r[8], "language": r[9],
        "spotify_url": f"https://open.spotify.com/track/{r[0]}",
    } for r in rows]}


@router.post("/monthly-playlists/create")
def create_month_playlist(year: int = Query(...), month: int = Query(...),
                          user_id: str = Query(DEFAULT_USER)):
    """Explicitly push ONE month's saves to Spotify (only when the user clicks)."""
    sp  = get_spotify()
    res = create_or_sync_month(sp, user_id, year, month, force=True)
    if res["status"] == "skipped_empty":
        return {"success": False, "message": "No songs saved that month"}
    if res["status"] == "error":
        return {"success": False, "message": res.get("error", "Spotify error")}
    return {"success": True, **res}


# ─── Multi-month selection (range or arbitrary set of months) ────────────────

def _parse_months(months: str):
    """'2025-12,2026-01' -> [(2025,12),(2026,1)] sorted chronologically."""
    out = []
    for tok in (months or "").split(","):
        tok = tok.strip()
        if "-" in tok:
            try:
                y, m = tok.split("-")
                out.append((int(y), int(m)))
            except Exception:
                pass
    return sorted(set(out))


def _months_where(months_list):
    """Build a WHERE fragment + params matching any of the given months."""
    clauses, params = [], []
    for (y, m) in months_list:
        last = calendar.monthrange(y, m)[1]
        clauses.append("(saved_at >= %s AND saved_at <= %s)")
        params += [f"{y}-{str(m).zfill(2)}-01 00:00:00",
                   f"{y}-{str(m).zfill(2)}-{last} 23:59:59"]
    return "(" + " OR ".join(clauses) + ")", params


@router.get("/range-tracks")
def range_tracks(months: str = Query(..., description="comma list e.g. 2025-12,2026-01"),
                 user_id: str = Query(DEFAULT_USER)):
    """All tracks saved across a set of months, deduped, oldest first."""
    ms = _parse_months(months)
    if not ms:
        return {"tracks": [], "months": []}
    frag, params = _months_where(ms)
    conn = get_conn(); cur = conn.cursor()
    cur.execute(f"""
        SELECT DISTINCT ON (id) id, name, artist, album, saved_at,
               tempo, energy, valence, release_year, language
        FROM tracks
        WHERE user_id = %s AND {frag}
        ORDER BY id, saved_at ASC
    """, [user_id] + params)
    rows = cur.fetchall()
    cur.close(); conn.close()
    tracks = [{
        "id": r[0], "name": r[1], "artist": r[2], "album": r[3],
        "saved_at": str(r[4])[:10],
        "tempo":   round(float(r[5]), 1) if r[5] else None,
        "energy":  round(float(r[6]), 2) if r[6] else None,
        "valence": round(float(r[7]), 2) if r[7] else None,
        "release_year": r[8], "language": r[9],
        "spotify_url": f"https://open.spotify.com/track/{r[0]}",
    } for r in rows]
    tracks.sort(key=lambda t: t["saved_at"])
    return {"tracks": tracks, "months": [f"{y}-{str(m).zfill(2)}" for y, m in ms]}


@router.post("/multi-month-playlist")
def multi_month_playlist(months: str = Query(...), name: str = Query(""),
                         user_id: str = Query(DEFAULT_USER)):
    """Create ONE Spotify playlist from all songs saved across the chosen months."""
    ms = _parse_months(months)
    if not ms:
        return {"success": False, "message": "No months selected"}

    # Single month → reuse the tracked per-month engine (so 'in Spotify' shows up)
    if len(ms) == 1:
        sp  = get_spotify()
        res = create_or_sync_month(sp, user_id, ms[0][0], ms[0][1], force=True)
        if res["status"] == "skipped_empty":
            return {"success": False, "message": "No songs saved that month"}
        if res["status"] == "error":
            return {"success": False, "message": res.get("error", "Spotify error")}
        return {"success": True, "track_count": res["track_count"],
                "playlist_url": res["playlist_url"]}

    # Multiple months → ad-hoc combined playlist
    frag, params = _months_where(ms)
    conn = get_conn(); cur = conn.cursor()
    cur.execute(f"""
        SELECT DISTINCT ON (id) id, saved_at FROM tracks
        WHERE user_id = %s AND {frag} ORDER BY id, saved_at ASC
    """, [user_id] + params)
    rows = cur.fetchall()
    cur.close(); conn.close()
    track_ids = [r[0] for r in sorted(rows, key=lambda r: r[1])]
    if not track_ids:
        return {"success": False, "message": "No songs saved in those months"}

    if not name:
        first = f"{calendar.month_abbr[ms[0][1]]} {ms[0][0]}"
        last  = f"{calendar.month_abbr[ms[-1][1]]} {ms[-1][0]}"
        name  = f"Fidolio: {first}–{last}"

    try:
        sp = get_spotify()
        pl = spotify_api.create_playlist(sp, name, public=False,
            description=f"Saved across {len(ms)} months — built by Fidolio")
        spotify_api.add_items(sp, pl["id"], [f"spotify:track:{t}" for t in track_ids])
        return {"success": True, "track_count": len(track_ids),
                "playlist_url": pl["url"]}
    except Exception as e:
        msg = str(e)
        if "403" in msg or "Forbidden" in msg:
            msg = "Spotify 403 — re-auth needed."
        return {"success": False, "message": msg}

@router.get("/duplicates")
def find_duplicates(user_id: str = Query("0tz6fep2m5bx1vq85g48518u9")):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("""
        SELECT name, artist, COUNT(*) as copies,
               array_agg(id)          as track_ids,
               array_agg(saved_at::text) as saved_dates
        FROM tracks
        WHERE user_id = %s
        GROUP BY name, artist
        HAVING COUNT(*) > 1
        ORDER BY copies DESC
    """, (user_id,))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return {"duplicates": [
        {
            "name": r[0], "artist": r[1], "copies": r[2],
            "track_ids": r[3], "saved_dates": r[4]
        }
        for r in rows
    ]}

@router.get("/dead-saves")
def find_dead_saves(
    user_id: str = Query("0tz6fep2m5bx1vq85g48518u9"),
    min_days: int = Query(365),
    limit: int = Query(2000, le=5000),
):
    """
    Songs saved over `min_days` ago that you've either never played or haven't
    played since then. Returns the true total + each track's saved date and
    last-played date (null = never played in tracked history).
    """
    conn = get_conn()
    cur  = conn.cursor()

    # True total (HAVING needs a subquery to count)
    cur.execute("""
        SELECT COUNT(*) FROM (
            SELECT t.id
            FROM tracks t
            LEFT JOIN listening_history lh ON lh.track_id = t.id
            WHERE t.user_id = %s AND t.saved_at < NOW() - INTERVAL '1 day' * %s
            GROUP BY t.id
            HAVING MAX(lh.played_at) IS NULL
                OR MAX(lh.played_at) < NOW() - INTERVAL '1 day' * %s
        ) sub
    """, (user_id, min_days, min_days))
    total = cur.fetchone()[0]

    cur.execute("""
        SELECT t.id, t.name, t.artist, t.saved_at, t.energy, t.valence,
               MAX(lh.played_at) AS last_played
        FROM tracks t
        LEFT JOIN listening_history lh ON lh.track_id = t.id
        WHERE t.user_id = %s AND t.saved_at < NOW() - INTERVAL '1 day' * %s
        GROUP BY t.id, t.name, t.artist, t.saved_at, t.energy, t.valence
        HAVING MAX(lh.played_at) IS NULL
            OR MAX(lh.played_at) < NOW() - INTERVAL '1 day' * %s
        ORDER BY t.saved_at ASC
        LIMIT %s
    """, (user_id, min_days, min_days, limit))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return {
        "total": total,
        "returned": len(rows),
        "dead_saves": [
            {
                "id": r[0], "name": r[1], "artist": r[2],
                "saved_at": str(r[3])[:10] if r[3] else None,
                "energy": r[4], "valence": r[5],
                "last_played": str(r[6])[:10] if r[6] else None,
            }
            for r in rows
        ],
    }

@router.get("/top-saved-artists")
def top_saved_artists(
    user_id: str = Query("0tz6fep2m5bx1vq85g48518u9"),
    limit: int = Query(20, le=100)
):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("""
        SELECT artist, COUNT(*) as song_count,
               ROUND(AVG(energy)::numeric, 2) as avg_energy,
               ROUND(AVG(valence)::numeric, 2) as avg_mood
        FROM tracks
        WHERE user_id = %s
        GROUP BY artist
        ORDER BY song_count DESC
        LIMIT %s
    """, (user_id, limit))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return {"artists": [
        {"artist": r[0], "songs": r[1], "avg_energy": r[2], "avg_mood": r[3]}
        for r in rows
    ]}

@router.get("/moods")
def list_moods(user_id: str = Query("0tz6fep2m5bx1vq85g48518u9")):
    """The niche moods + how many of your analyzed tracks match each (one scan)."""
    conn = get_conn(); cur = conn.cursor()
    select = ", ".join(f"COUNT(*) FILTER (WHERE {sql})" for _k, _l, sql in MOODS)
    cur.execute(f"SELECT {select} FROM tracks WHERE user_id = %s", (user_id,))
    row = cur.fetchone() or []
    cur.close(); conn.close()
    return {"moods": [
        {"key": k, "label": label, "count": (row[i] if i < len(row) else 0)}
        for i, (k, label, _s) in enumerate(MOODS)
    ]}


@router.get("/liked-songs")
def liked_songs(
    user_id: str        = Query("0tz6fep2m5bx1vq85g48518u9"),
    sort_by: str        = Query("saved_at"),
    order: str          = Query("desc"),
    min_year: int       = Query(None),
    max_year: int       = Query(None),
    min_tempo: float    = Query(None),
    max_tempo: float    = Query(None),
    min_energy: float   = Query(None),
    max_energy: float   = Query(None),
    min_valence: float  = Query(None),
    max_valence: float  = Query(None),
    artist: str         = Query(None),
    language: str       = Query(None),
    decades: str        = Query(None),
    moods: str          = Query(None),
    limit: int          = Query(50, le=200),
    offset: int         = Query(0)
):
    conn = get_conn()
    cur  = conn.cursor()

    filters = ["user_id = %s"]
    params  = [user_id]

    if min_year:
        filters.append("release_year >= %s")
        params.append(min_year)
    if max_year:
        filters.append("release_year <= %s")
        params.append(max_year)
    if min_tempo is not None:
        filters.append("tempo >= %s"); params.append(min_tempo)
    if max_tempo is not None:
        filters.append("tempo <= %s"); params.append(max_tempo)
    if min_energy is not None:
        filters.append("energy >= %s"); params.append(min_energy)
    if max_energy is not None:
        filters.append("energy <= %s"); params.append(max_energy)
    if min_valence is not None:
        filters.append("valence >= %s"); params.append(min_valence)
    if max_valence is not None:
        filters.append("valence <= %s"); params.append(max_valence)
    if artist:
        filters.append("LOWER(artist) LIKE %s")
        params.append(f"%{artist.lower()}%")
    if language:
        filters.append("LOWER(language) = %s")
        params.append(language.lower())
    if decades:
        # Comma-separated decade starts, e.g. "2020,1990" → disjoint year ranges.
        try:
            starts = [int(d) for d in decades.split(",") if d.strip()]
        except ValueError:
            starts = []
        ors = []
        for s in starts:
            ors.append("(release_year BETWEEN %s AND %s)")
            params.extend([s, s + 9])
        if ors:
            filters.append("(" + " OR ".join(ors) + ")")
    if moods:
        keys = {m.strip() for m in moods.split(",") if m.strip()}
        preds = [sql for (k, _label, sql) in MOODS if k in keys]
        if preds:
            filters.append("(" + " OR ".join(f"({p})" for p in preds) + ")")

    valid_sorts = {"saved_at","tempo","energy","valence","danceability","artist","album","name"}
    sort_col  = sort_by if sort_by in valid_sorts else "saved_at"
    direction = "ASC" if order == "asc" else "DESC"
    where     = " AND ".join(filters)

    count_params = params.copy()
    cur.execute(f"SELECT COUNT(*) FROM tracks WHERE {where}", count_params)
    total = cur.fetchone()[0]

    params.extend([limit, offset])
    cur.execute(f"""
        SELECT id, name, artist, album, saved_at,
               tempo, energy, valence, danceability, acousticness, release_year,
               instrumentalness
        FROM tracks
        WHERE {where}
        ORDER BY {sort_col} {direction} NULLS LAST
        LIMIT %s OFFSET %s
    """, params)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "tracks": [
            {
                "id": r[0], "name": r[1], "artist": r[2],
                "album": r[3], "saved_at": str(r[4])[:10],
                "tempo":        round(float(r[5]), 1)  if r[5] else None,
                "energy":       round(float(r[6]), 2)  if r[6] else None,
                "valence":      round(float(r[7]), 2)  if r[7] else None,
                "danceability": round(float(r[8]), 2)  if r[8] else None,
                "acousticness": round(float(r[9]), 2)  if r[9] else None,
                "release_year": r[10],
                "moods":        compute_moods(r[7], r[6], r[5], r[9], r[8], r[11]),
                "spotify_url":  f"https://open.spotify.com/track/{r[0]}"
            }
            for r in rows
        ]
    }

@router.post("/time-capsule")
def create_time_capsule(
    year:    int = Query(...),
    month:   int = Query(...),
    user_id: str = Query(DEFAULT_USER)
):
    # Unified with the monthly-playlist engine — idempotent, won't duplicate.
    sp = get_spotify()
    result = create_or_sync_month(sp, user_id, year, month, force=True)

    if result["status"] == "skipped_empty":
        return {"success": False, "message": f"No songs saved in {year}-{str(month).zfill(2)}"}
    if result["status"] == "error":
        return {"success": False, "message": result.get("error", "Spotify error")}

    return {
        "success":       True,
        "playlist_name": result.get("name", f"Fidolio: {calendar.month_name[month]} {year}"),
        "track_count":   result["track_count"],
        "playlist_url":  result["playlist_url"],
    }