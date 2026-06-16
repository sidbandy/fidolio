# FIDOLIO — Complete Technical Handoff (v2, June 2026)

This document is the full context needed to continue development of Fidolio in a new chat.
It covers every file, every endpoint, every DB table, all external APIs, the design system,
current data state, known issues, and what still needs to be built.

---

## What Fidolio Is

Personal Spotify music intelligence platform for Sid (UT Austin CS sophomore, GitHub: sidbandy).
Treats his 11,666-song Spotify library as a dataset. Spotify refuses to build analytics tools,
so this builds them: search, discovery, playlist management, stats, and identity tools.

**Core thesis:** Your music library is a dataset about you, and nobody is helping you understand it.

**Sid's library stats:**
- 11,666 saved tracks, audio features on all of them
- Top artists: Drake (119), A$AP Rocky (91), Mac Miller (84), Mac DeMarco (84), Kendrick Lamar (82)
- Avg BPM: 117.8, Energy: 0.566, Valence: 0.46 (slightly dark), dominant key C#
- Decades: 2020s (5820), 2010s (3408), 2000s (1045), 90s (754), 80s (234)
- Languages detected: english (10,696), hindi (386), spanish (193), french (152),
  arabic (74), japanese (62), chinese (48), bengali (29), urdu (8), portuguese (7), tamil (7)
- 167 listening history entries (poller running since June 2025)

---

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | Python 3.12, FastAPI, psycopg2, spotipy |
| Database | PostgreSQL local, db name `fidolio` |
| Frontend | React 18 (Vite), Recharts, react-router-dom v6 |
| Python env | `.venv` at project root |

---

## Directory Structure

```
fidolio/
├── backend/
│   ├── api/
│   │   ├── main.py                    ← FastAPI app, registers all routers
│   │   └── routes/
│   │       ├── stats.py               ← /stats/*
│   │       ├── library.py             ← /library/*
│   │       ├── search.py              ← /search/*
│   │       ├── discovery.py           ← /discovery/*
│   │       ├── nowplaying.py          ← /nowplaying/*
│   │       ├── albums.py              ← /albums/*
│   │       ├── collab.py              ← /collab/*
│   │       └── playlists.py           ← /playlists/* (new)
│   ├── core/
│   │   └── spotify_client.py          ← get_spotify_client() helper
│   ├── db/
│   │   └── models.py                  ← SQLAlchemy ORM models (not used at runtime)
│   └── .env                           ← NOT committed (Spotify keys, Last.fm, Genius)
├── frontend/
│   └── src/
│       ├── App.jsx                    ← Router, nav bar, 11 routes
│       ├── components/
│       │   └── NowPlaying.jsx         ← Fixed bottom bar, polls Spotify every 30s
│       ├── hooks/
│       │   └── usePreview.js          ← Deezer 30-sec preview hook
│       └── pages/
│           ├── SonicIdentity.jsx      ← /
│           ├── Wrapped.jsx            ← /wrapped
│           ├── Library.jsx            ← /library
│           ├── LikedSongs.jsx         ← /songs
│           ├── Search.jsx             ← /search
│           ├── Discovery.jsx          ← /discovery
│           ├── Albums.jsx             ← /albums
│           ├── Timeline.jsx           ← /timeline
│           ├── TimeCapsule.jsx        ← /capsule
│           ├── Collab.jsx             ← /collab and /collab/:roomId
│           └── Playlists.jsx          ← /playlists (new)
├── scripts/
│   ├── setup_db.py                    ← Creates all tables (run once)
│   ├── ingest_library.py              ← Fetches all saved tracks from Spotify
│   ├── enrich_audio_features.py       ← Fills audio features via ReccoBeats
│   ├── backfill_release_years.py      ← Fills release_year column
│   ├── fetch_previews.py              ← Fetches Deezer preview URLs
│   ├── poller.py                      ← Runs every 30 min, collects listening history
│   ├── migrate_playlists.py           ← Adds language column, smart_playlists table (run once, done)
│   └── test_connection.py
├── .cache                             ← Spotify OAuth token (NOT committed)
├── .gitignore
└── .env → backend/.env symlink or copy
```

---

## How to Run

```bash
# Terminal 1 — Backend
cd /Users/sid/Downloads/fidolio
source .venv/bin/activate
cd backend
uvicorn api.main:app --reload --port 8000

# Terminal 2 — Frontend
cd /Users/sid/Downloads/fidolio/frontend
npm run dev

# Terminal 3 (optional) — Listening history poller
cd /Users/sid/Downloads/fidolio
source .venv/bin/activate
python scripts/poller.py
```

