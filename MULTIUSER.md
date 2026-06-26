# Fidolio — Multi-User Implementation Plan

> Branch `multi-user`. Build slow, in chunks, non-breaking between phases. Do NOT push to `main`
> until the whole thing is verified (push = deploy). Decisions locked: **HttpOnly cookie session**,
> **progressive first-login sync**, **plan then build**.

## Why / current state
Single-user today: one Spotify token in a `.cache` file (or `SPOTIFY_TOKEN_CACHE` env), and **43**
endpoints hardcode `user_id = Query("0tz6fep2m5bx1vq85g48518u9")`. The DB is already user-scoped
(every table has `user_id`, every query filters it), so the model is multi-user-ready. The existing
`api/routes/auth.py` is **dead** (imports non-existent helpers, not registered in `main.py`) — we build
auth fresh. CORS already allows `*.vercel.app` + `allow_credentials=True`.

Goal: any allow-listed friend logs in with Spotify, sees **their own** data, app stays clean.

## Architecture
- **Identity = Spotify user id.** New `users` table stores per-user refresh tokens + profile + sync state.
- **Session = signed HttpOnly cookie** (`fidolio_session` = HMAC-signed spotify_user_id, stdlib only —
  no new dep). `SameSite=None; Secure` for cross-site (Vercel ↔ Railway).
- **Per-user Spotify client** via a spotipy `DBCacheHandler` that reads/writes `users.token_info`
  (spotipy auto-refreshes and persists). The OAuth callback uses a `MemoryCacheHandler` + manual upsert
  (we don't know the spotify id until after `current_user()`).
- **Progressive sync:** on first login, return immediately; a background job pulls saved tracks, then
  enriches features + language. Frontend shows a "warming up" state from `sync_status`.

## Phases (each non-breaking on its own)
1. **Auth foundation (additive).** `users` table; `core/users.py` (CRUD + `DBCacheHandler`);
   `get_spotify_client(user_id=None)` (legacy file-cache when None); `core/session.py` (HMAC cookie
   sign/verify); rewrite `api/routes/auth.py` (`/login`, `/callback`, `/me`, `/logout`); register it in
   `main.py`. Existing endpoints untouched → app still works.
2. **Scope endpoints.** Add `get_current_user` dependency: cookie → that user; **no cookie → fall back to
   `DEFAULT_USER_ID` env** (= Sid) so nothing breaks pre-frontend. Replace the 43 `Query(default)` with
   `Depends(get_current_user)`. (Remove the fallback once the frontend always authenticates.)
3. **Per-user sync.** Parameterize `sync_library` + enrichment by user; `run_poller` loops over all
   `users`; first-login background sync; `/auth/me` exposes `sync_status`.
4. **Frontend gate.** Login screen ("Log in with Spotify"), `credentials:'include'` on all fetches,
   logout, progressive "building your library" state. Remove the default fallback when ready.
5. **Deploy + Spotify allowlist (Sid's manual steps).** Env: `SESSION_SECRET`, `FRONTEND_URL`,
   `SPOTIFY_REDIRECT_URI` (Railway callback). Add ≤25 friends' emails in the Spotify dashboard.

## Gotchas
- Library ingestion (saved-sync + ReccoBeats enrichment) is the slow part, not auth — hence progressive.
- Cross-site cookie needs `SameSite=None; Secure`; never log tokens.
- `collab` share/join deep links may need to stay reachable without the room owner's session — check in P2.
- Token in DB as TEXT(json) to avoid JSONB adapter subtleties.

## Status
- [x] Phase 0 — branch + this doc
- [x] Phase 1 — auth foundation (users table + DBCacheHandler + session cookie + /auth routes). Verified.
- [x] Phase 2 — endpoint scoping. `api/deps.get_current_user` (cookie→user, else DEFAULT_USER_ID).
      Converted ~46 sites across stats/library/search/discovery/albums/playlists (Query→Depends +
      Pydantic-body override `body.user_id = current_user`). collab uses explicit params (untouched).
      nowplaying `/current` deferred to Phase 3 (needs per-user Spotify client). Verified non-breaking.
- [x] Phase 3 — per-user sync + multi-user data model. Verified.
      • Migration 002: tracks PK → (user_id, id) so users can share songs.
      • Migration 003: listening_history UNIQUE → (user_id, played_at).
      • sync_library.sync_saved_tracks(user_id, progress=…) + feature-copy (inherit a popular
        song's features from another user instead of re-hitting ReccoBeats).
      • core/user_sync.start_first_sync (background, progressive sync_status).
      • run_poller loops all users; nowplaying /current per-user; get_spotify_client matches a
        legacy token's scope (no re-auth) and uses DB token for OAuth users.
      • Fixed listening-history LEAKS: /stats/all-time, /stats/wrapped, /stats/refresh-listening
        were unscoped → a new user saw Sid's plays. Now per-user. Audited all tracks/listening
        queries; verified an empty new user sees only their own (empty) data.
- [ ] Phase 4 — frontend gate
- [ ] Phase 5 — deploy + allowlist
