"""
poller.py
----------
Runs every 30 minutes. Fetches your last 50 recently played
tracks from Spotify and stores new ones in listening_history.

This is how Fidolio builds your personal listening dataset —
Spotify only exposes the last 50 plays at any moment, so we
collect continuously and deduplicate on played_at timestamp.

Run once and leave it running in a terminal:
    python scripts/poller.py

Tip: open a dedicated terminal tab for this and don't close it.
"""
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

import psycopg2
import time
from datetime import datetime
from dotenv import load_dotenv
from core.spotify_client import get_spotify_client

load_dotenv('backend/.env')
DB_URL = os.getenv("DATABASE_URL")

def poll():
    sp = get_spotify_client()
    user_id = sp.current_user()['id']
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    results = sp.current_user_recently_played(limit=50)
    items = results.get('items', [])

    new_plays = 0
    for item in items:
        track = item['track']
        played_at = item['played_at']
        try:
            cur.execute("""
                INSERT INTO listening_history (user_id, track_id, track_name, artist_name, played_at)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (played_at) DO NOTHING
            """, (
                user_id,
                track['id'],
                track['name'],
                track['artists'][0]['name'],
                played_at
            ))
            if cur.rowcount > 0:
                new_plays += 1
        except Exception:
            pass

    conn.commit()
    cur.close()
    conn.close()

    timestamp = datetime.now().strftime('%H:%M:%S')
    print(f"[{timestamp}] Polled — {new_plays} new plays recorded ({len(items)} fetched)")


# Track the last day we refreshed the monthly playlist so we only do it once/day
_last_monthly_sync = None

def maybe_sync_monthly():
    """Refresh the current month's auto-playlist at most once per calendar day."""
    global _last_monthly_sync
    today = datetime.now().date()
    if _last_monthly_sync == today:
        return
    try:
        from api.routes.library import create_or_sync_month, DEFAULT_USER, get_spotify
        now = datetime.now()
        res = create_or_sync_month(get_spotify(), DEFAULT_USER, now.year, now.month, force=True)
        _last_monthly_sync = today
        print(f"          Monthly playlist '{now.year}-{str(now.month).zfill(2)}': "
              f"{res['status']} ({res.get('track_count', 0)} tracks)")
    except Exception as e:
        print(f"          Monthly playlist sync skipped: {e}")

def main():
    print("Fidolio poller started. Polling every 30 minutes.")
    print("Leave this terminal open. Ctrl+C to stop.\n")
    poll()              # run immediately on start
    maybe_sync_monthly()
    while True:
        time.sleep(1800)  # 30 minutes
        poll()
        maybe_sync_monthly()

if __name__ == "__main__":
    main()