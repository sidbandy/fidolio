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


def _poll_user(user_id):
    """Record one user's recent plays + keep their saved library current."""
    sp = get_spotify_client(user_id)            # DB token per user; file cache for the default account
    uid = user_id or sp.current_user()["id"]
    conn = psycopg2.connect(DB_URL); cur = conn.cursor()

    items = sp.current_user_recently_played(limit=50).get("items", [])
    new_plays = 0
    for item in items:
        t = item["track"]
        try:
            cur.execute(
                """INSERT INTO listening_history
                       (user_id, track_id, track_name, artist_name, played_at)
                   VALUES (%s, %s, %s, %s, %s)
                   ON CONFLICT (user_id, played_at) DO NOTHING""",
                (uid, t["id"], t["name"], t["artists"][0]["name"], item["played_at"]),
            )
            if cur.rowcount > 0:
                new_plays += 1
        except Exception:
            pass

    conn.commit(); cur.close(); conn.close()
    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {uid}: {new_plays} new plays ({len(items)} fetched)")

    # Keep the saved-tracks library current (incremental — cheap when nothing new)
    try:
        from sync_library import sync_saved_tracks
        sync_saved_tracks(user_id=user_id)
    except Exception as e:
        print(f"  library sync skipped for {uid}: {e}")


def main():
    """Poll every known account. Falls back to the single-token path if there are no users yet."""
    try:
        from core.users import list_user_ids
        user_ids = list_user_ids() or [None]
    except Exception:
        user_ids = [None]
    for uid in user_ids:
        try:
            _poll_user(uid)
        except Exception as e:
            print(f"  poll failed for {uid}: {e}")


if __name__ == "__main__":
    main()