**Important:**
- Always activate `.venv` first
- Backend uses port 8000; redirect URI must be `http://127.0.0.1:8000/auth/callback` (NOT localhost)
- Stop uvicorn before re-authenticating with Spotify
- NEVER commit `.env` or `.cache`

---

## Environment Variables (backend/.env)

```
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8000/auth/callback
DATABASE_URL=postgresql://sid@localhost/fidolio
LASTFM_API_KEY=...
GENIUS_ACCESS_TOKEN=...
```

---

## Database Schema (current, fully migrated)

All queries hardcode `user_id = "0tz6fep2m5bx1vq85g48518u9"` (single-user deployment).

### `users`
```
id TEXT PK          — Spotify user ID
display_name TEXT
access_token TEXT
refresh_token TEXT
token_expiry TIMESTAMP
created_at TIMESTAMP
```

### `tracks` (11,666 rows)
```
id TEXT PK          — Spotify track ID
user_id TEXT
name TEXT
artist TEXT
album TEXT
saved_at TIMESTAMP
tempo FLOAT
energy FLOAT
valence FLOAT
danceability FLOAT
acousticness FLOAT
speechiness FLOAT
loudness FLOAT
duration_ms INTEGER
preview_url TEXT
reccobeats_id TEXT  — used for ReccoBeats API calls
instrumentalness FLOAT
liveness FLOAT
track_key INTEGER
mode INTEGER
release_year INTEGER
language TEXT       — 'english'|'hindi'|'bengali'|'arabic'|'spanish'|'french'|
                      'japanese'|'chinese'|'punjabi'|'tamil'|'urdu'|'portuguese'|...
```

### `listening_history` (167 rows, growing)
```
id SERIAL PK
user_id TEXT
track_id TEXT
track_name TEXT
artist_name TEXT
played_at TIMESTAMP UNIQUE    — deduplication key
```

### `collab_rooms`
```
id TEXT PK          — 8-char uppercase random
name TEXT
owner_id TEXT
created_at TIMESTAMP
```

### `collab_submissions`
```
id SERIAL PK
room_id TEXT NOT NULL
track_id TEXT NOT NULL
track_name TEXT NOT NULL
artist_name TEXT NOT NULL
album_name TEXT
submitted_by TEXT NOT NULL
submitted_at TIMESTAMP
```

### `collab_votes`
```
id SERIAL PK
submission_id INTEGER NOT NULL
voter_name TEXT NOT NULL
vote INTEGER NOT NULL    — +1, 0, or -1
voted_at TIMESTAMP
UNIQUE(submission_id, voter_name)
```

### `automations` (stub, not yet fully implemented)
```
id SERIAL PK
user_id TEXT
rule_json TEXT
target_playlist_id TEXT
active BOOLEAN DEFAULT TRUE
created_at TIMESTAMP
```

### `smart_playlists` (new, 0 rows — user hasn't created any yet)
```
id SERIAL PK
user_id TEXT
name TEXT
rule_json TEXT              — JSON: {conditions, excludes, sort_by, sort_order, limit}
spotify_playlist_id TEXT
spotify_playlist_url TEXT
rotation_enabled BOOLEAN DEFAULT FALSE
rotation_size INTEGER DEFAULT 5
rotation_source TEXT DEFAULT 'library'   — 'library'|'similar'|'discover'
last_rotated_at TIMESTAMP
last_synced_at TIMESTAMP
created_at TIMESTAMP
```

---

## External APIs

| API | Key location | Used for | Known limits |
|---|---|---|---|
| Spotify | `.env` (rotated after leak) | Auth, library, current track, playlists, search | Audio features deprecated Nov 2024 (403), preview URLs deprecated (all null), recently played limited to 50 |
| ReccoBeats | No key needed | Audio features (replaces Spotify), album search, recommendations | Album search slow (30s+), retry logic added |
| Last.fm | `.env` as `LASTFM_API_KEY` | Artist tags (language detection, blind spots, similar artists for rotation) | None significant |
| Genius | `.env` as `GENIUS_ACCESS_TOKEN` | Song descriptions/meaning in Now Playing panel | None |
| Deezer | No key needed | 30-second audio preview URLs (replaces deprecated Spotify previews) | None |
| Open Meteo | No key needed | Weather-based recommendations | None |

---

