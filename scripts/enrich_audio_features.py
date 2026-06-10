"""
enrich_audio_features.py
-------------------------
Fetches audio features for all tracks using ReccoBeats API.
Accepts Spotify IDs directly — no lookup step needed.
Batches 40 tracks per request, handles rate limiting automatically.
Safe to interrupt and re-run — skips tracks already enriched.

Usage: python scripts/enrich_audio_features.py
"""
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

import psycopg2
import requests
import time
from dotenv import load_dotenv

load_dotenv('backend/.env')
DB_URL = os.getenv("DATABASE_URL")
BASE_URL = "https://api.reccobeats.com/v1"

def fetch_batch(spotify_ids: list):
    """Fetch audio features for up to 40 tracks by Spotify ID."""
    url = f"{BASE_URL}/track"
    params = {"ids": ",".join(spotify_ids)}
    try:
        response = requests.get(url, params=params, timeout=15)
        if response.status_code == 200:
            data = response.json()
            return data.get("content", [])
        elif response.status_code == 429:
            retry_after = int(response.headers.get("Retry-After", 10))
            print(f"\n  Rate limited. Waiting {retry_after}s...")
            time.sleep(retry_after)
            return fetch_batch(spotify_ids)  # retry
        else:
            return []
    except Exception as e:
        print(f"\n  Request error: {e}")
        return []

def fetch_features(reccobeats_id: str):
    """Fetch full audio features for a single ReccoBeats track ID."""
    url = f"{BASE_URL}/track/{reccobeats_id}/audio-features"
    try:
        response = requests.get(url, timeout=15)
        if response.status_code == 200:
            return response.json()
        elif response.status_code == 429:
            retry_after = int(response.headers.get("Retry-After", 10))
            time.sleep(retry_after)
            return fetch_features(reccobeats_id)
        return None
    except Exception:
        return None

def enrich():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # Only grab tracks not yet enriched
    cur.execute("""
        SELECT id, name, artist 
        FROM tracks 
        WHERE tempo IS NULL
        ORDER BY saved_at DESC
    """)
    tracks = cur.fetchall()
    total = len(tracks)
    print(f"Found {total} tracks missing audio features.")
    print("This will take ~15-20 minutes. Safe to interrupt and re-run.\n")

    if total == 0:
        print("All tracks already enriched. Nothing to do.")
        cur.close()
        conn.close()
        return

    updated = 0
    failed = 0
    batch_size = 40

    track_ids = [t[0] for t in tracks]

    for i in range(0, len(track_ids), batch_size):
        batch = track_ids[i:i + batch_size]

        # Step 1: resolve Spotify IDs to ReccoBeats track objects
        rb_tracks = fetch_batch(batch)

        # Build a map of spotify_id -> reccobeats_id
        # Their href field looks like "https://open.spotify.com/track/SPOTIFY_ID"
        rb_map = {}
        for rb_track in rb_tracks:
            href = rb_track.get("href", "")
            if "spotify.com/track/" in href:
                spotify_id = href.split("spotify.com/track/")[-1].split("?")[0]
                rb_map[spotify_id] = rb_track.get("id")

        # Step 2: for each resolved track, fetch audio features
        for spotify_id in batch:
            rb_id = rb_map.get(spotify_id)
            if not rb_id:
                failed += 1
                continue

            features = fetch_features(rb_id)
            if not features:
                failed += 1
                continue

            try:
                cur.execute("""
                    UPDATE tracks SET
                        reccobeats_id = %s,
                        tempo         = %s,
                        energy        = %s,
                        valence       = %s,
                        danceability  = %s,
                        acousticness  = %s,
                        speechiness   = %s,
                        loudness      = %s,
                        instrumentalness = %s,
                        liveness      = %s,
                        track_key     = %s,
                        mode          = %s
                    WHERE id = %s
                """, (
                    rb_id,
                    features.get("tempo"),
                    features.get("energy"),
                    features.get("valence"),
                    features.get("danceability"),
                    features.get("acousticness"),
                    features.get("speechiness"),
                    features.get("loudness"),
                    features.get("instrumentalness"),
                    features.get("liveness"),
                    features.get("key"),
                    features.get("mode"),
                    spotify_id
                ))
                updated += 1
            except Exception as e:
                failed += 1

        # Commit every batch
        conn.commit()
        progress = min(i + batch_size, total)
        print(f"  Progress: {progress}/{total} — {updated} enriched, {failed} not found", end='\r')

        # Be polite to the API — 0.5s between batches
        time.sleep(0.5)

    cur.close()
    conn.close()

    print(f"\n\nDone.")
    print(f"  Enriched: {updated} tracks")
    print(f"  Not found in ReccoBeats: {failed} tracks")

    # Show sample results to confirm it worked
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute("""
        SELECT name, artist, ROUND(tempo::numeric, 0), 
               ROUND(energy::numeric, 2), ROUND(valence::numeric, 2)
        FROM tracks 
        WHERE tempo IS NOT NULL
        LIMIT 8
    """)
    samples = cur.fetchall()
    cur.close()
    conn.close()

    print(f"\nSample enriched tracks:")
    print(f"{'Track':<35} {'Artist':<22} {'BPM':>4} {'Energy':>7} {'Mood':>6}")
    print("-" * 78)
    for name, artist, tempo, energy, valence in samples:
        print(f"{str(name)[:34]:<35} {str(artist)[:21]:<22} {tempo:>4} {energy:>7} {valence:>6}")

if __name__ == "__main__":
    enrich()