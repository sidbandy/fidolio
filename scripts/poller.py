"""
Fidolio Listening History Poller
----------------------------------
Runs every 30 minutes. Fetches the last 50 recently played tracks
from Spotify and inserts new ones into listening_history.

This is how Fidolio builds your personal listening dataset —
Spotify withholds full history, so we collect it ourselves.

Run: python scripts/poller.py
"""
import os
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

from apscheduler.schedulers.blocking import BlockingScheduler
from datetime import datetime

scheduler = BlockingScheduler()

def poll_recent_tracks():
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Polling recent tracks...")
    # TODO: for each authenticated user:
    #   1. Refresh Spotify token if expired
    #   2. sp.current_user_recently_played(limit=50)
    #   3. INSERT INTO listening_history ON CONFLICT (played_at) DO NOTHING
    #   4. Fetch audio features for any tracks not yet in `tracks` table
    print("Poll complete.")

@scheduler.scheduled_job("interval", minutes=30)
def scheduled_poll():
    poll_recent_tracks()

if __name__ == "__main__":
    print("Fidolio poller running — polling every 30 minutes.")
    poll_recent_tracks()
    scheduler.start()
