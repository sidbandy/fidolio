# Fidolio Deployment Guide

Goal: backend on **Railway** (with managed Postgres + a cron poller), frontend on
**Vercel**, usable from your phone. Local dev still works exactly as before.

---

## Phase 1 — code prep (DONE)

- All frontend pages read `import.meta.env.VITE_API_URL` (falls back to localhost).
- Backend CORS reads `CORS_ORIGINS` env (comma-separated) + allows `*.vercel.app`.
- `backend/Procfile`, `frontend/vercel.json` (SPA rewrites), and `.env.example`
  files added.

---

## Phase 2 — deploy

### A. Backend → Railway

1. Create a [Railway](https://railway.app) project, "Deploy from GitHub repo" → pick `fidolio`.
2. In the service **Settings → Root Directory**, set `backend`.
   (Railway then finds `requirements.txt` + `Procfile` automatically.)
3. **Add a Postgres database**: New → Database → PostgreSQL. Railway sets `DATABASE_URL`
   on the service automatically.
4. **Variables** (Settings → Variables) — add:
   ```
   SPOTIFY_CLIENT_ID       = ...
   SPOTIFY_CLIENT_SECRET   = ...
   SPOTIFY_REDIRECT_URI    = https://<your-railway-domain>/auth/callback
   LASTFM_API_KEY          = ...
   GENIUS_ACCESS_TOKEN     = ...
   CORS_ORIGINS            = https://<your-vercel-domain>
   ```
   (`DATABASE_URL` is injected by the Postgres plugin — don't set it manually.)
5. Deploy. Note the public domain Railway gives you (e.g. `fidolio-production.up.railway.app`).

### B. Migrate your data to Railway Postgres

Your 11,666 tracks live in local Postgres. Move them:

```bash
# 1. Dump local DB
pg_dump "postgresql://sid@localhost/fidolio" --no-owner --no-acl -f fidolio_dump.sql

# 2. Get the Railway connection string (Railway → Postgres → Connect → Postgres Connection URL)
# 3. Restore into Railway
psql "<railway-postgres-url>" -f fidolio_dump.sql
```

### C. Spotify token in the cloud

The backend authenticates via the `.cache` token file, which is NOT committed.
Two options:
- **Simplest:** add the contents of your local `.cache` as a Railway variable and write
  it to disk on boot, **or**
- run the OAuth flow once against the deployed callback.

We'll wire whichever you prefer when you're at this step (it needs a small boot hook).

### D. Frontend → Vercel

1. [Vercel](https://vercel.com) → New Project → import `fidolio` repo.
2. **Root Directory:** `frontend`. Framework preset: Vite.
3. **Environment Variable:** `VITE_API_URL = https://<your-railway-domain>`
4. Deploy. Vercel gives you `https://fidolio.vercel.app` (or similar).
5. Go back to Railway and set `CORS_ORIGINS` to that Vercel URL; update the Spotify
   app's Redirect URI to the deployed callback.

---

## Phase 3 — poller as a Railway cron

Add a **second Railway service** in the same project (same repo, root `backend`):
- **Start command:** `python ../scripts/poller_once.py` (a single-shot version)
- **Cron schedule:** `*/30 * * * *` (every 30 min)

This replaces leaving `poller.py` running on your laptop. (We'll add `poller_once.py`
— a run-once variant — when you reach this phase.)

---

## Phase 4 — PWA / mobile

- `frontend/public/manifest.json` + icons → "Add to Home Screen"
- service worker for offline shell
- responsive nav (the top nav needs to wrap/scroll on small screens)
- touch-sized tap targets

---

## Local dev (unchanged)

```bash
# backend
source .venv/bin/activate && cd backend && uvicorn api.main:app --reload --port 8000
# frontend
cd frontend && npm run dev
# poller (optional)
python scripts/poller.py
```
