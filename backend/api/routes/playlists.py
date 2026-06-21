"""
Smart Playlist Engine
---------------------
Rule-based playlist building, Spotify sync, and auto-rotation.

Condition fields
  language      eq            bengali | hindi | arabic | english | punjabi | ...
  mood          eq            happy | neutral | dark
  decade        eq            2020s | 2010s | 2000s | 90s | 80s | 70s | 60s | older
  energy        gte/lte/between   0.0–1.0
  valence       gte/lte/between   0.0–1.0
  tempo / bpm   gte/lte/between   BPM
  danceability  gte/lte           0.0–1.0
  acousticness  gte/lte           0.0–1.0
  speechiness   gte/lte           0.0–1.0
  release_year  gte/lte/between   integer
  artist        contains / eq     string
  saved_days    lte               integer (saved within N days)
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Optional
import psycopg2, json, os, requests
from dotenv import load_dotenv
from core import spotify_api, similarity

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

router  = APIRouter()
DB_URL  = os.getenv("DATABASE_URL")
LASTFM  = os.getenv("LASTFM_API_KEY")
RB_BASE = "https://api.reccobeats.com/v1"
CACHE   = os.getenv("SPOTIFY_CACHE_PATH") and os.path.abspath(os.getenv("SPOTIFY_CACHE_PATH")) \
    or os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '.cache'))
SCOPE = " ".join([
    "user-library-read", "user-read-recently-played", "user-top-read",
    "playlist-read-private", "playlist-modify-public", "playlist-modify-private",
    "user-read-currently-playing", "user-read-playback-state",
])


def get_conn():
    return psycopg2.connect(DB_URL)


def get_spotify():
    import spotipy
    from spotipy.oauth2 import SpotifyOAuth
    return spotipy.Spotify(auth_manager=SpotifyOAuth(
        client_id=os.getenv("SPOTIFY_CLIENT_ID"),
        client_secret=os.getenv("SPOTIFY_CLIENT_SECRET"),
        redirect_uri=os.getenv("SPOTIFY_REDIRECT_URI"),
        scope=SCOPE, open_browser=False, cache_path=CACHE,
    ))


def spotify_error(e: Exception) -> str:
    """Convert a Spotify exception to a human-readable error string."""
    msg = str(e)
    if "403" in msg or "Forbidden" in msg:
        return (
            "Spotify returned 403 — the stored token is missing playlist scopes. "
            "Run: python scripts/reauth.py  (open the printed URL in incognito, "
            "approve, paste the redirect URL back). Then retry."
        )
    if "401" in msg or "Unauthorized" in msg or "token" in msg.lower():
        return "Spotify token expired. Run: python scripts/reauth.py"
    if "404" in msg:
        return "Spotify playlist not found. Check the playlist ID."
    return f"Spotify error: {msg}"


def normalize_playlist_id(value: Optional[str]) -> Optional[str]:
    """Accept a Spotify playlist ID, URL, or URI and return the bare ID."""
    if not value:
        return None
    v = value.strip()
    if not v:
        return None
    if "spotify:playlist:" in v:
        v = v.split("spotify:playlist:", 1)[1]
    if "spotify.com/playlist/" in v:
        v = v.split("spotify.com/playlist/", 1)[1]
    return v.split("?", 1)[0].split("/", 1)[0].strip() or None


def make_playlist_url(playlist_id: Optional[str]) -> Optional[str]:
    return f"https://open.spotify.com/playlist/{playlist_id}" if playlist_id else None


# ─── SQL condition builder ────────────────────────────────────────────────────

DECADE_MAP = {
    "2020s": (2020, 2029), "2010s": (2010, 2019), "2000s": (2000, 2009),
    "90s":   (1990, 1999), "80s":   (1980, 1989), "70s":   (1970, 1979),
    "60s":   (1960, 1969), "older": (1800, 1959),
}

MOOD_INCLUDE = {
    "happy":   ("valence >= %s",              [0.60]),
    "neutral": ("valence BETWEEN %s AND %s",  [0.35, 0.65]),
    "dark":    ("valence <= %s",              [0.35]),
    "sad":     ("valence <= %s",              [0.35]),
}
MOOD_EXCLUDE = {
    "happy":   ("valence < %s",                               [0.60]),
    "neutral": ("(valence < %s OR valence > %s)",             [0.35, 0.65]),
    "dark":    ("valence > %s",                               [0.35]),
    "sad":     ("valence > %s",                               [0.35]),
}

NUMERIC_COLS = {
    "energy": "energy", "valence": "valence",
    "tempo":  "tempo",  "bpm":     "tempo",
    "danceability": "danceability", "acousticness": "acousticness",
    "speechiness":  "speechiness",  "release_year": "release_year",
}
SQL_OPS = {"gte": ">=", "lte": "<=", "eq": "=", "gt": ">", "lt": "<"}
INV_OPS = {">=": "<",   "<=": ">",   "=": "!=", ">": "<=", "<": ">="}


def cond_to_sql(cond: dict, exclude: bool = False):
    """Return (sql_fragment, params_list) for one condition dict."""
    field = str(cond.get("field", "")).lower()
    op    = str(cond.get("op",    "eq")).lower()
    value = cond.get("value")

    if field == "language":
        if isinstance(value, list):
            if not value:
                return ("1=1", []) if exclude else ("1=0", [])
            ph  = ",".join(["%s"] * len(value))
            not_ = "NOT " if exclude else ""
            return f"language {not_}IN ({ph})", [v.lower() for v in value]
        op_ = "!=" if exclude else "="
        return f"language {op_} %s", [str(value).lower()]

    if field == "mood":
        m = (MOOD_EXCLUDE if exclude else MOOD_INCLUDE).get(str(value).lower())
        return m if m else ("1=1", [])

    if field == "decade":
        lo, hi = DECADE_MAP.get(str(value), (1800, 2030))
        if exclude:
            return "(release_year < %s OR release_year > %s)", [lo, hi]
        return "release_year BETWEEN %s AND %s", [lo, hi]

    if field == "saved_days":
        days = int(value)
        if exclude:
            return "saved_at < NOW() - INTERVAL '1 day' * %s", [days]
        return "saved_at >= NOW() - INTERVAL '1 day' * %s", [days]

    if field in NUMERIC_COLS:
        col = NUMERIC_COLS[field]
        if op == "between" and isinstance(value, (list, tuple)) and len(value) == 2:
            lo, hi = value
            if exclude:
                return f"({col} < %s OR {col} > %s)", [lo, hi]
            return f"{col} BETWEEN %s AND %s", [lo, hi]
        if op in SQL_OPS:
            raw = SQL_OPS[op]
            sql_op = INV_OPS.get(raw, "!=") if exclude else raw
            return f"{col} {sql_op} %s", [value]

    if field == "artist":
        if op == "contains":
            not_ = "NOT " if exclude else ""
            return f"LOWER(artist) {not_}LIKE %s", [f"%{str(value).lower()}%"]
        op_ = "!=" if exclude else "="
        return f"LOWER(artist) {op_} %s", [str(value).lower()]

    if field in ("name", "track"):
        not_ = "NOT " if exclude else ""
        return f"LOWER(name) {not_}LIKE %s", [f"%{str(value).lower()}%"]

    return "1=1", []


def build_query(conditions, excludes, user_id, sort_by="saved_at",
                sort_order="desc", limit=200):
    VALID = {"saved_at", "energy", "valence", "tempo", "danceability",
             "acousticness", "artist", "name", "release_year"}
    col  = sort_by if sort_by in VALID else "saved_at"
    dir_ = "ASC" if sort_order == "asc" else "DESC"

    parts, params = ["user_id = %s"], [user_id]

    for c in conditions:
        sql, p = cond_to_sql(c, exclude=False)
        if sql != "1=1":
            parts.append(f"({sql})"); params.extend(p)

    for c in excludes:
        sql, p = cond_to_sql(c, exclude=True)
        if sql != "1=1":
            parts.append(f"({sql})"); params.extend(p)

    params.append(limit)
    return (
        f"""SELECT id, name, artist, album, energy, valence, tempo,
                   danceability, acousticness, saved_at, release_year, language
              FROM tracks
             WHERE {' AND '.join(parts)}
          ORDER BY {col} {dir_} NULLS LAST
             LIMIT %s""",
        params,
    )


def rows_to_tracks(rows):
    return [{
        "id":           r[0],  "name":         r[1],
        "artist":       r[2],  "album":        r[3],
        "energy":       round(float(r[4]), 2)  if r[4] is not None else None,
        "valence":      round(float(r[5]), 2)  if r[5] is not None else None,
        "tempo":        round(float(r[6]), 1)  if r[6] is not None else None,
        "danceability": round(float(r[7]), 2)  if r[7] is not None else None,
        "acousticness": round(float(r[8]), 2)  if r[8] is not None else None,
        "saved_at":     str(r[9])[:10]          if r[9] else None,
        "release_year": r[10], "language":     r[11],
        "spotify_url":  f"https://open.spotify.com/track/{r[0]}",
    } for r in rows]


def compute_stats(tracks):
    if not tracks:
        return {"count": 0}
    energies = [t["energy"]  for t in tracks if t["energy"]  is not None]
    valences = [t["valence"] for t in tracks if t["valence"] is not None]
    tempos   = [t["tempo"]   for t in tracks if t["tempo"]   is not None]
    langs    = {}
    for t in tracks:
        l = t.get("language") or "unknown"
        langs[l] = langs.get(l, 0) + 1
    happy   = sum(1 for v in valences if v >= 0.60)
    dark    = sum(1 for v in valences if v <= 0.35)
    return {
        "count":          len(tracks),
        "avg_energy":     round(sum(energies)/len(energies), 2) if energies else None,
        "avg_valence":    round(sum(valences)/len(valences), 2) if valences else None,
        "avg_tempo":      round(sum(tempos)/len(tempos),     1) if tempos   else None,
        "happy_pct":      round(happy/(len(valences) or 1)*100),
        "dark_pct":       round(dark /(len(valences) or 1)*100),
        "unique_artists": len({t["artist"] for t in tracks}),
        "languages":      dict(sorted(langs.items(), key=lambda x: -x[1])),
    }


def profile_of(track_ids, cur):
    if not track_ids:
        return {"energy": 0.5, "valence": 0.5, "tempo": 120, "danceability": 0.5, "acousticness": 0.3}
    ph = ",".join(["%s"] * len(track_ids))
    cur.execute(
        f"SELECT AVG(energy),AVG(valence),AVG(tempo),AVG(danceability),AVG(acousticness) FROM tracks WHERE id IN ({ph})",
        list(track_ids),
    )
    r = cur.fetchone()
    return {
        "energy":       float(r[0] or 0.5),
        "valence":      float(r[1] or 0.5),
        "tempo":        float(r[2] or 120),
        "danceability": float(r[3] or 0.5),
        "acousticness": float(r[4] or 0.3),
    }


def taste_score(track_id, profile, cur):
    cur.execute(
        "SELECT energy,valence,tempo,danceability,acousticness FROM tracks WHERE id=%s",
        (track_id,),
    )
    r = cur.fetchone()
    if not r or not r[0]:
        return 0.5
    e, v, t, d, a = [float(x) if x else 0.5 for x in r]
    s  = max(0, 1 - abs(e - profile["energy"])          * 2)
    s += max(0, 1 - abs(v - profile["valence"])         * 2)
    s += max(0, 1 - abs((t - profile["tempo"]) / 60))
    s += max(0, 1 - abs(d - profile["danceability"])    * 2)
    s += max(0, 1 - abs(a - profile["acousticness"])    * 2)
    return s / 5


def _track_feats(t):
    return {"energy": t["energy"], "valence": t["valence"], "tempo": t["tempo"],
            "danceability": t["danceability"], "acousticness": t["acousticness"]}

def rank_by_cohesion(tracks, cur, user_id):
    """Rank rule-matched tracks by how well they sit with the SET as a whole — closeness
    to the matched set's centroid in normalized feature space. Makes a playlist feel
    cohesive (the songs belong together), not just individually rule-passing. Annotates
    each track with `fit` (0..1). Tracks missing features sink to the bottom."""
    feats = [_track_feats(t) for t in tracks if t["energy"] is not None]
    if len(feats) < 2:
        for t in tracks:
            t["fit"] = None
        return tracks
    stats = similarity.library_feature_stats(cur, user_id)
    cv = similarity.to_vector(similarity.merge_features(feats), stats)
    for t in tracks:
        t["fit"] = (similarity.score(cv, similarity.to_vector(_track_feats(t), stats))
                    if t["energy"] is not None else -1)
    return sorted(tracks, key=lambda t: (t["fit"] if t["fit"] is not None else -1), reverse=True)


def fetch_spotify_tracks(sp, playlist_id):
    return spotify_api.get_items(sp, playlist_id)


def query_track_ids(rule, user_id, cur):
    query, params = build_query(
        rule.get("conditions", []), rule.get("excludes", []),
        user_id, rule.get("sort_by", "saved_at"),
        rule.get("sort_order", "desc"), rule.get("limit", 200),
    )
    cur.execute(query, params)
    return [r[0] for r in cur.fetchall()]


def replace_spotify_playlist(sp, playlist_id, track_ids):
    """Fully replace a Spotify playlist, including clearing it for empty rules."""
    spotify_api.replace_items(sp, playlist_id, [f"spotify:track:{t}" for t in track_ids])


# ─── Request models ───────────────────────────────────────────────────────────

class PreviewBody(BaseModel):
    conditions:  list = []
    excludes:    list = []
    sort_by:     str  = "saved_at"
    sort_order:  str  = "desc"
    limit:       int  = 200
    user_id:     str  = "0tz6fep2m5bx1vq85g48518u9"

class SaveBody(PreviewBody):
    name:                 str
    spotify_mode:         str = "new"          # new | existing | none | keep
    playlist_name:        Optional[str] = None
    playlist_id:          Optional[str] = None
    rotation_enabled:     bool = False
    rotation_size:        int  = 5
    rotation_source:      str  = "library"     # library | similar | discover
    rotation_interval_days: int = 7            # how often to auto-rotate

class RotateBody(BaseModel):
    user_id:         str           = "0tz6fep2m5bx1vq85g48518u9"
    rotation_size:   Optional[int] = None    # override saved default
    rotation_source: Optional[str] = None    # override saved default


class FromTracksBody(BaseModel):
    name:      str
    track_ids: list
    public:    bool = False
    user_id:   str  = "0tz6fep2m5bx1vq85g48518u9"


class CurateBody(BaseModel):
    conditions: list = []
    excludes:   list = []
    target:     int  = 25
    user_id:    str  = "0tz6fep2m5bx1vq85g48518u9"


@router.post("/curate")
def curate(body: CurateBody):
    """Swipe-to-build candidates: rule-matched tracks ranked by cohesion (closeness to
    the matched set's centroid), returning ~1.25x the target so the user can swipe to
    include/exclude and still land on their number with the best-fitting songs first."""
    import math
    conn = get_conn(); cur = conn.cursor()
    query, params = build_query(body.conditions, body.excludes, body.user_id,
                                "saved_at", "desc", limit=600)
    try:
        cur.execute(query, params)
    except Exception as e:
        cur.close(); conn.close()
        if "language" in str(e).lower():
            return {"error": "Language column not set up — call POST /playlists/setup first."}
        raise
    tracks = rows_to_tracks(cur.fetchall())
    if not tracks:
        cur.close(); conn.close()
        return {"tracks": [], "target": body.target, "matched": 0}
    ranked = rank_by_cohesion(tracks, cur, body.user_id)
    cur.close(); conn.close()
    n = max(1, math.ceil(body.target * 1.25))
    return {"tracks": ranked[:n], "target": body.target, "matched": len(tracks)}


@router.post("/from-tracks")
def create_from_tracks(body: FromTracksBody):
    """Create a one-off Spotify playlist from an explicit list of track IDs.
    Used by Search → 'Save as Playlist'. Not rule-managed (no rotation/sync)."""
    ids = [t for t in body.track_ids if t]
    if not ids:
        return {"error": "No tracks to add."}
    try:
        sp = get_spotify()
        pl = spotify_api.create_playlist(
            sp, body.name, public=body.public,
            description="Created from a Fidolio search",
        )
        spotify_api.add_items(sp, pl["id"], [f"spotify:track:{t}" for t in ids])
        return {
            "success":      True,
            "track_count":  len(ids),
            "playlist_url": pl["url"],
            "playlist_id":  pl["id"],
        }
    except Exception as e:
        return {"success": False, "error": spotify_error(e)}


# ─── Setup / language detection ──────────────────────────────────────────────

SCRIPT_RANGES = [
    (0x0980, 0x09FF, "bengali"),   (0x0900, 0x097F, "hindi"),
    (0x0600, 0x06FF, "arabic"),    (0x0A00, 0x0A7F, "punjabi"),
    (0x0B80, 0x0BFF, "tamil"),     (0x0C00, 0x0C7F, "telugu"),
    (0x0C80, 0x0CFF, "kannada"),   (0x0D00, 0x0D7F, "malayalam"),
    (0xAC00, 0xD7AF, "korean"),    (0x4E00, 0x9FFF, "chinese"),
    (0x3040, 0x309F, "japanese"),  (0x0400, 0x04FF, "russian"),
]

def _detect_script(text):
    for ch in (text or ""):
        code = ord(ch)
        for lo, hi, lang in SCRIPT_RANGES:
            if lo <= code <= hi:
                return lang
    return None


@router.post("/setup")
def setup_playlists():
    """Create schema and run fast (script-based) language detection. Safe to re-run."""
    conn = get_conn(); cur = conn.cursor()

    cur.execute("ALTER TABLE tracks ADD COLUMN IF NOT EXISTS language TEXT")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS smart_playlists (
            id                   SERIAL PRIMARY KEY,
            user_id              TEXT,
            name                 TEXT,
            rule_json            TEXT,
            spotify_playlist_id  TEXT,
            spotify_playlist_url TEXT,
            rotation_enabled     BOOLEAN   DEFAULT FALSE,
            rotation_size        INTEGER   DEFAULT 5,
            rotation_source      TEXT      DEFAULT 'library',
            last_rotated_at      TIMESTAMP,
            last_synced_at       TIMESTAMP,
            created_at           TIMESTAMP DEFAULT NOW()
        )
    """)
    conn.commit()

    cur.execute("SELECT id, name, artist FROM tracks WHERE language IS NULL")
    rows        = cur.fetchall()
    script_hits = 0
    for tid, name, artist in rows:
        lang = _detect_script((name or "") + " " + (artist or ""))
        if lang:
            cur.execute("UPDATE tracks SET language=%s WHERE id=%s", (lang, tid))
            script_hits += 1
    cur.execute("UPDATE tracks SET language='english' WHERE language IS NULL")
    conn.commit()

    cur.execute("SELECT COUNT(*) FROM tracks WHERE language != 'english'")
    non_en = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM tracks")
    total  = cur.fetchone()[0]
    cur.close(); conn.close()

    return {
        "setup":               "complete",
        "script_detected":     script_hits,
        "non_english_tracks":  non_en,
        "total_tracks":        total,
        "tip": "Call POST /playlists/enrich-language to also catch romanized tracks (uses Last.fm, ~2 min)"
    }


