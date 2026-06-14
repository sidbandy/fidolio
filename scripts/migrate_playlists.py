"""
migrate_playlists.py
--------------------
One-time migration that:
  1. Creates the smart_playlists table
  2. Adds a `language` column to tracks
  3. Phase 1 (fast): detects language from Unicode script in track name / artist name
  4. Phase 2 (optional, --enrich flag): calls Last.fm per artist to catch
     romanized non-English tracks (e.g. "Arijit Singh" → hindi)

Usage:
  python scripts/migrate_playlists.py            # schema + script detection only
  python scripts/migrate_playlists.py --enrich   # also runs Last.fm enrichment
"""

import sys, os, requests
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))
import psycopg2
from dotenv import load_dotenv

load_dotenv('backend/.env')
DB_URL      = os.getenv("DATABASE_URL")
LASTFM_KEY  = os.getenv("LASTFM_API_KEY")

# ─── Schema ──────────────────────────────────────────────────────────────────

SCHEMA = """
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS language TEXT;

CREATE TABLE IF NOT EXISTS smart_playlists (
    id                   SERIAL PRIMARY KEY,
    user_id              TEXT,
    name                 TEXT,
    rule_json            TEXT,
    spotify_playlist_id  TEXT,
    spotify_playlist_url TEXT,
    rotation_enabled     BOOLEAN DEFAULT FALSE,
    rotation_size        INTEGER DEFAULT 5,
    rotation_source      TEXT    DEFAULT 'library',
    last_rotated_at      TIMESTAMP,
    last_synced_at       TIMESTAMP,
    created_at           TIMESTAMP DEFAULT NOW()
);
"""

# ─── Script detection ─────────────────────────────────────────────────────────

SCRIPT_RANGES = [
    (0x0980, 0x09FF, "bengali"),
    (0x0900, 0x097F, "hindi"),
    (0x0600, 0x06FF, "arabic"),
    (0x0A00, 0x0A7F, "punjabi"),
    (0x0B80, 0x0BFF, "tamil"),
    (0x0B00, 0x0B7F, "odia"),
    (0x0C00, 0x0C7F, "telugu"),
    (0x0C80, 0x0CFF, "kannada"),
    (0x0D00, 0x0D7F, "malayalam"),
    (0xAC00, 0xD7AF, "korean"),
    (0x4E00, 0x9FFF, "chinese"),
    (0x3040, 0x309F, "japanese"),
    (0x30A0, 0x30FF, "japanese"),
    (0x0400, 0x04FF, "russian"),
]

def detect_script(text: str):
    for ch in text:
        code = ord(ch)
        for start, end, lang in SCRIPT_RANGES:
            if start <= code <= end:
                return lang
    return None

# ─── Last.fm tag → language mapping ──────────────────────────────────────────

LASTFM_LANG_MAP = [
    (["bengali", "bangla", "bangladeshi", "rabindra sangeet", "nazrul geeti",
      "baul", "adhunik", "modern bengali", "bengali folk", "bengali music",
      "west bengal", "kolkata"], "bengali"),
    (["hindi", "bollywood", "desi", "indian pop", "filmi", "playback singer",
      "hindustani", "hindi film", "hindi music", "indian music",
      "classic bollywood", "old bollywood", "retro bollywood"], "hindi"),
    (["punjabi", "bhangra", "punjabi pop", "giddha", "dhol"], "punjabi"),
    (["arabic", "arab", "khaleeji", "egyptian", "levantine", "maghreb",
      "shaabi", "tarab", "oud", "arabic pop", "arabic music",
      "lebanese", "gulf", "iraqi", "syrian"], "arabic"),
    (["spanish", "latino", "latin pop", "reggaeton", "cumbia", "salsa",
      "latin", "latin rock", "flamenco", "bachata", "merengue"], "spanish"),
    (["french", "chanson", "chanson française", "variété française",
      "french pop", "french music"], "french"),
    (["portuguese", "sertanejo", "mpb", "bossa nova", "forro",
      "axe", "pagode", "portuguese music"], "portuguese"),
    (["tamil", "kollywood", "carnatic", "tamil pop"], "tamil"),
    (["telugu", "tollywood", "telugu pop"],            "telugu"),
    (["kannada", "sandalwood"],                        "kannada"),
    (["malayalam", "mollywood"],                       "malayalam"),
    (["urdu", "ghazal", "qawwali", "sufi"],            "urdu"),
]

