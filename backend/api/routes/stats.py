from fastapi import APIRouter, Query
from typing import Literal
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))
router = APIRouter()
DB_URL = os.getenv("DATABASE_URL")

def get_conn():
    return psycopg2.connect(DB_URL)

@router.get("/wrapped")
def get_wrapped(
    period: Literal["day", "week", "month", "year"] = "month",
    user_id: str = Query("0tz6fep2m5bx1vq85g48518u9")
):
    conn = get_conn()
    cur  = conn.cursor()

    interval_map = {
        "day": "1 day", "week": "7 days",
        "month": "30 days", "year": "365 days"
    }
    interval = interval_map[period]

    cur.execute("""
        SELECT artist_name, COUNT(*) as plays
        FROM listening_history
        WHERE played_at >= NOW() - INTERVAL %s
        GROUP BY artist_name ORDER BY plays DESC LIMIT 10
    """, (interval,))
    top_artists = [{"artist": r[0], "plays": r[1]} for r in cur.fetchall()]

    cur.execute("""
        SELECT track_name, artist_name, COUNT(*) as plays
        FROM listening_history
        WHERE played_at >= NOW() - INTERVAL %s
        GROUP BY track_name, artist_name ORDER BY plays DESC LIMIT 10
    """, (interval,))
    top_songs = [{"track": r[0], "artist": r[1], "plays": r[2]} for r in cur.fetchall()]

    cur.execute("""
        SELECT COUNT(*) * 3.5 FROM listening_history
        WHERE played_at >= NOW() - INTERVAL %s
    """, (interval,))
    total_minutes = cur.fetchone()[0] or 0

    cur.execute("""
        SELECT EXTRACT(hour FROM played_at) as hour, COUNT(*) as plays
        FROM listening_history
        WHERE played_at >= NOW() - INTERVAL %s
        GROUP BY hour ORDER BY hour
    """, (interval,))
    clock = {int(r[0]): r[1] for r in cur.fetchall()}
    listening_clock = [{"hour": h, "plays": clock.get(h, 0)} for h in range(24)]

    cur.close()
    conn.close()

    return {
        "period": period,
        "top_artists": top_artists,
        "top_songs": top_songs,
        "total_minutes": round(total_minutes),
        "listening_clock": listening_clock
    }

@router.get("/all-time")
def all_time_stats(user_id: str = Query("0tz6fep2m5bx1vq85g48518u9")):
    conn = get_conn()
    cur  = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM listening_history")
    total_plays = cur.fetchone()[0]

    cur.execute("""
        SELECT artist_name, COUNT(*) as plays
        FROM listening_history
        GROUP BY artist_name ORDER BY plays DESC LIMIT 5
    """)
    top_artists = [{"artist": r[0], "plays": r[1]} for r in cur.fetchall()]

    cur.execute("SELECT MIN(played_at), MAX(played_at) FROM listening_history")
    row = cur.fetchone()
    first_play, last_play = row

    cur.close()
    conn.close()

    return {
        "total_plays": total_plays,
        "estimated_hours": round((total_plays * 3.5) / 60, 1),
        "top_artists_all_time": top_artists,
        "tracking_since": str(first_play)[:10] if first_play else None,
        "last_play": str(last_play)[:16] if last_play else None
    }