LASTFM_LANG_MAP = [
    # Bengali — rabindra sangeet / adhunik / baul are exclusively Bengali genres
    (["bengali", "bangla", "bangladeshi", "rabindra sangeet", "nazrul geeti",
      "baul", "adhunik", "modern bengali", "bengali folk", "bengali music"], "bengali"),
    # Hindi — bollywood / filmi are strong language signals
    (["hindi", "bollywood", "desi", "indian pop", "filmi", "playback singer",
      "hindustani", "hindi film", "hindi music", "indian film music",
      "classic bollywood", "old bollywood"], "hindi"),
    # Punjabi
    (["punjabi", "bhangra", "punjabi pop", "giddha"], "punjabi"),
    # Arabic — oud/tarab are specifically Arabic music terms
    (["arabic", "arab", "khaleeji", "egyptian", "levantine", "maghreb",
      "shaabi", "tarab", "arabic pop", "arabic music", "gulf music"], "arabic"),
    # Spanish — avoid bare "latin" / "flamenco" (English artists use them too)
    (["spanish", "reggaeton", "cumbia", "salsa", "bachata", "merengue",
      "latin pop", "spanish language", "musica latina"], "spanish"),
    # French — NEVER use plain "chanson" (applied to English singer-songwriters)
    (["french", "chanson française", "variété française",
      "french pop", "french music", "french hip-hop", "french electronic",
      "musique française"], "french"),
    # Portuguese — NEVER use "bossa nova" alone (Japanese/English artists play it)
    (["portuguese", "sertanejo", "forro", "axe", "pagode",
      "musica portuguesa", "mpb", "portuguese music"], "portuguese"),
    # South Indian
    (["tamil", "kollywood", "carnatic", "tamil film music"],  "tamil"),
    (["telugu", "tollywood", "telugu film music"],             "telugu"),
    (["kannada", "sandalwood"],                                "kannada"),
    (["malayalam", "mollywood"],                               "malayalam"),
    # Urdu — ghazal/qawwali are uniquely South Asian; avoid plain "sufi"
    (["urdu", "ghazal", "qawwali"],                            "urdu"),
]
SKIP_TAGS = {"seen live", "albums i own", "favorites", "love", "awesome",
             "favorite", "spotify", "all", "under 2000 listeners"}


