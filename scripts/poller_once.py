"""
poller_once.py
--------------
Single-shot version of the poller for use as a scheduled job (Railway cron,
GitHub Actions, launchd, etc). Fetches the last 50 recently-played tracks once,
records new ones, then exits. Schedule it every 30 minutes.

    python scripts/poller_once.py
"""
import sys, os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

import psycopg2
from datetime import datetime
from dotenv import load_dotenv
from core.spotify_client import get_spotify_client

load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'backend', '.env'))
DB_URL = os.getenv("DATABASE_URL")


def poll_once():
    sp = get_spotify_client()
    user_id = sp.current_user()['id']
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    items = sp.current_user_recently_played(limit=50).get('items', [])
    new_plays = 0
    for item in items:
        track = item['track']
        try:
            cur.execute("""
                INSERT INTO listening_history (user_id, track_id, track_name, artist_name, played_at)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (played_at) DO NOTHING
            """, (user_id, track['id'], track['name'],
                  track['artists'][0]['name'], item['played_at']))
            if cur.rowcount > 0:
                new_plays += 1
        except Exception:
            pass

    conn.commit(); cur.close(); conn.close()
    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {new_plays} new plays "
          f"({len(items)} fetched)")


if __name__ == "__main__":
    poll_once()
