"""
run_poller.py — single-shot poll, lives inside backend/ so it works as a
Railway cron service (Root Directory = backend). Records new recently-played
tracks into listening_history, then exits.

Railway cron service:
  Root Directory : backend
  Start Command  : python run_poller.py
  Cron Schedule  : */30 * * * *
"""
import os
import psycopg2
from datetime import datetime
from dotenv import load_dotenv
from core.spotify_client import get_spotify_client

load_dotenv()
DB_URL = os.getenv("DATABASE_URL")


def main():
    sp = get_spotify_client()           # bootstraps token cache from env if needed
    user_id = sp.current_user()["id"]
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    items = sp.current_user_recently_played(limit=50).get("items", [])
    new_plays = 0
    for item in items:
        t = item["track"]
        try:
            cur.execute(
                """INSERT INTO listening_history
                       (user_id, track_id, track_name, artist_name, played_at)
                   VALUES (%s, %s, %s, %s, %s)
                   ON CONFLICT (played_at) DO NOTHING""",
                (user_id, t["id"], t["name"], t["artists"][0]["name"], item["played_at"]),
            )
            if cur.rowcount > 0:
                new_plays += 1
        except Exception:
            pass

    conn.commit(); cur.close(); conn.close()
    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {new_plays} new plays ({len(items)} fetched)")

    # Also keep the saved-tracks library current (incremental — cheap when nothing new)
    try:
        from sync_library import sync_saved_tracks
        sync_saved_tracks()
    except Exception as e:
        print(f"  library sync skipped: {e}")


if __name__ == "__main__":
    main()