@router.post("/enrich-language")
def enrich_language(
    user_id: str = Query("0tz6fep2m5bx1vq85g48518u9"),
    limit:   int = Query(2000, description="Max artists to check. Default covers full library."),
):
    """
    Use Last.fm artist tags to detect language for romanized non-English tracks.
    Uses exact artist name matching to prevent false positives.
    Safe to re-run — only updates tracks currently tagged 'english'.
    """
    if not LASTFM:
        return {"error": "LASTFM_API_KEY not configured"}

    conn = get_conn(); cur = conn.cursor()
    cur.execute("""
        SELECT artist, COUNT(*) c FROM tracks
        WHERE user_id=%s GROUP BY artist ORDER BY c DESC LIMIT %s
    """, (user_id, limit))
    artists = cur.fetchall()
    total_artists = len(artists)

    enriched_tracks, enriched_artists = 0, []
    for artist, _ in artists:
        try:
            resp = requests.get("http://ws.audioscrobbler.com/2.0/", params={
                "method": "artist.getTopTags", "artist": artist,
                "api_key": LASTFM, "format": "json",
            }, timeout=4)
            tags = [t["name"].lower()
                    for t in resp.json().get("toptags", {}).get("tag", [])[:15]
                    if t["name"].lower() not in SKIP_TAGS]
        except Exception:
            continue

        for keywords, lang in LASTFM_LANG_MAP:
            if any(k in tags for k in keywords):
                # Exact match — LIKE '%artist%' caused false positives on substrings
                cur.execute("""
                    UPDATE tracks SET language=%s
                    WHERE LOWER(artist) = %s AND language='english'
                """, (lang, artist.lower()))
                if cur.rowcount:
                    enriched_tracks += cur.rowcount
                    enriched_artists.append(f"{artist} → {lang}")
                break

    conn.commit(); cur.close(); conn.close()
    return {
        "artists_checked": total_artists,
        "enriched_tracks":  enriched_tracks,
        "enriched_artists": enriched_artists,
    }


