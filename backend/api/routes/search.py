from fastapi import APIRouter, Query
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
router = APIRouter()
DB_URL = os.getenv("DATABASE_URL")

def get_conn():
    return psycopg2.connect(DB_URL)

@router.get("/")
def search_library(
    q: str = Query(None),
    min_tempo: float = Query(None),
    max_tempo: float = Query(None),
    min_energy: float = Query(None),
    max_energy: float = Query(None),
    min_valence: float = Query(None),
    max_valence: float = Query(None),
    min_acousticness: float = Query(None),
    artist: str = Query(None),
    limit: int = Query(20, le=50)
):
    conn = get_conn()
    cur = conn.cursor()

    filters = []
    params = []

    if q:
        filters.append("(LOWER(name) LIKE %s OR LOWER(artist) LIKE %s OR LOWER(album) LIKE %s)")
        params.extend([f"%{q.lower()}%"] * 3)
    if min_tempo:
        filters.append("tempo >= %s"); params.append(min_tempo)
    if max_tempo:
        filters.append("tempo <= %s"); params.append(max_tempo)
    if min_energy:
        filters.append("energy >= %s"); params.append(min_energy)
    if max_energy:
        filters.append("energy <= %s"); params.append(max_energy)
    if min_valence:
        filters.append("valence >= %s"); params.append(min_valence)
    if max_valence:
        filters.append("valence <= %s"); params.append(max_valence)
    if min_acousticness:
        filters.append("acousticness >= %s"); params.append(min_acousticness)
    if artist:
        filters.append("LOWER(artist) LIKE %s"); params.append(f"%{artist.lower()}%")

    where = "WHERE " + " AND ".join(filters) if filters else ""
    params.append(limit)

    cur.execute(f"""
        SELECT id, name, artist, album, saved_at,
               tempo, energy, valence, danceability, acousticness, preview_url
        FROM tracks
        {where}
        ORDER BY saved_at DESC
        LIMIT %s
    """, params)

    rows = cur.fetchall()
    cur.close()
    conn.close()

    return {"results": [
        {
            "id": r[0], "name": r[1], "artist": r[2],
            "album": r[3], "saved_at": str(r[4])[:10],
            "tempo": r[5], "energy": r[6], "valence": r[7],
            "danceability": r[8], "acousticness": r[9],
            "preview_url": r[10]
        }
        for r in rows
    ]}