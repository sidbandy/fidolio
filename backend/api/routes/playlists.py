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

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

router  = APIRouter()
DB_URL  = os.getenv("DATABASE_URL")
LASTFM  = os.getenv("LASTFM_API_KEY")
RB_BASE = "https://api.reccobeats.com/v1"
CACHE   = os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..', '..', '..', '.cache')
)
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

    parts, params = ["user_id = %s", "energy IS NOT NULL"], [user_id]

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
        "energy":       round(float(r[4]), 2)  if r[4] else None,
        "valence":      round(float(r[5]), 2)  if r[5] else None,
        "tempo":        round(float(r[6]), 1)  if r[6] else None,
        "danceability": round(float(r[7]), 2)  if r[7] else None,
        "acousticness": round(float(r[8]), 2)  if r[8] else None,
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


def fetch_spotify_tracks(sp, playlist_id):
    tracks, offset = [], 0
    while True:
        resp = sp.playlist_items(
            playlist_id,
            fields="items(track(id,name,artists)),next",
            limit=100, offset=offset,
        )
        for item in resp.get("items", []):
            t = item.get("track")
            if t and t.get("id"):
                tracks.append(t)
        if not resp.get("next"):
            break
        offset += 100
    return tracks


# ─── Request models ───────────────────────────────────────────────────────────

class PreviewBody(BaseModel):
    conditions:  list = []
    excludes:    list = []
    sort_by:     str  = "saved_at"
    sort_order:  str  = "desc"
    limit:       int  = 200
    user_id:     str  = "0tz6fep2m5bx1vq85g48518u9"

class SaveBody(PreviewBody):
    name:             str
    playlist_name:    Optional[str] = None   # create new Spotify playlist with this name
    playlist_id:      Optional[str] = None   # OR link to existing playlist
    rotation_enabled: bool = False
    rotation_size:    int  = 5
    rotation_source:  str  = "library"       # library | similar | discover

class RotateBody(BaseModel):
    user_id:         str           = "0tz6fep2m5bx1vq85g48518u9"
    rotation_size:   Optional[int] = None    # override saved default
    rotation_source: Optional[str] = None    # override saved default


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
    sp           = get_spotify()
    playlist_id  = body.playlist_id
    playlist_url = None

    if not playlist_id and body.playlist_name:
        me          = sp.current_user()
        pl          = sp.user_playlist_create(
            me["id"], body.playlist_name, public=False,
            description=f"Managed by Fidolio — rule: {body.name}",
        )
        playlist_id  = pl["id"]
        playlist_url = pl["external_urls"]["spotify"]
    elif playlist_id:
        playlist_url = f"https://open.spotify.com/playlist/{playlist_id}"

    rule_json = json.dumps({
        "conditions": body.conditions,
        "excludes":   body.excludes,
        "sort_by":    body.sort_by,
        "sort_order": body.sort_order,
        "limit":      body.limit,
    })

    conn = get_conn(); cur = conn.cursor()
    cur.execute("""
        INSERT INTO smart_playlists
            (user_id, name, rule_json,
             spotify_playlist_id, spotify_playlist_url,
             rotation_enabled, rotation_size, rotation_source, created_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,NOW()) RETURNING id
    """, (body.user_id, body.name, rule_json,
          playlist_id, playlist_url,
          body.rotation_enabled, body.rotation_size, body.rotation_source))
    new_id = cur.fetchone()[0]
    conn.commit(); cur.close(); conn.close()

    # Immediately fill the Spotify playlist
    if playlist_id:
        conn2 = get_conn(); cur2 = conn2.cursor()
        query, params = build_query(
            body.conditions, body.excludes,
            body.user_id, body.sort_by, body.sort_order, body.limit,
        )
        try:
            cur2.execute(query, params)
            track_ids = [r[0] for r in cur2.fetchall()]
        except Exception:
            track_ids = []
        cur2.close(); conn2.close()

        if track_ids:
            sp.playlist_replace_items(playlist_id, [])
            for i in range(0, len(track_ids), 100):
                sp.playlist_add_items(
                    playlist_id,
                    [f"spotify:track:{t}" for t in track_ids[i:i+100]],
                )

        conn3 = get_conn(); cur3 = conn3.cursor()
        cur3.execute(
            "UPDATE smart_playlists SET last_synced_at=NOW() WHERE id=%s", (new_id,)
        )
        conn3.commit(); cur3.close(); conn3.close()

    return {
        "id":           new_id,
        "playlist_id":  playlist_id,
        "playlist_url": playlist_url,
        "message":      "Created and synced" if playlist_id else "Rule saved (no Spotify playlist linked)",
    }