@router.get("/languages")
def library_languages(user_id: str = Query("0tz6fep2m5bx1vq85g48518u9")):
    conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute("""
            SELECT language, COUNT(*) FROM tracks
            WHERE user_id=%s GROUP BY language ORDER BY COUNT(*) DESC
        """, (user_id,))
        rows = cur.fetchall()
    except Exception:
        cur.close(); conn.close()
        return {"error": "Run POST /playlists/setup first"}
    cur.close(); conn.close()
    return {"languages": [{"language": r[0] or "unknown", "count": r[1]} for r in rows]}


# ─── Preview ──────────────────────────────────────────────────────────────────

@router.post("/preview")
def preview(body: PreviewBody):
    conn = get_conn(); cur = conn.cursor()
    query, params = build_query(
        body.conditions, body.excludes,
        body.user_id, body.sort_by, body.sort_order, body.limit,
    )
    try:
        cur.execute(query, params)
    except Exception as e:
        cur.close(); conn.close()
        if "language" in str(e).lower():
            return {"error": "Language column not set up — call POST /playlists/setup first."}
        raise
    tracks = rows_to_tracks(cur.fetchall())
    if body.sort_by == "cohesion":
        tracks = rank_by_cohesion(tracks, cur, body.user_id)
    cur.close(); conn.close()
    return {"tracks": tracks, "stats": compute_stats(tracks)}


