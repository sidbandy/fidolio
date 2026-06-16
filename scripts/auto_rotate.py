"""
auto_rotate.py
--------------
Finds all smart playlists with rotation enabled that are due,
and rotates them automatically.

Run manually:
    python scripts/auto_rotate.py

On Railway (deployed), this runs as a cron job every day.
"""
import sys, os, requests
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))
from dotenv import load_dotenv
load_dotenv('backend/.env')

API_BASE = os.getenv("INTERNAL_API_URL", "http://localhost:8000")
USER_ID  = os.getenv("DEFAULT_USER_ID",  "0tz6fep2m5bx1vq85g48518u9")

def main():
    from datetime import datetime
    print(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M')}] Auto-rotation starting...")
    try:
        resp = requests.post(
            f"{API_BASE}/playlists/run-auto-rotations",
            params={"user_id": USER_ID},
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"  ERROR calling API: {e}")
        sys.exit(1)

    print(f"  {data['message']}")
    for r in data.get("results", []):
        if r["status"] == "rotated":
            print(f"  ✓ {r['name']} — swapped {r['rotated']} tracks")
            for t in r.get("removed", []):
                print(f"      - {t}")
            for t in r.get("added", []):
                print(f"      + {t}")
        else:
            print(f"  ✗ {r['name']} — {r.get('error', 'unknown error')}")

    print("Done.\n")

if __name__ == "__main__":
    main()