## Backend: All Endpoints

### `/stats/*` — `backend/api/routes/stats.py`

```
GET /stats/wrapped?period=day|week|month|year
  → top_artists (10), top_songs (10), total_minutes, listening_clock (24 bars)
  ← from listening_history

GET /stats/all-time
  → total_plays, total_hours, top_artists, tracking_since
  ← from listening_history + tracks

GET /stats/sonic-identity
  → avg audio features, mood_distribution (dark/neutral/happy %), 
    energy_distribution (calm/medium/intense %), dominant_key, rabbit_holes
  ← from tracks + listening_history

GET /stats/top-albums?limit=20
  → albums sorted by track count, with avg energy/mood
  ← from tracks

GET /stats/taste-timeline
  → monthly averages: energy, valence, tempo, danceability, acousticness
  ← from listening_history joined to tracks
```

### `/library/*` — `backend/api/routes/library.py`

```
GET /library/duplicates
  → tracks saved more than once with all instance IDs and save dates

GET /library/dead-saves?min_days=365
  → tracks saved but never played (LEFT JOIN listening_history WHERE NULL)

GET /library/top-saved-artists?limit=20
  → artists ranked by save count with avg energy/mood

GET /library/liked-songs
  Params: sort_by, order, min_year, max_year, min_tempo, max_tempo,
          min_energy, max_energy, min_valence, max_valence, artist,
          limit (max 200), offset
  → paginated track list with all audio features and release_year

POST /library/time-capsule?year=&month=
  → Creates real Spotify playlist of all songs saved in that month
  → Returns {success, playlist_name, track_count, playlist_url}
```

### `/search/*` — `backend/api/routes/search.py`

```
GET /search/nlp?q=sad+slow+mac+miller+songs
  → Natural language search
  → Fuzzy artist matching via rapidfuzz (85 score threshold)
  → Detects: mood (sad/dark/happy), energy (chill/hype), tempo (slow/fast),
    acoustic flag, instrumental flag, decade/year, explicit artist names
  → Falls back progressively: full → drop text filter → drop artist → widen audio ranges
  → Returns {tracks, interpretation} where interpretation shows what was parsed

GET /search/?q=text&artist=&min_tempo=&max_tempo=&min_energy=&max_energy=
             &min_valence=&max_valence=&min_year=&max_year=&min_acousticness=
             &decade=&limit=
  → Standard filter search against tracks table

GET /search/weather-vibe?lat=&lon=
  → Calls Open Meteo for current weather
  → Maps weather code to audio feature targets (thunderstorm=dark+intense, rain=melancholy,
    clear+hot=energetic, snow=calm+acoustic, etc.)
  → Returns matching library tracks

GET /search/preview?track_name=&artist=
  → Searches Deezer API for 30-second preview URL
  → Returns {found, preview_url}
```

### `/discovery/*` — `backend/api/routes/discovery.py`

```
GET /discovery/for-me
  Params: user_id, vibe (plain English), seed_song, artists (comma-sep),
          language (en|en+hi|en+hi+bn|any), min/max tempo/energy/valence, size
  
  Algorithm:
  1. Build three taste profiles from DB:
     - hour_profile: avg features from listening_history ±2 hours of current time
     - recent_profile: avg features from last 7 days of listening_history
     - alltime: avg features from all tracks
  2. If artists specified, also build artist_profile from their library tracks
  3. Merge with weights: recent(0.5)+hour(0.3)+alltime(0.2) or artist(0.5)+recent(0.25)+hour(0.15)+alltime(0.1)
  4. Apply vibe text override (parses: hype/chill/sad/happy/party/late night/etc.)
  5. Apply manual feature overrides
  6. Get seed tracks from listening_history (recent plays)
  7. Call ReccoBeats /track/recommendation with seeds + target features
  8. Filter by language (Latin-script check heuristic, no non-English for 'en' mode)
  9. Returns {library_matches (3 from your library), tracks (new discoveries), context}

GET /discovery/similar-to?track_name=&size=
  → Find one track in library by name
  → Call ReccoBeats seeded from that track's features
  → Returns similar recommendations
```

### `/nowplaying/*` — `backend/api/routes/nowplaying.py`