# ─── List / create / update / delete ────────────────────────────────────────

@router.get("/")
def list_playlists(user_id: str = Query("0tz6fep2m5bx1vq85g48518u9")):
    conn = get_conn(); cur = conn.cursor()
    try:
        cur.execute("""
            SELECT id, name, rule_json,
                   spotify_playlist_id, spotify_playlist_url,
                   rotation_enabled, rotation_size, rotation_source,
                   last_rotated_at, last_synced_at, created_at
              FROM smart_playlists
             WHERE user_id=%s ORDER BY created_at DESC
        """, (user_id,))
    except Exception as e:
        cur.close(); conn.close()
        return {"error": "Run POST /playlists/setup first", "detail": str(e)}
    rows = cur.fetchall()
    cur.close(); conn.close()
    return {"playlists": [{
        "id":                   r[0],  "name":                 r[1],
        "rule":                 json.loads(r[2]),
        "spotify_playlist_id":  r[3],  "spotify_playlist_url": r[4],
        "rotation_enabled":     r[5],  "rotation_size":        r[6],
        "rotation_source":      r[7],
        "last_rotated_at":      str(r[8])[:16]  if r[8] else None,
        "last_synced_at":       str(r[9])[:16]  if r[9] else None,
        "created_at":           str(r[10])[:10],
    } for r in rows]}


@router.post("/")
def create_playlist(body: SaveBody):
    mode = (body.spotify_mode or "new").lower()
    playlist_id = normalize_playlist_id(body.playlist_id)
    playlist_url = None
    track_ids = []

    if mode == "none":
        playlist_id = None
    elif mode == "existing" and not playlist_id:
        return {"error": "Paste a Spotify playlist ID or URL, or choose Save rule only."}
    elif mode == "new" and not body.playlist_name:
        return {"error": "Enter a Spotify playlist name, or choose Save rule only."}

    rule = {
        "conditions":            body.conditions,
        "excludes":              body.excludes,
        "sort_by":               body.sort_by,
        "sort_order":            body.sort_order,
        "limit":                 body.limit,
        "rotation_interval_days": body.rotation_interval_days,
    }
    rule_json = json.dumps(rule)

    if mode != "none":
        conn0 = get_conn(); cur0 = conn0.cursor()
        try:
            track_ids = query_track_ids(rule, body.user_id, cur0)
        except Exception as e:
            cur0.close(); conn0.close()
            if "language" in str(e).lower():
                return {"error": "Run POST /playlists/setup first"}
            return {"error": f"Could not run playlist rule: {e}"}
        cur0.close(); conn0.close()

    if mode == "new" and body.playlist_name:
        try:
            sp          = get_spotify()
            pl          = spotify_api.create_playlist(
                sp, body.playlist_name, public=False,
                description=f"Managed by Fidolio — rule: {body.name}",
            )
            playlist_id  = pl["id"]
            playlist_url = pl["url"]
        except Exception as e:
            return {"error": spotify_error(e)}
    elif playlist_id:
        playlist_url = make_playlist_url(playlist_id)

    effective_rotation = body.rotation_enabled and bool(playlist_id)

    conn = get_conn(); cur = conn.cursor()
    cur.execute("""
        INSERT INTO smart_playlists
            (user_id, name, rule_json,
             spotify_playlist_id, spotify_playlist_url,
             rotation_enabled, rotation_size, rotation_source, created_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,NOW()) RETURNING id
    """, (body.user_id, body.name, rule_json,
          playlist_id, playlist_url,
          effective_rotation, body.rotation_size, body.rotation_source))
    new_id = cur.fetchone()[0]
    conn.commit(); cur.close(); conn.close()

    # Immediately fill the Spotify playlist
    if playlist_id:
        try:
            sp = locals().get("sp") or get_spotify()
            replace_spotify_playlist(sp, playlist_id, track_ids)
        except Exception as e:
            return {
                "id": new_id,
                "playlist_id": playlist_id,
                "playlist_url": playlist_url,
                "error": spotify_error(e),
            }

        conn3 = get_conn(); cur3 = conn3.cursor()
        cur3.execute(
            "UPDATE smart_playlists SET last_synced_at=NOW() WHERE id=%s", (new_id,)
        )
        conn3.commit(); cur3.close(); conn3.close()

    return {
        "id":           new_id,
        "playlist_id":  playlist_id,
        "playlist_url": playlist_url,
        "synced":       len(track_ids) if playlist_id else 0,
        "message":      "Created and synced" if playlist_id else "Rule saved (no Spotify playlist linked)",
    }


