# Fidolio — Multi-User + Demo Handoff (authoritative)

> Read this top-to-bottom before touching anything. The app is a **personal Spotify-analytics web app**
> (React 18 + Vite on Vercel; FastAPI + Postgres on Railway). The **multi-user system + public demo are
> built and deployed.** The only thing between "works" and "broken" right now is **two env values that
> were set to a literal placeholder** (see §1). Everything else is verified working.

---

## 1. ⛔ DO THIS FIRST — the only thing currently broken (env placeholders)

The live site shows an empty "shell" and login fails **purely because two env vars were set to the literal
string `railway_url`** (a placeholder from earlier instructions) instead of the real Railway domain. The
backend, DB, migrations, and CORS are all confirmed healthy. Fix these in the dashboards (no code change):

| Where | Variable | Set to EXACTLY |
|---|---|---|
| **Vercel** → Settings → Environment Variables | `VITE_API_URL` | `https://fidolio-production.up.railway.app` |
| **Railway** → backend service → Variables | `SPOTIFY_REDIRECT_URI` | `https://fidolio-production.up.railway.app/auth/callback` |
| **Railway** → backend service → Variables | `FRONTEND_URL` | `https://fidolio.vercel.app` |
| **Railway** → backend service → Variables | `SESSION_SECRET` | any long random string (`openssl rand -hex 32`) |
| **Spotify** dashboard → app → Settings → Redirect URIs | (add) | `https://fidolio-production.up.railway.app/auth/callback` |

- After changing **`VITE_API_URL`** you MUST **Redeploy on Vercel** (Vite inlines it at build time).
- `SPOTIFY_REDIRECT_URI` (Railway) and the Spotify dashboard redirect URI must be **character-for-character
  identical** (https, no trailing slash). This is the #1 thing people get wrong.
- Verify: open `https://fidolio-production.up.railway.app/auth/login` in a browser — it should bounce to
  Spotify. And `https://fidolio.vercel.app` should show the demo data after the Vercel redeploy.

**Real values (known good):** backend = `fidolio-production.up.railway.app`, frontend = `fidolio.vercel.app`.

---

## 2. ⚠️ CRITICAL GOTCHA — local DB ≠ prod DB

`backend/.env` `DATABASE_URL` points to **`localhost/fidolio` — a LOCAL Postgres on the dev machine.** The
**prod database is a separate Railway Postgres.** Migrations/data changes you run locally do NOT touch prod.
This caused hours of confusion ("works locally, empty in prod"). Always be explicit about which DB:

- **Local dev DB:** `postgresql://postgres:postgres@localhost:5432/fidolio` (whatever is in `.env`). Has a
  full copy of Sid's library used for local testing.
- **Prod Railway DB (public, for one-off admin from a laptop — incurs egress fees):**
  `postgresql://postgres:NxHsVfrnhwKyCMHEgfmlaDzKMnOvuZdN@acela.proxy.rlwy.net:18475/railway`
- **Prod Railway DB (internal, what the backend uses):** `postgres.railway.internal:5432/railway`
- Prod already has the data (11,828 tracks for user `0tz6fep2m5bx1vq85g48518u9`, 9,771 enriched, 415 plays).
- **Schema migrations now auto-apply on deploy** (see §4), so you normally never touch prod SQL by hand.

---

## 3. What the multi-user system is (architecture)

Single Spotify "owner" (Sid, id `0tz6fep2m5bx1vq85g48518u9`) + friends who log in + everyone else as a
**read-only public demo of the owner's library** (Spotify dev mode caps real logins — see §6).

- **Identity = Spotify user id.** `users` table holds each account's token (`token_info` JSON) + profile +
  sync state. Files: `backend/core/users.py` (CRUD + `DBCacheHandler` so spotipy refreshes per-user tokens;
  uses `_cursor()` which ALWAYS closes the connection — earlier code leaked connections), `backend/core/session.py`
  (stdlib HMAC-signed **HttpOnly cookie** `fidolio_session`; no extra deps).