```
GET /nowplaying/current
  → Polls Spotify for currently playing track
  → Looks up audio features from local DB
  → Returns {track_name, artist, album, album_art, progress_ms, duration_ms,
             is_playing, energy, valence, tempo, in_library, spotify_url}

GET /nowplaying/lyrics-meaning?track_name=&artist=
  → Searches Genius for the track
  → Returns {description, annotations, pageviews, genius_url}
  → Powers the "What's this about?" panel in NowPlaying bar

GET /nowplaying/deezer-preview?track_name=&artist=
  → Searches Deezer for preview URL
  → Returns {found, preview_url}
  → Used by usePreview hook everywhere
```

### `/albums/*` — `backend/api/routes/albums.py`

```
GET /albums/explore?album_name=&artist_name=
  → Searches ReccoBeats for album
  → Fetches all tracks with audio features
  → Calculates taste_score per track (0-1 similarity to user's avg profile)
  → Fetches Last.fm genre tags
  → Returns {album metadata, taste_comparison, entry_points (top 3 tracks),
             tracks with scores, which tracks you own}

GET /albums/blind-spots?limit=10
  → Gets top 50 artists from library
  → Calls Last.fm artist.getTopTags for each
  → Finds genres you've touched (1-5 artists) but never gone deep on (<50 songs)
  → Returns ranked list of underexplored genres

GET /albums/debug-lastfm?artist=  ← debug endpoint
```

### `/collab/*` — `backend/api/routes/collab.py`

```
POST /collab/create  body: {name, owner_id}
  → Creates room with random 8-char uppercase ID
  → Returns {room_id}

POST /collab/submit  body: {room_id, track_id, track_name, artist_name, album_name, submitted_by}
  → Adds track to room (prevents duplicates)
  → Auto-upvotes submitter
  → Returns {submission_id}

POST /collab/vote  body: {submission_id, voter_name, vote}
  → vote: +1, 0 (remove vote), or -1
  → Upserts with ON CONFLICT

GET /collab/search/tracks?q=
  → Searches Spotify catalog (not user library)
  → Returns tracks with album art for adding to rooms

GET /collab/{room_id}?voter_name=
  → Returns full room state: all submissions sorted by score desc
  → Each submission includes: track info, total score, your personal vote
  → Frontend polls this every 5 seconds

POST /collab/{room_id}/finalize?min_score=0
  → Creates real Spotify playlist with all submissions above min_score
  → Returns {playlist_url}
```

### `/playlists/*` — `backend/api/routes/playlists.py` (NEW)

```
POST /playlists/setup
  → Creates smart_playlists table (if not exists)
  → Adds language column to tracks (if not exists)
  → Runs Unicode script detection on all tracks
  → Sets remaining to 'english'
  → Returns {setup, script_detected, non_english_tracks, total_tracks}
  → ALREADY RAN — safe to re-run

POST /playlists/enrich-language?limit=2000
  → Calls Last.fm artist.getTopTags for every unique artist in library
  → Uses keyword matching to detect language (exact artist name match, NOT LIKE)
  → Only updates tracks currently tagged 'english'
  → ALREADY RAN for all 2560 artists — safe to re-run after adding new saves
  → Returns {artists_checked, enriched_tracks, enriched_artists}

GET /playlists/languages
  → Returns language breakdown: [{language, count}]

POST /playlists/preview  body: PreviewBody
  → Runs rule conditions + excludes against tracks table
  → Returns {tracks, stats: {count, avg_energy, avg_valence, avg_tempo,
             happy_pct, dark_pct, unique_artists, languages}}

GET /playlists/
  → Lists all saved smart_playlists for user

POST /playlists/  body: SaveBody
  → Saves rule to smart_playlists table
  → If playlist_name: creates new Spotify playlist and fills it immediately
  → If playlist_id: links existing playlist and fills it
  → Returns {id, playlist_id, playlist_url, message}

PUT /playlists/{smart_id}  body: SaveBody
  → Updates rule in DB
  → If a Spotify playlist is linked, auto-syncs it (re-runs rule, replaces contents)
  → Returns {updated, synced}

DELETE /playlists/{smart_id}
  → Deletes from smart_playlists table

POST /playlists/{smart_id}/sync
  → Re-runs rule, replaces Spotify playlist contents entirely
  → Returns {synced: N}

POST /playlists/{smart_id}/rotate  body: RotateBody
  → Gets current playlist tracks from Spotify
  → Computes playlist's own audio profile from DB
  → Scores each current track against profile, ejects bottom N
  → Gathers replacements based on rotation_source:
    - 'library': re-runs original rule, picks best-fitting unused library tracks
    - 'similar': Last.fm artist.getSimilar for playlist artists → their library tracks
    - 'discover': ReccoBeats recommendations seeded from current playlist tracks
  → Calls Spotify to remove ejected + add replacements
  → Returns {rotated, rotation_source, removed: [names], added: [names]}
```

