from fastapi import APIRouter, Query
import psycopg2
import os
import calendar
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))
router = APIRouter()
DB_URL = os.getenv("DATABASE_URL")

def get_conn():
    return psycopg2.connect(DB_URL)

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
        filters.append("EXTRACT(year FROM saved_at) >= %s")
        params.append(min_year)
    if max_year:
        filters.append("EXTRACT(year FROM saved_at) <= %s")
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
               tempo, energy, valence, danceability, acousticness
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
                "spotify_url":  f"https://open.spotify.com/track/{r[0]}"
            }
            for r in rows
        ]
    }

@router.post("/time-capsule")
def create_time_capsule(
    year:    int = Query(...),
    month:   int = Query(...),
    user_id: str = Query("0tz6fep2m5bx1vq85g48518u9")
):
    import sys
    sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))
    import spotipy
    from spotipy.oauth2 import SpotifyOAuth

    SCOPE = " ".join([
        "user-library-read", "user-read-recently-played", "user-top-read",
        "playlist-read-private", "playlist-modify-public", "playlist-modify-private",
        "user-read-currently-playing", "user-read-playback-state",
    ])
    cache_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), '..', '..', '..', '.cache')
    )
    auth = SpotifyOAuth(
        client_id=os.getenv("SPOTIFY_CLIENT_ID"),
        client_secret=os.getenv("SPOTIFY_CLIENT_SECRET"),
        redirect_uri=os.getenv("SPOTIFY_REDIRECT_URI"),
        scope=SCOPE, open_browser=False, cache_path=cache_path
    )
    sp = spotipy.Spotify(auth_manager=auth)

    conn = get_conn()
    cur  = conn.cursor()
    last_day  = calendar.monthrange(year, month)[1]
    month_str = f"{year}-{str(month).zfill(2)}"

    cur.execute("""
        SELECT id FROM tracks
        WHERE user_id = %s
          AND saved_at >= %s AND saved_at <= %s
        ORDER BY saved_at ASC
    """, (user_id, f"{month_str}-01", f"{month_str}-{last_day}"))
    track_ids = [r[0] for r in cur.fetchall()]
    cur.close()
    conn.close()

    if not track_ids:
        return {"success": False, "message": f"No songs saved in {month_str}"}

    month_name    = calendar.month_name[month]
    playlist_name = f"Fidolio: {month_name} {year}"

    try:
        sp_user  = sp.current_user()
        playlist = sp.user_playlist_create(
            sp_user["id"], playlist_name, public=False,
            description=f"Songs saved in {month_name} {year} — created by Fidolio"
        )
        for i in range(0, len(track_ids), 100):
            batch = [f"spotify:track:{tid}" for tid in track_ids[i:i+100]]
            sp.playlist_add_items(playlist["id"], batch)

        return {
            "success":      True,
            "playlist_name": playlist_name,
            "track_count":  len(track_ids),
            "playlist_url": playlist["external_urls"]["spotify"]
        }
    except Exception as e:
        return {"success": False, "message": str(e)}