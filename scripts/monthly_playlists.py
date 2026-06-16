"""
monthly_playlists.py
--------------------
Auto-creates one Spotify playlist per month containing everything you saved
that month. Idempotent — tracked in the monthly_playlists table, so re-running
never duplicates. The current month is always re-synced (it's still filling up).

Usage:
    # Create playlists for every past month you have saves in (retroactive)
    python scripts/monthly_playlists.py --backfill

    # Only build months with at least N saves (skip tiny months)
    python scripts/monthly_playlists.py --backfill --min-tracks 10

    # Just create / refresh the current month (fast — good for scheduling)
    python scripts/monthly_playlists.py

The poller also calls sync_current_month() once a day automatically, so if the
poller is running you get a continuously-updated "this month" playlist for free.
"""
import sys, os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

from datetime import datetime
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'backend', '.env'))

from api.routes.library import (
    get_conn, get_spotify, ensure_monthly_table,
    create_or_sync_month, DEFAULT_USER,
)


def all_saved_months(user_id):
    """Return [(year, month, count), ...] for every month with saves, oldest first."""
    conn = get_conn(); cur = conn.cursor()
    cur.execute("""
        SELECT EXTRACT(YEAR FROM saved_at)::int  AS y,
               EXTRACT(MONTH FROM saved_at)::int AS m,
               COUNT(*)
        FROM tracks
        WHERE user_id = %s AND saved_at IS NOT NULL
        GROUP BY y, m ORDER BY y ASC, m ASC
    """, (user_id,))
    rows = cur.fetchall()
    cur.close(); conn.close()
    return [(int(r[0]), int(r[1]), int(r[2])) for r in rows]


def backfill(user_id=DEFAULT_USER, min_tracks=1):
    ensure_monthly_table()
    sp     = get_spotify()
    months = all_saved_months(user_id)
    eligible = [m for m in months if m[2] >= min_tracks]
    print(f"Found {len(months)} months with saves "
          f"({len(eligible)} with ≥{min_tracks} tracks).\n")

    created = synced = skipped = 0
    for (year, month, count) in eligible:
        res = create_or_sync_month(sp, user_id, year, month)
        st  = res["status"]
        tag = {"created": "✓ created", "synced": "↻ synced",
               "unchanged": "· unchanged", "skipped_empty": "· empty",
               "error": "✗ ERROR"}.get(st, st)
        print(f"  {year}-{str(month).zfill(2)}  {tag:14} {res.get('track_count',0):4} tracks"
              + (f"  {res.get('error')}" if st == "error" else ""))
        if st == "created": created += 1
        elif st == "synced": synced += 1
        else: skipped += 1

    print(f"\nDone. {created} created, {synced} synced, {skipped} skipped/unchanged.")


def sync_current(user_id=DEFAULT_USER):
    """Create/refresh just the current month. Safe to call repeatedly."""
    ensure_monthly_table()
    sp  = get_spotify()
    now = datetime.now()
    res = create_or_sync_month(sp, user_id, now.year, now.month, force=True)
    print(f"Current month {now.year}-{str(now.month).zfill(2)}: "
          f"{res['status']} ({res.get('track_count',0)} tracks)")
    return res


if __name__ == "__main__":
    if "--backfill" in sys.argv:
        mt = 1
        for a in sys.argv:
            if a.startswith("--min-tracks"):
                try: mt = int(a.split("=")[1]) if "=" in a else int(sys.argv[sys.argv.index(a)+1])
                except Exception: pass
        backfill(min_tracks=mt)
    else:
        sync_current()