@router.put("/{smart_id}")
def update_playlist(smart_id: int, body: SaveBody):
    mode = (body.spotify_mode or "keep").lower()
    incoming_pid = normalize_playlist_id(body.playlist_id)
    rule = {
        "conditions":            body.conditions,
        "excludes":              body.excludes,
        "sort_by":               body.sort_by,
        "sort_order":            body.sort_order,
        "limit":                 body.limit,
        "rotation_interval_days": body.rotation_interval_days,
    }
    rule_json = json.dumps(rule)
    conn = get_conn(); cur = conn.cursor()
    # Get existing spotify_playlist_id before updating
    cur.execute("SELECT spotify_playlist_id, spotify_playlist_url FROM smart_playlists WHERE id=%s AND user_id=%s",
                (smart_id, body.user_id))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        return {"error": "Not found"}
    existing_pid = row[0]
    existing_url = row[1]

    new_pid = existing_pid
    new_url = existing_url
    sp = None
    pending_track_ids = None

    if mode == "none":
        new_pid = None
        new_url = None
    elif mode == "existing":
        if not incoming_pid:
            cur.close(); conn.close()
            return {"error": "Paste a Spotify playlist ID or URL, or choose Save rule only."}
        new_pid = incoming_pid
        new_url = make_playlist_url(new_pid)
    elif mode == "new":
        if body.playlist_name:
            connq = get_conn(); curq = connq.cursor()
            try:
                pending_track_ids = query_track_ids(rule, body.user_id, curq)
            except Exception as e:
                curq.close(); connq.close(); cur.close(); conn.close()
                if "language" in str(e).lower():
                    return {"error": "Run POST /playlists/setup first"}
                return {"error": f"Could not run playlist rule: {e}"}
            curq.close(); connq.close()

            sp = get_spotify()
            pl = spotify_api.create_playlist(
                sp, body.playlist_name, public=False,
                description=f"Managed by Fidolio — rule: {body.name}",
            )
            new_pid = pl["id"]
            new_url = pl["url"]
        elif not new_pid:
            cur.close(); conn.close()
            return {"error": "Enter a Spotify playlist name, link an existing playlist, or save rule only."}

    effective_rotation = body.rotation_enabled and bool(new_pid)

    cur.execute("""
        UPDATE smart_playlists
           SET name=%s, rule_json=%s,
               rotation_enabled=%s, rotation_size=%s, rotation_source=%s,
               spotify_playlist_id=%s, spotify_playlist_url=%s
         WHERE id=%s AND user_id=%s
    """, (body.name, rule_json,
          effective_rotation, body.rotation_size, body.rotation_source,
          new_pid, new_url,
          smart_id, body.user_id))
    conn.commit(); cur.close(); conn.close()

    # Auto-sync to Spotify if a playlist is linked
    synced = 0
    if new_pid:
        try:
            conn2 = get_conn(); cur2 = conn2.cursor()
            track_ids = pending_track_ids
            if track_ids is None:
                track_ids = query_track_ids(rule, body.user_id, cur2)
            cur2.close(); conn2.close()

            sp = sp or get_spotify()
            replace_spotify_playlist(sp, new_pid, track_ids)
            synced = len(track_ids)

            conn3 = get_conn(); cur3 = conn3.cursor()
            cur3.execute("UPDATE smart_playlists SET last_synced_at=NOW() WHERE id=%s", (smart_id,))
            conn3.commit(); cur3.close(); conn3.close()
        except Exception as e:
            return {"updated": True, "synced": 0, "sync_error": str(e)}

    return {"updated": True, "synced": synced, "playlist_id": new_pid, "playlist_url": new_url}


@router.delete("/{smart_id}")
def delete_playlist(smart_id: int, user_id: str = Query("0tz6fep2m5bx1vq85g48518u9")):
    conn = get_conn(); cur = conn.cursor()
    cur.execute("DELETE FROM smart_playlists WHERE id=%s AND user_id=%s", (smart_id, user_id))
    conn.commit(); cur.close(); conn.close()
    return {"deleted": True}


# ─── Sync ─────────────────────────────────────────────────────────────────────