---

## Condition System (Playlists Engine)

The `cond_to_sql(cond, exclude)` function translates condition dicts to SQL.

**Condition dict shape:** `{field, op, value}`

| field | op values | value type | Notes |
|---|---|---|---|
| `language` | `eq` | string | bengali\|hindi\|arabic\|english\|spanish\|french\|japanese\|chinese\|punjabi\|tamil\|urdu\|portuguese |
| `mood` | `eq` | string | happy\|neutral\|dark — maps to valence ranges |
| `decade` | `eq` | string | 2020s\|2010s\|2000s\|90s\|80s\|70s\|60s\|older |
| `energy` | `gte`\|`lte`\|`between` | float 0-1 or [float, float] | |
| `valence` | `gte`\|`lte`\|`between` | float 0-1 or [float, float] | |
| `tempo` / `bpm` | `gte`\|`lte`\|`between` | float BPM or [float, float] | |
| `danceability` | `gte`\|`lte` | float 0-1 | |
| `acousticness` | `gte`\|`lte` | float 0-1 | |
| `speechiness` | `gte`\|`lte` | float 0-1 | |
| `release_year` | `gte`\|`lte`\|`between` | int or [int, int] | |
| `artist` | `contains`\|`eq` | string | LIKE-based search |
| `saved_days` | `lte` | int | "saved within last N days" |

`exclude=True` inverts the logic (NOT conditions).

**Pydantic models:**

```python
class PreviewBody:
    conditions: list = []      # list of condition dicts
    excludes:   list = []      # list of exclude condition dicts
    sort_by:    str = "saved_at"   # saved_at|energy|valence|tempo|danceability|acousticness|artist|name|release_year
    sort_order: str = "desc"       # asc|desc
    limit:      int = 200
    user_id:    str = "0tz6fep2m5bx1vq85g48518u9"

class SaveBody(PreviewBody):
    name:             str
    spotify_mode:     str = "new"  # new|existing|none|keep
    playlist_name:    Optional[str]   # create new Spotify playlist
    playlist_id:      Optional[str]   # or link existing
    rotation_enabled: bool = False
    rotation_size:    int = 5
    rotation_source:  str = "library"  # library|similar|discover

class RotateBody:
    user_id:         str
    rotation_size:   Optional[int]   # overrides saved default
    rotation_source: Optional[str]   # overrides saved default
```

---

## Frontend: All Pages

### Design System (applied everywhere, all inline styles)

```js
// Colors
"#080808"   background
"#0e0e0e"   card background
"#111111"   secondary card / input background
"#1a1a1a"   border
"#1db954"   Spotify green (primary accent)
"#0d2b18"   green tinted background (selected/active states)
"#1a4a2a"   green border (highlighted cards)
"#6366f1"   indigo (dark/sad mood)
"#f59e0b"   amber (neutral mood)
"#ef4444"   red (error/exclude)
"#888888"   secondary text
"#555555"   muted text
"#444444"   label text (uppercase caps)

// Typography
fontWeight: 800  → headers
fontWeight: 700  → buttons
fontWeight: 600  → pills, labels
fontWeight: 500  → body

// Cards: background "#0e0e0e", border "1px solid #1a1a1a", borderRadius "12-14px"
// Pills (filter chips): active = green bg + black text, inactive = "#151515" + muted
// Play buttons: 30-32px circle, green when playing, "#1a1a1a" idle
// No gradients, no box-shadows (except NowPlaying lyrics panel), no CSS files
// All styles inline
// Layout: max-width 1000-1100px centered, padding 40px, bottom padding 80px
```

### `App.jsx` — Router
Routes: `/` `/wrapped` `/library` `/songs` `/search` `/discovery` `/albums` `/timeline` `/capsule` `/collab` `/collab/:roomId` `/playlists`

Glassmorphism sticky nav: `rgba(8,8,8,0.95)` with `backdrop-filter: blur(12px)`

`<NowPlaying />` fixed at bottom on every page.

### `NowPlaying.jsx` (component, not a page)
- Fixed bottom bar, z-index 1000, 80px height
- Polls `/nowplaying/current` every 30 seconds
- Local JS interval advances progress bar every second between polls (smooth)
- Shows: album art, track name, artist, BPM pill, mood color pill, energy %
- "What's this about?" opens Genius description panel (slides up, shadow)
- "IN LIBRARY" badge when track is in saved library
- "Open ↗" link to Spotify