@router.get("/sonic-identity")
def sonic_identity(user_id: str = Query("0tz6fep2m5bx1vq85g48518u9")):
    conn = get_conn()
    cur  = conn.cursor()

    cur.execute("""
        SELECT
            ROUND(AVG(tempo)::numeric, 1)         as avg_tempo,
            ROUND(AVG(energy)::numeric, 3)        as avg_energy,
            ROUND(AVG(valence)::numeric, 3)       as avg_valence,
            ROUND(AVG(danceability)::numeric, 3)  as avg_dance,
            ROUND(AVG(acousticness)::numeric, 3)  as avg_acoustic,
            ROUND(AVG(instrumentalness)::numeric, 3) as avg_instrumental,
            ROUND(AVG(speechiness)::numeric, 3)   as avg_speech,
            COUNT(*) as total_tracks
        FROM tracks WHERE tempo IS NOT NULL AND user_id = %s
    """, (user_id,))
    avg = cur.fetchone()

    cur.execute("""
        SELECT
            COUNT(*) FILTER (WHERE valence < 0.3)  as dark,
            COUNT(*) FILTER (WHERE valence BETWEEN 0.3 AND 0.6) as neutral,
            COUNT(*) FILTER (WHERE valence > 0.6)  as happy
        FROM tracks WHERE valence IS NOT NULL AND user_id = %s
    """, (user_id,))
    mood = cur.fetchone()

    cur.execute("""
        SELECT
            COUNT(*) FILTER (WHERE energy < 0.3)  as calm,
            COUNT(*) FILTER (WHERE energy BETWEEN 0.3 AND 0.6) as medium,
            COUNT(*) FILTER (WHERE energy > 0.6)  as intense
        FROM tracks WHERE energy IS NOT NULL AND user_id = %s
    """, (user_id,))
    energy_dist = cur.fetchone()

    cur.execute("""
        SELECT track_key, COUNT(*) as c
        FROM tracks WHERE track_key IS NOT NULL AND user_id = %s
        GROUP BY track_key ORDER BY c DESC LIMIT 1
    """, (user_id,))
    top_key_row = cur.fetchone()
    key_names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
    top_key = key_names[top_key_row[0]] if top_key_row and top_key_row[0] >= 0 else "Unknown"

    cur.execute("""
        SELECT artist, COUNT(*) as saves,
               MIN(saved_at) as first_save, MAX(saved_at) as last_save
        FROM tracks WHERE user_id = %s
        GROUP BY artist HAVING COUNT(*) >= 5
        ORDER BY (MAX(saved_at) - MIN(saved_at)) ASC
        LIMIT 5
    """, (user_id,))
    rabbit_holes = [{
        "artist": r[0], "songs_saved": r[1],
        "first_save": str(r[2])[:10], "last_save": str(r[3])[:10]
    } for r in cur.fetchall()]

    cur.close()
    conn.close()

    return {
        "averages": {
            "tempo": float(avg[0]) if avg[0] else None,
            "energy": float(avg[1]) if avg[1] else None,
            "valence": float(avg[2]) if avg[2] else None,
            "danceability": float(avg[3]) if avg[3] else None,
            "acousticness": float(avg[4]) if avg[4] else None,
            "instrumentalness": float(avg[5]) if avg[5] else None,
            "speechiness": float(avg[6]) if avg[6] else None,
            "total_analyzed": avg[7]
        },
        "mood_distribution": {
            "dark": mood[0], "neutral": mood[1], "happy": mood[2]
        },
        "energy_distribution": {
            "calm": energy_dist[0], "medium": energy_dist[1], "intense": energy_dist[2]
        },
        "dominant_key": top_key,
        "rabbit_holes": rabbit_holes
    }

@router.get("/top-albums")
def top_albums(
    user_id: str = Query("0tz6fep2m5bx1vq85g48518u9"),
    limit: int = Query(20)
):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("""
        SELECT album, artist, COUNT(*) as track_count,
               ROUND(AVG(energy)::numeric, 2)  as avg_energy,
               ROUND(AVG(valence)::numeric, 2) as avg_mood,
               MIN(saved_at)::date             as first_saved
        FROM tracks
        WHERE user_id = %s AND album IS NOT NULL AND album != ''
        GROUP BY album, artist
        ORDER BY track_count DESC
        LIMIT %s
    """, (user_id, limit))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return {"albums": [
        {
            "album": r[0], "artist": r[1], "tracks": r[2],
            "avg_energy": float(r[3]) if r[3] else None,
            "avg_mood": float(r[4]) if r[4] else None,
            "first_saved": str(r[5])
        }
        for r in rows
    ]}

@router.get("/taste-timeline")
def taste_timeline(user_id: str = Query("0tz6fep2m5bx1vq85g48518u9")):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("""
        SELECT
            DATE_TRUNC('month', lh.played_at)      as month,
            ROUND(AVG(t.energy)::numeric, 3)       as energy,
            ROUND(AVG(t.valence)::numeric, 3)      as valence,
            ROUND(AVG(t.tempo)::numeric, 1)        as tempo,
            ROUND(AVG(t.danceability)::numeric, 3) as danceability,
            ROUND(AVG(t.acousticness)::numeric, 3) as acousticness,
            COUNT(*)                               as plays
        FROM listening_history lh
        JOIN tracks t ON t.id = lh.track_id
        WHERE lh.user_id = %s AND t.energy IS NOT NULL
        GROUP BY DATE_TRUNC('month', lh.played_at)
        ORDER BY month ASC
    """, (user_id,))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return {"timeline": [
        {
            "month":        str(r[0])[:7],
            "energy":       float(r[1]) if r[1] else None,
            "valence":      float(r[2]) if r[2] else None,
            "tempo":        float(r[3]) if r[3] else None,
            "danceability": float(r[4]) if r[4] else None,
            "acousticness": float(r[5]) if r[5] else None,
            "plays":        r[6]
        }
        for r in rows
    ]}