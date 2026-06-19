from fastapi import APIRouter, Query, BackgroundTasks
import psycopg2
import os
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
MOODS = [
    ("euphoric",   "Euphoric",   "valence>=0.7 AND energy>=0.7 AND danceability>=0.6"),
    ("hype",       "Hype",       "energy>=0.8 AND tempo>=125 AND danceability>=0.6"),
    ("anthemic",   "Anthemic",   "valence>=0.6 AND energy>=0.7 AND tempo BETWEEN 100 AND 145"),
    ("wistful",    "Wistful",    "valence BETWEEN 0.45 AND 0.78 AND energy<=0.45 AND tempo<=108"),
    ("serene",     "Serene",     "valence>=0.5 AND energy<=0.4 AND acousticness>=0.4"),
    ("dreamy",     "Dreamy",     "acousticness>=0.5 AND energy<=0.45 AND valence BETWEEN 0.4 AND 0.72"),
    ("sensual",    "Sensual",    "valence BETWEEN 0.4 AND 0.72 AND danceability>=0.6 AND energy BETWEEN 0.35 AND 0.7 AND tempo<=118"),
    ("melancholy", "Melancholy", "valence<=0.35 AND energy<=0.45"),
    ("brooding",   "Brooding",   "valence<=0.42 AND energy BETWEEN 0.45 AND 0.72"),
    ("aggressive", "Aggressive", "valence<=0.45 AND energy>=0.75 AND tempo>=120"),
]


def compute_moods(valence, energy, tempo, acousticness, danceability):
    """Python mirror of the MOODS SQL predicates — tags a track in the response."""
    def _f(x):
        try:
            return float(x)
        except (TypeError, ValueError):
            return None
    v, e, t, a, d = _f(valence), _f(energy), _f(tempo), _f(acousticness), _f(danceability)
    if v is None or e is None:
        return []
    a = a or 0.0
    d = d or 0.0
    out = []
    if v >= 0.7 and e >= 0.7 and d >= 0.6: out.append("euphoric")
    if e >= 0.8 and t is not None and t >= 125 and d >= 0.6: out.append("hype")
    if v >= 0.6 and e >= 0.7 and t is not None and 100 <= t <= 145: out.append("anthemic")
    if 0.45 <= v <= 0.78 and e <= 0.45 and t is not None and t <= 108: out.append("wistful")
    if v >= 0.5 and e <= 0.4 and a >= 0.4: out.append("serene")
    if a >= 0.5 and e <= 0.45 and 0.4 <= v <= 0.72: out.append("dreamy")
    if 0.4 <= v <= 0.72 and d >= 0.6 and 0.35 <= e <= 0.7 and t is not None and t <= 118: out.append("sensual")
    if v <= 0.35 and e <= 0.45: out.append("melancholy")
    if v <= 0.42 and 0.45 <= e <= 0.72: out.append("brooding")
    if v <= 0.45 and e >= 0.75 and t is not None and t >= 120: out.append("aggressive")
    return out


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
               tempo, energy, valence, danceability, acousticness, release_year
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
                "moods":        compute_moods(r[7], r[6], r[5], r[9], r[8]),
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