@router.put("/{smart_id}")
def update_playlist(smart_id: int, body: SaveBody):
    rule_json = json.dumps({
        "conditions": body.conditions, "excludes":   body.excludes,
        "sort_by":    body.sort_by,    "sort_order": body.sort_order,
        "limit":      body.limit,
    })
    conn = get_conn(); cur = conn.cursor()
    # Get existing spotify_playlist_id before updating
    cur.execute("SELECT spotify_playlist_id FROM smart_playlists WHERE id=%s AND user_id=%s",
                (smart_id, body.user_id))
    row = cur.fetchone()
    existing_pid = row[0] if row else None

    new_pid = body.playlist_id or existing_pid

    cur.execute("""
        UPDATE smart_playlists
           SET name=%s, rule_json=%s,
               rotation_enabled=%s, rotation_size=%s, rotation_source=%s,
               spotify_playlist_id=COALESCE(%s, spotify_playlist_id)
         WHERE id=%s AND user_id=%s
    """, (body.name, rule_json,
          body.rotation_enabled, body.rotation_size, body.rotation_source,
          body.playlist_id,
          smart_id, body.user_id))
    conn.commit(); cur.close(); conn.close()

    # Auto-sync to Spotify if a playlist is linked
    synced = 0
    if new_pid:
        try:
            conn2 = get_conn(); cur2 = conn2.cursor()
            query, params = build_query(
                body.conditions, body.excludes,
                body.user_id, body.sort_by, body.sort_order, body.limit,
            )
            cur2.execute(query, params)
            track_ids = [r[0] for r in cur2.fetchall()]
            cur2.close(); conn2.close()

            if track_ids:
                sp = get_spotify()
                sp.playlist_replace_items(new_pid, [])
                for i in range(0, len(track_ids), 100):
                    sp.playlist_add_items(
                        new_pid, [f"spotify:track:{t}" for t in track_ids[i:i+100]]
                    )
                synced = len(track_ids)

            conn3 = get_conn(); cur3 = conn3.cursor()
            cur3.execute("UPDATE smart_playlists SET last_synced_at=NOW() WHERE id=%s", (smart_id,))
            conn3.commit(); cur3.close(); conn3.close()
        except Exception as e:
            return {"updated": True, "synced": 0, "sync_error": str(e)}

    return {"updated": True, "synced": synced}


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
    query, params = build_query(
        rule.get("conditions", []), rule.get("excludes", []),
        uid, rule.get("sort_by", "saved_at"),
        rule.get("sort_order", "desc"), rule.get("limit", 200),
    )
    try:
        cur.execute(query, params)
        track_ids = [r[0] for r in cur.fetchall()]
    except Exception as e:
        cur.close(); conn.close()
        if "language" in str(e).lower():
            return {"error": "Run POST /playlists/setup first"}
        raise
    cur.close(); conn.close()

    if not track_ids:
        return {"synced": 0, "message": "No matching tracks — playlist unchanged"}

    sp = get_spotify()
    try:
        sp.playlist_replace_items(spotify_pid, [])
        for i in range(0, len(track_ids), 100):
            sp.playlist_add_items(
                spotify_pid, [f"spotify:track:{t}" for t in track_ids[i:i+100]]
            )
    except Exception as e:
        return {"error": str(e)}

    conn2 = get_conn(); cur2 = conn2.cursor()
    cur2.execute("UPDATE smart_playlists SET last_synced_at=NOW() WHERE id=%s", (smart_id,))
    conn2.commit(); cur2.close(); conn2.close()
    return {"synced": len(track_ids)}


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

    sp = get_spotify()
    try:
        current_tracks = fetch_spotify_tracks(sp, spotify_pid)
    except Exception as e:
        return {"error": f"Could not read playlist: {e}"}

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

    sp.playlist_remove_all_occurrences_of_items(
        spotify_pid, [f"spotify:track:{t}" for t in eject_ids]
    )
    sp.playlist_add_items(
        spotify_pid, [f"spotify:track:{r}" for r in replacements]
    )

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
