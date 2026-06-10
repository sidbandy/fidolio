"""
ingest_library.py
------------------
Pulls all saved tracks + audio features from Spotify
and stores them in your local PostgreSQL database.

Run once when you first set up Fidolio.
Takes 2-5 minutes for a large library.

Usage: python scripts/ingest_library.py
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

def ingest():
    print("Connecting to Spotify...")
    sp = get_spotify_client()
    user = sp.current_user()
    user_id = user['id']
    print(f"Logged in as: {user['display_name']}")

    print("Connecting to database...")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # Upsert user
    cur.execute("""
        INSERT INTO users (id, display_name, created_at)
        VALUES (%s, %s, %s)
        ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name
    """, (user_id, user['display_name'], datetime.now()))
    conn.commit()

    # Pull all saved tracks with pagination
    print("\nPulling your library from Spotify...")
    print("This will take a few minutes for large libraries.\n")
    
    offset = 0
    limit = 50
    total_saved = 0
    all_track_ids = []
    all_track_data = []

    while True:
        results = sp.current_user_saved_tracks(limit=limit, offset=offset)
        items = results['items']
        if not items:
            break

        for item in items:
            track = item['track']
            if not track or not track.get('id'):
                continue
            all_track_ids.append(track['id'])
            all_track_data.append({
                'id': track['id'],
                'user_id': user_id,
                'name': track['name'],
                'artist': track['artists'][0]['name'],
                'album': track['album']['name'],
                'saved_at': item['added_at'],
                'preview_url': track.get('preview_url')
            })

        total_saved += len(items)
        print(f"  Fetched {total_saved} tracks...", end='\r')
        offset += limit
        time.sleep(0.1)

    print(f"\n  Done. {total_saved} tracks fetched from Spotify.")

    # Audio features endpoint deprecated by Spotify in 2024 — skipping
    print("\nNote: Spotify deprecated audio features API, skipping.")
    features_map = {}

    # Insert everything into database
    print("\nSaving to database...")
    inserted = 0
    skipped = 0

    for track in all_track_data:
        feat = features_map.get(track['id'], {})
        try:
            cur.execute("""
                INSERT INTO tracks (
                    id, user_id, name, artist, album, saved_at,
                    tempo, energy, valence, danceability,
                    acousticness, speechiness, loudness,
                    duration_ms, preview_url
                ) VALUES (
                    %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s
                )
                ON CONFLICT (id) DO NOTHING
            """, (
                track['id'], track['user_id'], track['name'],
                track['artist'], track['album'], track['saved_at'],
                feat.get('tempo'), feat.get('energy'), feat.get('valence'),
                feat.get('danceability'), feat.get('acousticness'),
                feat.get('speechiness'), feat.get('loudness'),
                feat.get('duration_ms'), track['preview_url']
            ))
            inserted += 1
        except Exception as e:
            skipped += 1

        if inserted % 500 == 0 and inserted > 0:
            conn.commit()
            print(f"  Saved {inserted} tracks...", end='\r')

    conn.commit()
    cur.close()
    conn.close()

    print(f"\n  Inserted: {inserted} tracks")
    print(f"  Skipped:  {skipped} (duplicates or errors)")
    print(f"\n✓ Library ingestion complete. Your music is in the database.")

    # Quick stats
    print("\n--- Quick stats ---")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM tracks WHERE user_id = %s", (user_id,))
    count = cur.fetchone()[0]
    cur.execute("SELECT artist, COUNT(*) as c FROM tracks WHERE user_id = %s GROUP BY artist ORDER BY c DESC LIMIT 5", (user_id,))
    top_artists = cur.fetchall()
    cur.close()
    conn.close()

    print(f"Total tracks in DB: {count}")
    print("Your top 5 most saved artists:")
    for artist, c in top_artists:
        print(f"  {artist}: {c} songs")

if __name__ == "__main__":
    ingest()