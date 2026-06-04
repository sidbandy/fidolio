# 🎵 Fidolio

> Your Spotify library, actually understood.

Fidolio is a personal music intelligence platform that fixes everything Spotify won't. It connects to your Spotify account and gives you real listening stats, powerful library management tools, natural language search through your own songs, and smart playlist automation — all things Spotify has never built.

## Features

- **Live Wrapped** — Spotify Wrapped that refreshes daily. See your top artists, songs, and listening hours for any time period, not just once a year.
- **Library Manager** — Find duplicates, dead saves, ghost tracks, and cross-playlist clutter across your entire library.
- **Song Memory Search** — Search your own library in plain English. "That sad slow one I saved in 2022" actually works.
- **Collab Playlists** — Share a room link, submit songs, vote, and auto-build a playlist from the winners.
- **Smart Automations** — Auto-update playlists based on rules. "Add every song I save above 140 BPM to this playlist."
- **Discovery Engine** — Find artists who sound like what you specifically love, not just your genre.

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | Python, FastAPI |
| Database | PostgreSQL + pgvector |
| Data / ML | pandas, scikit-learn, spotipy |
| Frontend | React, D3.js, TailwindCSS |
| Auth | Spotify OAuth 2.0 |
| Deploy | Railway (backend), Vercel (frontend) |

## Getting Started

```bash
# Clone the repo
git clone https://github.com/yourusername/fidolio.git
cd fidolio

# Backend setup
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Add your Spotify credentials
cp .env.example .env
# Fill in SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, DATABASE_URL

# Run the poller (starts collecting your listening history)
python scripts/poller.py

# Start the backend
uvicorn api.main:app --reload

# Frontend setup (new terminal)
cd frontend
npm install
npm run dev
```

## Project Structure

```
fidolio/
├── backend/
│   ├── api/          # FastAPI routes
│   ├── core/         # Auth, config, Spotify client
│   ├── db/           # Database models and migrations
│   └── services/     # Business logic (stats, search, library)
├── frontend/
│   └── src/
│       ├── components/
│       ├── pages/
│       └── hooks/
└── scripts/          # Poller, data ingestion scripts
```

---

Built by [Your Name] · UT Austin CS · 2025