- **Auth routes** `backend/api/routes/auth.py`: `/auth/login` → Spotify consent; `/auth/callback` → exchange
  code, upsert user + token, set cookie, kick first-sync for NEW users, redirect to `FRONTEND_URL`;
  `/auth/me` → `{authenticated:true, …}` for logged-in, `{authenticated:false, demo_owner}` for guests;
  `/auth/logout`. Cookie is `SameSite=None;Secure` when `FRONTEND_URL` is https (cross-site Vercel↔Railway).
- **Two dependencies** (`backend/api/deps.py`):
  - `get_current_user` = READ scope → logged-in user, else `DEFAULT_USER_ID` (the demo owner). On all
    stats/analysis/read endpoints. This is what makes the guest demo work.
  - `require_user` = WRITE scope → real login only, **401 for guests**. On every endpoint that writes to a
    Spotify account or the DB: `/library/unsave`, `/library/sync*`, `/library/enrich-backfill`,
    `/playlists` create/update/delete/sync/rotate/from-tracks, `/stats/refresh-listening`. **This protects
    the owner's account — a demo visitor can never modify Sid's Spotify or data.** (Animations still play
    client-side; the write just 401s.)
- **Per-user data model** (composite keys so users can share songs/plays): `tracks` PK `(user_id, id)`,
  `listening_history` UNIQUE `(user_id, played_at)`. Every query is `WHERE user_id = %s`.
- **Per-user sync** `backend/sync_library.py` `sync_saved_tracks(user_id, progress=…)`: incremental adds +
  removal reconciliation (un-saves on Spotify/Health drop locally) + a **feature-copy optimization** (a
  popular song already enriched under another user inherits its audio features instead of re-hitting
  ReccoBeats). `backend/core/user_sync.py` `start_first_sync` runs it in a thread (progressive `sync_status`).
- **Poller** `backend/run_poller.py` + the in-app loop in `backend/api/main.py`: records **plays hourly**
  for every user; runs the heavier **library sync ≤ once a day per user** (`_library_sync_due`). New users
  full-sync on login; returning users are kept fresh by the daily poller (NOT on every login).
- **Now Playing** `/nowplaying/current` uses the per-user Spotify client + scopes the library check to the user.
- **Caching for the demo** (so it loads fast for visitors): `/stats/sonic-identity` (30-min per-user cache,
  `_SONIC_CACHE`), `/stats/top-albums-rich` (`_TOP_ALBUMS_CACHE`), `/albums/blind-spots` (`_BS_CACHE`),
  `core/similarity._STATS_CACHE`. `core/invalidate.invalidate_user(uid)` clears them when a library changes.
  `main.py` `_warm_demo_cache` pre-computes the demo owner's sonic-identity on boot.

### Frontend (auth gate + demo)
- `frontend/src/main.jsx`: patches `window.fetch` to add `credentials:"include"` on all API calls (the
  cookie is cross-site).
- `frontend/src/context/AuthProvider.jsx`: `status` = `loading | guest | authed`; exposes `user`,
  `demoOwner`, `isGuest`, `login()`, `logout()`.
- `frontend/src/App.jsx` `Gate`: loading→Splash; **guest → landing `Login` page (single "See live demo"
  button) → enter the app (read-only demo) with a green `DemoBanner`**; authed-with-data → app; authed-new
  user (no tracks yet) → `SyncGate` "building your library". `sessionStorage("fidolio_demo")` remembers a
  guest clicked into the demo.
- `frontend/src/components/Login.jsx` (themed landing), `SyncGate.jsx` (progressive), `Spine.jsx` shows the
  account name + **Log out** for logged-in users, **Log in with Spotify** for guests (desktop + mobile).

---

## 4. Deploy + migrations (how it ships)

- **Push to `main` auto-deploys** Vercel (frontend) + Railway (backend). Only push when asked. Always
  `cd frontend && npm run build` first (Vite won't catch a missing import at dev runtime; a bad import in
  `Spine`/`NowPlaying` black-screens the app — they mount OUTSIDE the route `ErrorBoundary`).
- **Migrations auto-apply on backend boot:** `main.py` `_run_migrations` runs each `backend/migrations/*.sql`
  once, tracked in a `schema_migrations` table. The 3 existing migrations (001 users table, 002 tracks
  composite PK, 003 listening per-user unique) are already applied + marked in prod. **To add schema: drop a
  new numbered idempotent `.sql` in `backend/migrations/` and deploy — it applies itself.** Never edit an
  already-applied migration; add a new one.

