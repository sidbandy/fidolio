"""
Fetches preview URLs for all tracks missing them.
Run once: python scripts/fetch_previews.py
"""
import sys, os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

import psycopg2, time
from dotenv import load_dotenv
from core.spotify_client import get_spotify_client

load_dotenv('backend/.env')
DB_URL = os.getenv("DATABASE_URL")

def fetch():
    sp = get_spotify_client()
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    cur.execute("SELECT id FROM tracks WHERE preview_url IS NULL ORDER BY saved_at DESC")
    track_ids = [row[0] for row in cur.fetchall()]
    total = len(track_ids)
    print(f"Fetching preview URLs for {total} tracks...")

    updated = 0
    for i in range(0, total, 50):
        batch = track_ids[i:i+50]
        try:
            results = sp.tracks(batch)['tracks']
            for track in results:
                if track and track.get('preview_url'):
                    cur.execute("UPDATE tracks SET preview_url = %s WHERE id = %s",
                                (track['preview_url'], track['id']))
                    updated += 1
            conn.commit()
        except Exception as e:
            print(f"Error on batch {i}: {e}")
        print(f"  {min(i+50, total)}/{total} processed, {updated} previews found...", end='\r')
        time.sleep(0.1)

    cur.close()
    conn.close()
    print(f"\nDone. {updated} preview URLs added.")

if __name__ == "__main__":
    fetch()