### `usePreview.js` (hook)
- Fetches from `/nowplaying/deezer-preview`
- Creates `<audio>` element, manages play/pause
- Falls back to opening Spotify if no preview found
- `play(trackId, trackName, artist)` / `stop()` / `playing` (current trackId or null)
- Used on: Search, LikedSongs, TimeCapsule, Collab, Playlists

### `SonicIdentity.jsx` — `/`
- Radar chart (6 audio features via Recharts)
- Mood donut (dark/neutral/happy)
- Energy donut (calm/medium/intense)
- Stat pills: avg BPM, dominant key, total analyzed
- Rabbit holes: artists you binged fastest (shortest time first→last save)
- Fetches: `/stats/sonic-identity`

### `Wrapped.jsx` — `/wrapped`
- Period toggle: day/week/month/year
- Stat cards: total listening time, top artist, top song
- Top 10 artists (bar chart), top 10 songs
- Listening clock: 24-hour radial bar chart (when you listen most)
- Fetches: `/stats/wrapped?period=X` + `/stats/all-time`

### `Library.jsx` — `/library`
- Three tabs: Duplicates / Dead Saves / Top Artists
- Duplicates: songs saved multiple times (279 found)
- Dead Saves: saved 365+ days ago, never played
- Top Artists: relative bar chart by save count
- Fetches all three on mount in parallel

### `LikedSongs.jsx` — `/songs`
- Full library browser
- Sort by: date saved, energy, mood, BPM, artist, title, release year (toggle asc/desc)
- Quick decade filter chips: All, 2020s, 2010s, 2000s, 90s, 80s, 70s, Older
- Advanced filters (toggle): mood, min energy, BPM range, artist text, year range
- Pagination: 50 tracks, "Load more" button
- Deezer play button per track
- Release year badge, energy %, mood color on each row

### `Search.jsx` — `/search`
- Two modes (toggle): NLP / Filters
- **NLP mode**: free text → `/search/nlp` → shows green "interpreted as" badge
  - Quick suggestion chips below input
- **Filter mode**: text + artist + BPM range + energy range + mood + year + acousticness
  - Quick vibe presets: Late Night, High Energy, Sad Hours, Good Vibes, Acoustic, Dance Floor, Focus, 90s, 2000s, 2010s
- **Weather button**: geolocation → `/search/weather-vibe` → context-aware results
- Deezer play buttons on all results

### `Discovery.jsx` — `/discovery`
- Quick vibe emoji buttons: Late Night 🌙, Hype 🔥, Sad Hours 💧, Deep Focus 🎧, Good Vibes ☀️, Acoustic 🎸, Dance Floor 🕺, Driving 🚗, Nostalgic 📼, Gym 🏋️
- Text vibe input, seed song input
- Advanced filters (collapsible): artists (comma-sep), language selector, mood, tempo range
- Results: two sections — Library matches (green bg, already saved), New discoveries (dark bg)
- Context row: time of day, target features, which profiles were used

### `Albums.jsx` — `/albums`
- **Explorer tab**: search album + artist → `/albums/explore`
  - Taste match % (color coded), energy/mood comparison bars
  - Entry points: top 3 recommended tracks (green highlight)
  - Full track list with scores, owned badges
- **Blind Spots tab**: `/albums/blind-spots`
  - Genres you've partially explored but never gone deep on

### `Timeline.jsx` — `/timeline`
- Requires 2+ months of listening history
- Feature toggles: mood, energy, acoustic, danceability
- Recharts line chart: monthly averages over time
- Insight cards: mood drift %, energy drift %, biggest shift month
- Monthly breakdown table

### `TimeCapsule.jsx` — `/capsule`
- Year selector (past 10 years)
- Month grid (6×2, future months disabled)
- Fetches songs saved in selected month via `/library/liked-songs` date filters
- Stats row: count, avg BPM, avg energy, unique artists
- Sort options within preview
- "Create Spotify Playlist" → `POST /library/time-capsule` → links to created playlist
- Deezer play buttons

### `Collab.jsx` — `/collab` and `/collab/:roomId`
- Stage 1: Create room (name + your name) or enter room code
- Stage 2: Name prompt when joining via URL link
- Stage 3: Room view
  - Song search (debounced Spotify catalog search → `/collab/search/tracks`)
  - Submission list sorted by score: rank, play button, name, submitted by, vote buttons (±), score badge
  - Can't vote on own submissions
  - Finalize section: score threshold selector → creates Spotify playlist
  - Share link button (copies room URL)
  - Polls `/collab/{room_id}` every 5 seconds