SKIP_TAGS = {"seen live", "albums i own", "favorites", "love", "awesome",
             "favorite", "under 2000 listeners", "spotify", "all"}

def lastfm_language(artist_name: str) -> str | None:
    if not LASTFM_KEY:
        return None
    try:
        resp = requests.get("http://ws.audioscrobbler.com/2.0/", params={
            "method": "artist.getTopTags", "artist": artist_name,
            "api_key": LASTFM_KEY, "format": "json"
        }, timeout=6)
        tags = [t["name"].lower() for t in
                resp.json().get("toptags", {}).get("tag", [])[:10]
                if t["name"].lower() not in SKIP_TAGS]
        for keywords, lang in LASTFM_LANG_MAP:
            if any(k in tags for k in keywords):
                return lang
    except Exception:
        pass
    return None

# ─── Main migration ───────────────────────────────────────────────────────────

def run(enrich: bool = False):
    print("Connecting to database...")
    conn = psycopg2.connect(DB_URL)
    cur  = conn.cursor()

    print("Running schema migration...")
    cur.execute(SCHEMA)
    conn.commit()
    print("  ✓ smart_playlists table ready")
    print("  ✓ language column added to tracks")

    # Phase 1: script detection (instant, no network)
    print("\nPhase 1: script detection...")
    cur.execute("SELECT id, name, artist FROM tracks WHERE language IS NULL")
    rows = cur.fetchall()
    print(f"  {len(rows)} tracks without language tag")

    script_hits = 0
    for track_id, name, artist in rows:
        lang = detect_script((name or "") + " " + (artist or ""))
        if lang:
            cur.execute("UPDATE tracks SET language = %s WHERE id = %s", (lang, track_id))
            script_hits += 1

    # Default remaining to english
    cur.execute("UPDATE tracks SET language = 'english' WHERE language IS NULL")
    conn.commit()
    print(f"  ✓ Script detected {script_hits} non-English tracks")
    print(f"  ✓ Remaining set to 'english' (may include romanized non-English — run --enrich to fix)")

    if not enrich:
        cur.close(); conn.close()
        print("\nDone. Run with --enrich to also use Last.fm for romanized non-English tracks.")
        return

    # Phase 2: Last.fm enrichment — ALL artists by default
    limit_arg = None
    for arg in sys.argv[1:]:
        if arg.startswith("--limit="):
            try: limit_arg = int(arg.split("=")[1])
            except: pass

    limit_clause = f"LIMIT {limit_arg}" if limit_arg else ""
    print(f"\nPhase 2: Last.fm enrichment ({limit_arg or 'ALL'} artists)...")
    cur.execute(f"""
        SELECT artist, COUNT(*) as c FROM tracks
        GROUP BY artist ORDER BY c DESC {limit_clause}
    """)
    top_artists = cur.fetchall()

    enriched = 0
    for i, (artist, count) in enumerate(top_artists):
        lang = lastfm_language(artist)
        if lang and lang != "english":
            cur.execute("""
                UPDATE tracks SET language = %s
                WHERE LOWER(artist) = %s AND language = 'english'
            """, (lang, artist.lower()))
            updated = cur.rowcount
            if updated:
                enriched += updated
                print(f"  {artist} → {lang} ({updated} tracks)")
        if (i + 1) % 10 == 0:
            conn.commit()
            print(f"  [{i+1}/{len(top_artists)}] processed...")

    conn.commit()
    print(f"\n  ✓ Last.fm enriched {enriched} tracks")
    cur.close(); conn.close()
    print("\nMigration complete.")

if __name__ == "__main__":
    run(enrich="--enrich" in sys.argv)