@router.post("/{smart_id}/sync")
def sync_playlist(smart_id: int, user_id: str = Query("0tz6fep2m5bx1vq85g48518u9")):
    """Re-run the rule and replace the linked Spotify playlist entirely."""
    conn = get_conn(); cur = conn.cursor()
    cur.execute("""
        SELECT user_id, rule_json, spotify_playlist_id
          FROM smart_playlists WHERE id=%s AND user_id=%s
    """, (smart_id, user_id))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close(); return {"error": "Not found"}
    uid, rule_json, spotify_pid = row
    if not spotify_pid:
        cur.close(); conn.close(); return {"error": "No Spotify playlist linked"}

    rule = json.loads(rule_json)
    try:
        track_ids = query_track_ids(rule, uid, cur)
    except Exception as e:
        cur.close(); conn.close()
        if "language" in str(e).lower():
            return {"error": "Run POST /playlists/setup first"}
        raise
    cur.close(); conn.close()

    try:
        sp = get_spotify()
        replace_spotify_playlist(sp, spotify_pid, track_ids)
    except Exception as e:
        return {"error": spotify_error(e)}

    conn2 = get_conn(); cur2 = conn2.cursor()
    cur2.execute("UPDATE smart_playlists SET last_synced_at=NOW() WHERE id=%s", (smart_id,))
    conn2.commit(); cur2.close(); conn2.close()
    return {
        "synced": len(track_ids),
        "message": "Playlist cleared because no tracks matched" if not track_ids else "Playlist synced",
    }


# ─── Rotate ───────────────────────────────────────────────────────────────────

@router.post("/{smart_id}/rotate")
def rotate_playlist(smart_id: int, body: RotateBody):
    """
    Swap the lowest-scoring tracks for fresh ones that still fit the playlist's vibe.

    rotation_source:
      library  – re-runs the saved rule, gets library tracks not yet in playlist
      similar  – adds tracks from Last.fm similar-artists found in your library
      discover – adds ReccoBeats recommendations (can include non-library tracks)
    """
    conn = get_conn(); cur = conn.cursor()
    cur.execute("""
        SELECT user_id, rule_json, spotify_playlist_id,
               rotation_size, rotation_source
          FROM smart_playlists WHERE id=%s AND user_id=%s
    """, (smart_id, body.user_id))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close(); return {"error": "Not found"}

    uid, rule_json, spotify_pid, default_size, default_source = row
    rule       = json.loads(rule_json)
    rot_size   = body.rotation_size   or default_size   or 5
    rot_source = body.rotation_source or default_source or "library"

    if not spotify_pid:
        cur.close(); conn.close(); return {"error": "No Spotify playlist linked"}
    cur.close(); conn.close()

    try:
        sp = get_spotify()
        current_tracks = fetch_spotify_tracks(sp, spotify_pid)
    except Exception as e:
        return {"error": spotify_error(e)}

    if len(current_tracks) <= rot_size:
        return {"error": f"Playlist has {len(current_tracks)} tracks — need > {rot_size} to rotate"}

    current_ids = {t["id"] for t in current_tracks}

    # Audio profile of the existing playlist (used for scoring candidates)
    conn2 = get_conn(); cur2 = conn2.cursor()
    profile = profile_of(current_ids, cur2)

    # Score every current track → eject the worst fitting ones
    scored = sorted(
        [(t, taste_score(t["id"], profile, cur2)) for t in current_tracks],
        key=lambda x: x[1],
    )
    to_eject    = [t for t, _ in scored[:rot_size]]
    eject_ids   = {t["id"] for t in to_eject}
    eject_names = [
        f"{t['name']} – {t['artists'][0]['name'] if t.get('artists') else ''}"
        for t in to_eject
    ]

    # ── Gather replacement candidates ─────────────────────────────────────────
    candidates = []   # ordered list of track IDs

    if rot_source in ("library", "similar"):
        query, params = build_query(
            rule.get("conditions", []), rule.get("excludes", []),
            uid, "energy", "desc", 1000,
        )
        try:
            cur2.execute(query, params)
            lib_pool = [r[0] for r in cur2.fetchall() if r[0] not in current_ids]
        except Exception:
            lib_pool = []
        # Best-fitting library tracks first
        scored_pool = sorted(
            [(tid, taste_score(tid, profile, cur2)) for tid in lib_pool],
            key=lambda x: -x[1],
        )
        candidates.extend(tid for tid, _ in scored_pool[:rot_size * 5])

    if rot_source in ("similar", "discover"):
        playlist_artists = list({
            t["artists"][0]["name"]
            for t in current_tracks if t.get("artists")
        })[:8]

        if LASTFM:
            similar = set()
            for artist in playlist_artists[:5]:
                try:
                    resp = requests.get("http://ws.audioscrobbler.com/2.0/", params={
                        "method": "artist.getSimilar", "artist": artist,
                        "limit": 8, "api_key": LASTFM, "format": "json",
                    }, timeout=5)
                    for s in resp.json().get("similarartists", {}).get("artist", [])[:6]:
                        similar.add(s["name"])
                except Exception:
                    pass

            for sim in list(similar)[:20]:
                cur2.execute("""
                    SELECT id FROM tracks
                    WHERE user_id=%s AND LOWER(artist) LIKE %s AND energy IS NOT NULL
                    ORDER BY RANDOM() LIMIT 4
                """, (uid, f"%{sim.lower()}%"))
                for r in cur2.fetchall():
                    if r[0] not in current_ids:
                        candidates.append(r[0])

    if rot_source == "discover":
        seed_ids = [t["id"] for t in current_tracks[:5]]
        try:
            rb_p = [("size", rot_size * 4)] + [("seeds", s) for s in seed_ids[:5]]
            for k, v in profile.items():
                if k != "tempo":
                    rb_p.append((k, round(v, 3)))
            rb_resp = requests.get(f"{RB_BASE}/track/recommendation", params=rb_p, timeout=20)
            if rb_resp.status_code == 200:
                for t in rb_resp.json().get("content", []):
                    href = t.get("href", "")
                    if "spotify.com/track/" in href:
                        sid = href.split("spotify.com/track/")[-1].split("?")[0]
                        if sid not in current_ids:
                            candidates.append(sid)
        except Exception:
            pass

    cur2.close(); conn2.close()

    # Deduplicate, keeping order
    seen, unique = set(), []
    for c in candidates:
        if c not in seen and c not in current_ids and c not in eject_ids:
            seen.add(c); unique.append(c)

    if len(unique) < rot_size:
        return {
            "error": (
                f"Only found {len(unique)} replacement tracks (need {rot_size}). "
                "Try 'similar' or 'discover' mode, or reduce rotation size."
            )
        }

    replacements = unique[:rot_size]

    try:
        spotify_api.remove_items(
            sp, spotify_pid, [f"spotify:track:{t}" for t in eject_ids]
        )
        spotify_api.add_items(
            sp, spotify_pid, [f"spotify:track:{r}" for r in replacements]
        )
    except Exception as e:
        return {"error": spotify_error(e)}

    conn3 = get_conn(); cur3 = conn3.cursor()
    added_names = []
    for tid in replacements:
        cur3.execute("SELECT name, artist FROM tracks WHERE id=%s", (tid,))
        r = cur3.fetchone()
        added_names.append(f"{r[0]} – {r[1]}" if r else tid)
    cur3.execute("UPDATE smart_playlists SET last_rotated_at=NOW() WHERE id=%s", (smart_id,))
    conn3.commit(); cur3.close(); conn3.close()

    return {
        "rotated":         rot_size,
        "rotation_source": rot_source,
        "removed":         eject_names,
        "added":           added_names,
    }