### `Playlists.jsx` — `/playlists` (NEW)
**Builder tab:**
- Quick preset chips (13 presets): All Bengali 🇧🇩, All Hindi 🇮🇳, Bangers 🔥, Sad Hours 🌧, Good Vibes ☀️, Acoustic 🎸, Dance Floor 🕺, 2010s Nostalgia 📼, Gym/Run 🏋️, New Saves ✨, Late Night 🌙, Deep Focus 🎧, Slow & Mellow 🕯
- **Conditions section**: `+ Add condition` → field dropdown + op dropdown + value input
  - Field dropdown: Language, Mood, Decade, Energy, Valence, Tempo, Danceability, Acousticness, Speechiness, Release Year, Artist, Saved Within
  - Value input type adapts: dropdown for enums, slider+number for 0-1 ranges, number for BPM/year, text for artist, number+days for saved_days
- **Exclude section** (red accent): same builder but these cut tracks from results
- Sort + Limit controls
- Preview → stats bar (count, avg BPM, energy, mood split, language breakdown)
- Search-within-results input
- "Save as Playlist →" opens save modal

**Save modal:**
- Rule name input
- Spotify mode: Create new / Link existing / Save rule only
- Rotation toggle: size (3/5/8/10/15 tracks) + source (Library/Similar Artists/Discover)
- When editing: pre-fills name, links existing playlist_id, rotation settings

**My Playlists tab:**
- Language Detection card: "Run Setup" + "Enrich (Last.fm)" buttons
- Each saved playlist card:
  - Name + Spotify link
  - Condition chips summary (green for conditions, red for excludes)
  - Rotation config + last synced/rotated timestamps
  - Sync Now / Rotate / Edit / Delete buttons
- **Rotate modal**: size selector + source radio buttons + before/after diff after rotation

---

## Language Detection System

**Two-phase detection:**

**Phase 1 — Script detection (fast, no API):**
Unicode ranges for: bengali (0x0980-09FF), hindi/devanagari (0x0900-097F), arabic (0x0600-06FF), punjabi/gurmukhi (0x0A00-0A7F), tamil (0x0B80-0BFF), telugu (0x0C00-0C7F), kannada (0x0C80-0CFF), malayalam (0x0D00-0D7F), korean (0xAC00-D7AF), chinese (0x4E00-9FFF), japanese hiragana (0x3040-309F), russian (0x0400-04FF).

Catches tracks where the track name OR artist name contains non-Latin script characters.

**Phase 2 — Last.fm enrichment (slower, ~2-5 min for full library):**
For each unique artist (ordered by save count), calls `artist.getTopTags`, checks against `LASTFM_LANG_MAP`. Uses **exact artist name match** (not LIKE — LIKE caused false positives on substrings like 'ali' in 'Khalid').

**Critical: keywords that caused false positives and were removed:**
- `"bossa nova"` from Portuguese — English/Japanese artists playing bossa nova style were wrongly tagged
- `"chanson"` (plain) from French — applied to English singer-songwriters on Last.fm
- `"latin"`, `"flamenco"` from Spanish — too broad

**Current detection results (already run, stored in DB):**
- 106 tracks from script detection
- ~600 more from Last.fm enrichment across all 2,560 artists
- Total: ~680 non-English tracks correctly tagged
- False positives fixed: Laufey, Clairo, Khalid, Alice Phoebe Lou, Alicia Keys removed from french/portuguese

---

## Coding Patterns (follow these exactly)

**Backend pattern:**
```python
from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Optional
import psycopg2, json, os, requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))
router  = APIRouter()
DB_URL  = os.getenv("DATABASE_URL")
DEFAULT_USER = "0tz6fep2m5bx1vq85g48518u9"

def get_conn():
    return psycopg2.connect(DB_URL)

# Spotipy client pattern (always use this, not the spotify_client.py helper)
def get_spotify():
    import spotipy
    from spotipy.oauth2 import SpotifyOAuth
    CACHE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '.cache'))
    return spotipy.Spotify(auth_manager=SpotifyOAuth(
        client_id=os.getenv("SPOTIFY_CLIENT_ID"),
        client_secret=os.getenv("SPOTIFY_CLIENT_SECRET"),
        redirect_uri=os.getenv("SPOTIFY_REDIRECT_URI"),
        scope=" ".join(["user-library-read","user-read-recently-played","user-top-read",
               "playlist-read-private","playlist-modify-public","playlist-modify-private",
               "user-read-currently-playing","user-read-playback-state"]),
        open_browser=False, cache_path=CACHE,
    ))
```

