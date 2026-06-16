from fastapi import APIRouter, Query
import psycopg2
import os
import calendar
from datetime import datetime
from dotenv import load_dotenv

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


def get_spotify():
    import spotipy
    from spotipy.oauth2 import SpotifyOAuth
    cache = os.path.abspath(
        os.path.join(os.path.dirname(__file__), '..', '..', '..', '.cache')
    )
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

    try:
        if existing and existing[0]:
            playlist_id  = existing[0]
            playlist_url = existing[1]
            # Replace contents to reflect current saves
            sp.playlist_replace_items(playlist_id, [])
            for i in range(0, len(track_ids), 100):
                sp.playlist_add_items(playlist_id,
                    [f"spotify:track:{t}" for t in track_ids[i:i+100]])
            status = "synced"
        else:
            me = sp.current_user()
            pl = sp.user_playlist_create(
                me["id"], pl_name, public=False,
                description=f"Everything you saved in {month_name} {year} — auto-built by Fidolio",
            )
            playlist_id  = pl["id"]
            playlist_url = pl["external_urls"]["spotify"]
            for i in range(0, len(track_ids), 100):
                sp.playlist_add_items(playlist_id,
                    [f"spotify:track:{t}" for t in track_ids[i:i+100]])
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
    min_days: int = Query(365)
):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("""
        SELECT t.id, t.name, t.artist, t.saved_at, t.energy, t.valence
        FROM tracks t
        LEFT JOIN listening_history lh ON lh.track_id = t.id
        WHERE t.user_id = %s
          AND lh.id IS NULL
          AND t.saved_at < NOW() - INTERVAL '1 day' * %s
        ORDER BY t.saved_at ASC
        LIMIT 50
    """, (user_id, min_days))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return {"dead_saves": [
        {
            "id": r[0], "name": r[1], "artist": r[2],
            "saved_at": str(r[3])[:10], "energy": r[4], "valence": r[5]
        }
        for r in rows
    ]}

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