# ─── Auto-rotation scheduler endpoints ───────────────────────────────────────

@router.get("/rotation-due")
def rotation_due(user_id: str = Query("0tz6fep2m5bx1vq85g48518u9")):
    conn = get_conn(); cur = conn.cursor()
    cur.execute("""
        SELECT id, name, spotify_playlist_id, rotation_size,
               rotation_source, last_rotated_at, rule_json
          FROM smart_playlists
         WHERE user_id = %s AND rotation_enabled = TRUE
           AND spotify_playlist_id IS NOT NULL
    """, (user_id,))
    rows = cur.fetchall()
    cur.close(); conn.close()
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    due = []
    for r in rows:
        pid, name, spid, rot_size, rot_source, last_rotated, rule_json_str = r
        try:
            rule = json.loads(rule_json_str or "{}")
        except Exception:
            rule = {}
        interval_days = rule.get("rotation_interval_days", 7)
        if last_rotated is None:
            days_since = None
            is_due = True
        else:
            lr = last_rotated.replace(tzinfo=timezone.utc) if last_rotated.tzinfo is None else last_rotated
            days_since = (now - lr).days
            is_due = days_since >= interval_days
        if is_due:
            due.append({
                "id": pid, "name": name, "spotify_playlist_id": spid,
                "rotation_size": rot_size or 5, "rotation_source": rot_source or "library",
                "last_rotated_at": str(last_rotated)[:16] if last_rotated else None,
                "days_since": days_since, "interval_days": interval_days,
            })
    return {"due": due, "count": len(due)}


@router.post("/run-auto-rotations")
def run_auto_rotations(user_id: str = Query("0tz6fep2m5bx1vq85g48518u9")):
    due_resp = rotation_due(user_id=user_id)
    due_list = due_resp.get("due", [])
    if not due_list:
        return {"message": "No playlists due for rotation", "results": []}
    results = []
    for pl in due_list:
        body = RotateBody(
            user_id=user_id,
            rotation_size=pl["rotation_size"],
            rotation_source=pl["rotation_source"],
        )
        try:
            result = rotate_playlist(pl["id"], body)
            if "error" in result:
                results.append({"id": pl["id"], "name": pl["name"], "status": "error", "error": result["error"]})
            else:
                results.append({"id": pl["id"], "name": pl["name"], "status": "rotated",
                    "rotated": result["rotated"], "removed": result["removed"], "added": result["added"]})
        except Exception as e:
            results.append({"id": pl["id"], "name": pl["name"], "status": "error", "error": str(e)})
    ok  = [r for r in results if r["status"] == "rotated"]
    err = [r for r in results if r["status"] == "error"]
    return {"message": f"Rotated {len(ok)} playlist(s), {len(err)} error(s)",
            "results": results, "ok_count": len(ok), "err_count": len(err)}


@router.get("/{smart_id}/rotation-status")
def rotation_status(smart_id: int, user_id: str = Query("0tz6fep2m5bx1vq85g48518u9")):
    conn = get_conn(); cur = conn.cursor()
    cur.execute("""
        SELECT rotation_enabled, rotation_size, rotation_source,
               last_rotated_at, rule_json
          FROM smart_playlists WHERE id = %s AND user_id = %s
    """, (smart_id, user_id))
    row = cur.fetchone()
    cur.close(); conn.close()
    if not row:
        return {"error": "Not found"}
    enabled, rot_size, rot_source, last_rotated, rule_json_str = row
    if not enabled:
        return {"rotation_enabled": False}
    try:
        rule = json.loads(rule_json_str or "{}")
    except Exception:
        rule = {}
    interval_days = rule.get("rotation_interval_days", 7)
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    if last_rotated is None:
        days_since = None; days_until = 0; is_due = True
        status_text = "Never rotated — ready now"
    else:
        lr = last_rotated.replace(tzinfo=timezone.utc) if last_rotated.tzinfo is None else last_rotated
        days_since = (now - lr).days
        days_until = max(0, interval_days - days_since)
        is_due = days_until == 0
        status_text = "Rotation due now" if is_due else ("Rotates tomorrow" if days_until == 1 else f"Rotates in {days_until} days")
    return {
        "rotation_enabled": True, "rotation_size": rot_size or 5,
        "rotation_source": rot_source or "library", "interval_days": interval_days,
        "last_rotated_at": str(last_rotated)[:16] if last_rotated else None,
        "days_since": days_since, "days_until": days_until,
        "is_due": is_due, "status_text": status_text,
    }