**Frontend pattern:**
```jsx
// API base URL
const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// All styles are inline — no CSS files
// Design tokens defined as const C = {...} at top of file
// usePreview hook used for audio: const { playing, play, stop } = usePreview()
// All pages use: maxWidth 1000-1100px, margin "0 auto", padding "36-40px 24px 100px"
```

**Spotify playlist operations:**
```python
# Fill a playlist (replace all contents):
sp.playlist_replace_items(playlist_id, [])
for i in range(0, len(track_ids), 100):
    sp.playlist_add_items(playlist_id, [f"spotify:track:{t}" for t in track_ids[i:i+100]])

# Remove tracks (pass string URIs, NOT dicts):
sp.playlist_remove_all_occurrences_of_items(
    playlist_id, [f"spotify:track:{t}" for t in track_id_list]
)
```

---

## Known Issues / Bugs / Caveats

1. **ReccoBeats album search** is slow (30s+ timeouts). Retry logic added in `albums.py` but intermittent.
2. **Timeline page** needs 2+ months of listening history to show meaningful data. Currently only 167 plays.
3. **Collab rooms** don't persist across browser refreshes for the user name (stored in localStorage).
4. **Time Capsule** fetches 200 tracks and filters client-side, so month counts might be approximate for months with >200 saves.
5. **Language detection is not exhaustive** — runs against Last.fm which has incomplete tag data. Some Bengali/Hindi artists with no Last.fm tags will be stuck as 'english'. Can't fix without manual tagging.
6. **`smart_playlists` has 0 rows** — Sid hasn't created any yet. The system is fully built but untested end-to-end with real Spotify playlists.
7. **`automations` table** exists but the UI and backend logic for auto-playlist rules is not built yet (only the DB table).

---

## Unbuilt Features (Planned)

These were designed but not implemented:

1. **Auto-Playlist Rules** — `automations` table exists. Need: backend CRUD for rules with condition-based SQL, periodic checker to add new saves that match rules to Spotify playlists, frontend rule builder page.

2. **One-Song Entry Points** — For each new/unfamiliar artist, score all their tracks against your taste profile and return the single best starting track. Would be a new endpoint at `/discovery/entry-points`.

3. **Daily Smart Playlist** — One button generates today's perfect 20-track playlist using weather (Open Meteo) + current hour-of-day listening profile + recent mood. Pushes to Spotify as "Fidolio Daily – June 14".

4. **Artist DNA** — Full relationship tracker for any artist: when you first saved them, peak save month, how their sound compares to your overall taste, play counts per track, Last.fm genre tags.

5. **Genre Pulse** — Last.fm tags for your last 7 days of listening_history vs all-time distribution. "This week: mostly rap, post-punk, indie rock" with up/down trend arrows.

6. **PWA deployment** — Railway (backend + PostgreSQL + poller cron), Vercel (frontend), manifest.json + service worker for mobile installability.

---

## Git History

```
b42c69e  Polish smart playlist sync flows
76910aa  feat: smart playlists — rule builder, Spotify sync, and auto-rotation
f6506e0  release year backfill, NLP search fixes, collab route fix
a137f82  release year filtering, time capsule page, liked songs sorter improvements
71005b4  add liked songs sorter and taste timeline frontend pages
9258137  fix: remove cache files from tracking, enforce gitignore
fcbc0c2  Deezer previews, liked songs sorter, time capsule, taste timeline, top albums, smooth now playing
88b5f3e  add discovery engine, now playing bar, album explorer, blind spots, ReccoBeats/Last.fm/Genius/Deezer
79aebb3  initial project scaffold
```

---

## To Start a New Claude Chat

1. Paste this entire document
2. Mention which feature you want to work on
3. If adding a new backend route: follow the `get_conn()` + `router = APIRouter()` pattern, register in `main.py`
4. If adding a new page: follow inline-style pattern with design tokens from the system above, add to `App.jsx` NAV_LINKS + Routes
5. Run `source .venv/bin/activate` before any Python commands
6. DB is already set up and migrated — do not re-run `setup_db.py` or `migrate_playlists.py` from scratch
