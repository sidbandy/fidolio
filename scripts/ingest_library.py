"""
Fidolio Library Ingestion
--------------------------
Run once when a user first connects. Pulls all saved tracks
with audio features and all playlists from Spotify.

Populates `tracks` and `playlists` tables so library
features work from day one.

Usage: python scripts/ingest_library.py
"""
import os
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

import time

def ingest_saved_tracks(sp, user_id: str):
    offset = 0
    limit = 50
    total = 0

    while True:
        results = sp.current_user_saved_tracks(limit=limit, offset=offset)
        items = results["items"]
        if not items:
            break

        track_ids = [t["track"]["id"] for t in items]
        features = sp.audio_features(track_ids)

        for item, feat in zip(items, features):
            track = item["track"]
            print(f"  ✓ {track['name']} — {track['artists'][0]['name']}")
            # TODO: INSERT INTO tracks

        total += len(items)
        print(f"  {total} tracks ingested so far...")
        offset += limit
        time.sleep(0.1)

    print(f"\nDone. {total} tracks ingested.")

if __name__ == "__main__":
    print("Starting Fidolio library ingestion...")
    # TODO: authenticate and call ingest_saved_tracks
