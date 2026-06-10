from fastapi import APIRouter, Query
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
router = APIRouter()
DB_URL = os.getenv("DATABASE_URL")

def get_conn():
    return psycopg2.connect(DB_URL)

@router.get("/duplicates")
def find_duplicates():
    """Find songs saved more than once — same name and artist."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT name, artist, COUNT(*) as copies,
               array_agg(id) as track_ids,
               array_agg(saved_at::text) as saved_dates
        FROM tracks
        GROUP BY name, artist
        HAVING COUNT(*) > 1
        ORDER BY copies DESC
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return {"duplicates": [
        {"name": r[0], "artist": r[1], "copies": r[2],
         "track_ids": r[3], "saved_dates": r[4]}
        for r in rows
    ]}

@router.get("/dead-saves")
def find_dead_saves(min_days: int = Query(365)):
    """Songs saved but never appeared in listening history."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT t.id, t.name, t.artist, t.saved_at,
               t.energy, t.valence
        FROM tracks t
        LEFT JOIN listening_history lh ON lh.track_id = t.id
        WHERE lh.id IS NULL
          AND t.saved_at < NOW() - INTERVAL '1 day' * %s
        ORDER BY t.saved_at ASC
        LIMIT 50
    """, (min_days,))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return {"dead_saves": [
        {"id": r[0], "name": r[1], "artist": r[2],
         "saved_at": str(r[3])[:10], "energy": r[4], "valence": r[5]}
        for r in rows
    ]}

@router.get("/top-saved-artists")
def top_saved_artists(limit: int = Query(20, le=100)):
    """Artists you've saved the most songs from."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT artist, COUNT(*) as song_count,
               ROUND(AVG(energy)::numeric, 2) as avg_energy,
               ROUND(AVG(valence)::numeric, 2) as avg_mood
        FROM tracks
        GROUP BY artist
        ORDER BY song_count DESC
        LIMIT %s
    """, (limit,))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return {"artists": [
        {"artist": r[0], "songs": r[1], "avg_energy": r[2], "avg_mood": r[3]}
        for r in rows
    ]}