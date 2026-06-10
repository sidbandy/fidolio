"""
setup_db.py
------------
Run once to create all Fidolio tables in PostgreSQL.
Usage: python scripts/setup_db.py
"""
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

import psycopg2
from dotenv import load_dotenv

load_dotenv('backend/.env')

DB_URL = os.getenv("DATABASE_URL")

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    display_name TEXT,
    access_token TEXT,
    refresh_token TEXT,
    token_expiry TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tracks (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT,
    artist TEXT,
    album TEXT,
    saved_at TIMESTAMP,
    tempo FLOAT,
    energy FLOAT,
    valence FLOAT,
    danceability FLOAT,
    acousticness FLOAT,
    speechiness FLOAT,
    loudness FLOAT,
    duration_ms INTEGER,
    preview_url TEXT
);

CREATE TABLE IF NOT EXISTS listening_history (
    id SERIAL PRIMARY KEY,
    user_id TEXT,
    track_id TEXT,
    track_name TEXT,
    artist_name TEXT,
    played_at TIMESTAMP UNIQUE
);

CREATE TABLE IF NOT EXISTS collab_rooms (
    id TEXT PRIMARY KEY,
    name TEXT,
    owner_id TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automations (
    id SERIAL PRIMARY KEY,
    user_id TEXT,
    rule_json TEXT,
    target_playlist_id TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);
"""

def setup():
    print("Connecting to database...")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    
    print("Creating tables...")
    cur.execute(SCHEMA)
    conn.commit()
    
    # Verify tables were created
    cur.execute("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name;
    """)
    tables = cur.fetchall()
    
    print("\nTables created:")
    for table in tables:
        print(f"  ✓ {table[0]}")
    
    cur.close()
    conn.close()
    print("\nDatabase ready.")

if __name__ == "__main__":
    setup()