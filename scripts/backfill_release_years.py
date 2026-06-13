"""
backfill_release_years.py
Uses current_user_saved_tracks (which works in dev mode)
to extract release_year from album data.
"""
import sys, os, time
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

import psycopg2
from dotenv import load_dotenv
from core.spotify_client import get_spotify_client

load_dotenv('backend/.env')
DB_URL = os.getenv("DATABASE_URL")

def backfill():
    sp   = get_spotify_client()
    conn = psycopg2.connect(DB_URL)
    cur  = conn.cursor()

    updated = 0
    offset  = 0
    limit   = 50
    total   = None

    print("Fetching release years from your saved tracks...")

    while True:
        try:
            results = sp.current_user_saved_tracks(limit=limit, offset=offset)
        except Exception as e:
            print(f"Error at offset {offset}: {e}")
            break

        if total is None:
            total = results.get("total", 0)
            print(f"Total saved tracks: {total}")

        items = results.get("items", [])
        if not items:
            break

        for item in items:
            track = item.get("track")
            if not track:
                continue
            track_id = track["id"]
            release_date = track.get("album", {}).get("release_date", "")
            if release_date and len(release_date) >= 4:
                year = int(release_date[:4])
                cur.execute(
                    "UPDATE tracks SET release_year = %s WHERE id = %s AND release_year IS NULL",
                    (year, track_id)
                )
                if cur.rowcount > 0:
                    updated += 1

        conn.commit()
        offset += limit
        print(f"  {min(offset, total)}/{total} processed, {updated} updated...", end='\r')
        time.sleep(0.05)

        if offset >= total:
            break

    cur.close()
    conn.close()
    print(f"\nDone. {updated} tracks updated with release years.")

    # Decade breakdown
    conn = psycopg2.connect(DB_URL)
    cur  = conn.cursor()
    cur.execute("""
        SELECT (release_year / 10 * 10) as decade, COUNT(*) as songs
        FROM tracks WHERE release_year IS NOT NULL
        GROUP BY decade ORDER BY decade DESC
    """)
    print("\nYour library by decade:")
    for decade, count in cur.fetchall():
        print(f"  {decade}s: {count} songs")
    cur.execute("SELECT COUNT(*) FROM tracks WHERE release_year IS NULL")
    nulls = cur.fetchone()[0]
    print(f"  Still missing: {nulls} tracks")
    cur.close()
    conn.close()

if __name__ == "__main__":
    backfill()