---

## 5. Verified working (as of this handoff)

- Prod backend healthy: `GET /` 200, `/auth/me` → `{authenticated:false, demo_owner:"sid"}`,
  `/stats/sonic-identity` → 9,771 analyzed / "Brooding" / peak 2025 in ~0.24s, CORS echoes
  `https://fidolio.vercel.app` with `allow-credentials:true`.
- New-user simulation (300-track synthetic user): all 10 stat/analysis endpoints return correct
  **per-user-scoped** data, no leaks, no errors.
- Guest writes 401 (owner protected); guest reads return demo data.
- The ONLY failing thing is the live frontend calling `https://railway_url/...` → fixed by §1.

---

## 6. Constraints + what's NOT done

- **Spotify dev mode: ~5 user cap.** Extended Quota Mode requires a registered company with 250k+ MAU — not
  attainable for a personal project. **The public demo mode IS the answer** to "anyone can see it"; up to ~5
  allow-listed friends (added by email in the Spotify dashboard → User Management) get their own real login.
- **Login end-to-end has NOT been tested live** (needs §1 redirect-URI fix + a real Spotify login). All
  pieces are unit-verified.
- **Mobile theme:** `Spine.jsx` `MobileSpine` still uses a leftover cream/light header + drawer
  (`rgba(241,236,224,…)`) and the Collab QR `bgcolor=F1EDE4` — off-theme vs the dark Y2K look. Not yet fixed.
- **FUTURE (do NOT act on now):** Railway free usage stops at ~$5 / 20 days. A longer-term host (Render,
  Fly.io, a paid Railway plan, or splitting DB to Supabase/Neon) is worth planning later. The user said
  "later, don't think about this now."

---

## 7. Local dev quickstart (for the next session)

```
# backend (uses the LOCAL db in backend/.env — NOT prod)
cd backend && ENABLE_POLLER=0 venv/bin/python -m uvicorn api.main:app --port 8000 --log-level warning
# frontend
cd frontend && npm run dev -- --host 127.0.0.1 --port 5173   # CORS allows :5173
```
- Verify data views on **:5173** (vite dev), NOT `npm run preview` (:4173 is CORS-blocked).
- To test the authed app locally, set a signed cookie:
  `python -c "from dotenv import load_dotenv; load_dotenv('.env'); from core.session import sign; print(sign('0tz6fep2m5bx1vq85g48518u9'))"`
  and load the page via **`localhost:5173`** (same-site with `localhost:8000` so the dev `SameSite=Lax`
  cookie is sent — `127.0.0.1` vs `localhost` is cross-site and the cookie won't send).
- Headless verification rig used this session lives in `/tmp/fidolio-cdp/` (Node + CDP over Chrome on
  `--remote-debugging-port=9222`).

---

## 8. How to avoid the mistakes that bit us

1. **Never paste `railway_url`/`RAILWAY_URL`/`YOURDOMAIN` literally** — they're placeholders. Real backend =
   `fidolio-production.up.railway.app`, real frontend = `fidolio.vercel.app`.
2. **Know which DB you're on.** `.env` = local. Prod = the Railway URLs in §2. Migrations auto-apply on
   deploy; for a manual prod query use the `acela.proxy.rlwy.net:18475` URL (egress fees — keep it minimal).
3. **Don't weaken the write protection.** Read endpoints = `get_current_user`; anything touching Spotify or
   writing the DB = `require_user`. A guest must never mutate the owner's account.
4. **`Spine` + `NowPlaying` are outside `ErrorBoundary`** — a crash there black-screens the whole app; be
   defensive with null data and check imports; `npm run build` before any push.
5. **Add schema via a new `migrations/NNN_*.sql`** (idempotent), never by editing an applied one.

---

## 9. Git state
- Everything is on **`main`**, pushed. Last commit `b3271e6` (leak fix + startup migration runner). Earlier
  multi-user commits: auth foundation → endpoint scoping → data model/sync → frontend gate → demo mode →
  caching/login-landing. The Y2K "Chrome Press" reskin + Play Next + Album Lens + Identity moodboard shipped
  in `e5174fb` (historical context in the old git log / prior HANDOFF).
