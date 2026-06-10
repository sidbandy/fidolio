"""
backfill_release_years.py
--------------------------
Fetches release year for all tracks missing it.
Uses Spotify's tracks endpoint which returns album.release_date.

Run once: python scripts/backfill_release_years.py
"""
import sys, os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

import psycopg2, time
from dotenv import load_dotenv
from core.spotify_client import get_spotify_client

load_dotenv('backend/.env')
DB_URL = os.getenv("DATABASE_URL")

def backfill():
    sp  = get_spotify_client()
    conn = psycopg2.connect(DB_URL)
    cur  = conn.cursor()

    cur.execute("SELECT id FROM tracks WHERE release_year IS NULL")
    ids = [r[0] for r in cur.fetchall()]
    total   = len(ids)
    updated = 0
    print(f"Fetching release years for {total} tracks...")

    for i in range(0, total, 50):
        batch = ids[i:i+50]
        try:
            results = sp.tracks(batch)['tracks']
            for track in results:
                if not track:
                    continue
                rd = track.get('album', {}).get('release_date', '')
                if rd:
                    year = int(rd[:4])
                    cur.execute(
                        "UPDATE tracks SET release_year = %s WHERE id = %s",
                        (year, track['id'])
                    )
                    updated += 1
            conn.commit()
        except Exception as e:
            print(f"Error on batch {i}: {e}")
        print(f"  {min(i+50, total)}/{total} processed, {updated} updated...", end='\r')
        time.sleep(0.1)

    cur.close()
    conn.close()
    print(f"\nDone. {updated} tracks updated with release years.")

    # Quick decade breakdown
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
    cur.close()
    conn.close()

if __name__ == "__main__":
    backfill()