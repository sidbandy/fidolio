# Fidolio — Frontend Handoff

You are picking up the **frontend** of Fidolio, a personal Spotify analytics web app.
The backend, database, and deployment are **done and stable — do not touch them** unless
a frontend feature needs a new endpoint (ask first). Your job: make the UI clean,
consistent, polished, and mobile-friendly.

---

## 1. What the product is

Fidolio treats a user's Spotify library (11,770 saved songs) as a dataset and builds
analytics, search, discovery, and playlist tools on top. Dark, data-dense, premium
"analytics dashboard" feel — **not** a music player clone. Spotify green on near-black.

---

## 2. How to run it

```bash
# Backend (terminal 1) — from project root
source .venv/bin/activate
.venv/bin/python -m uvicorn api.main:app --app-dir backend --port 8000
#   (running with --app-dir keeps the cwd at root so the .cache token resolves)

# Frontend (terminal 2)
cd frontend
npm install   # first time
npm run dev   # serves on http://localhost:5173
```

The frontend reads the backend URL from `import.meta.env.VITE_API_URL`, falling back to
`http://localhost:8000`. For local dev you don't need to set anything. **Never hardcode
the API URL** — always use the env pattern already in every file:
```js
const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
```

Production: frontend on Vercel (`fidolio.vercel.app`), backend on Railway
(`fidolio-production.up.railway.app`). Pushing to `main` auto-deploys both. Verify
`npm run build` passes before committing.

---

## 3. Frontend stack

- **React 18** + **Vite** (build tool) — `frontend/src/`
- **React Router v6** — routing in `App.jsx`
- **Recharts** — all charts (radar, donut/pie, line, bar)
- **Inline styles** for everything (there is no CSS framework in use — Tailwind is in
  devDeps but NOT used; don't start using it without discussing)
- **`fetch`** for API calls (axios + react-query are installed but largely unused)
- A custom **`usePreview`** hook (`src/hooks/usePreview.js`) for 30-sec Deezer previews
- **PWA**: `public/manifest.webmanifest` + `public/sw.js` (installable; leave working)

---

## 4. File map

```
frontend/src/
├── main.jsx                 # entry; registers service worker
├── index.css                # the only global CSS (body, .card, .label, .loading, scrollbar)
├── App.jsx                  # Router + top nav bar (NAV_LINKS array) + <NowPlaying/>
├── hooks/usePreview.js      # Deezer preview playback: { playing, play, stop }
├── components/
│   ├── NowPlaying.jsx       # fixed bottom bar, polls /nowplaying/current every 30s
│   └── Nav.jsx              # (note: nav is actually inline in App.jsx; this file is stale)
└── pages/
    ├── SonicIdentity.jsx    # "/"          musical fingerprint
    ├── Wrapped.jsx          # "/wrapped"   period stats + listening clock
    ├── Library.jsx          # "/library"   duplicates / dead saves / top artists tabs
    ├── LikedSongs.jsx       # "/songs"     full library browser w/ sort+filter
    ├── Search.jsx           # "/search"    NLP + filter search, save-as-playlist
    ├── Discovery.jsx        # "/discovery" recommendation engine
    ├── Albums.jsx           # "/albums"    album explorer + blind spots
    ├── Timeline.jsx         # "/timeline"  taste-drift charts over time
    ├── TimeCapsule.jsx      # "/rewind" AND "/capsule"  Monthly Rewind (multi-month picker)
    ├── Playlists.jsx        # "/playlists" smart playlist builder + rotation
    ├── Collab.jsx           # "/collab" + "/collab/:roomId"  collaborative voting rooms
    ├── Dashboard.jsx        # STUB (8 lines, unused — ignore or delete)
    └── Login.jsx            # STUB (8 lines, unused — ignore or delete)
```

---

## 5. ⚠️ The core problem to fix: three inconsistent styling systems

Right now styling is done **three different ways** across pages. This is the #1 thing to unify.

1. **Global CSS classes** (`className="card"`, `className="label"`, `className="loading"`)
   from `index.css` — used by: Albums, Library, Search, TimeCapsule, Wrapped.
2. **Raw inline hex** everywhere (`style={{ background: "#0e0e0e", border: "1px solid #1a1a1a" }}`)
   — used by: SonicIdentity, Discovery, LikedSongs, and partially everyone.
3. **A local token object + helper functions** (`const C = {...}` plus `card()`, `btn()`,
   `pill()`, `inp()` helpers defined at the top of the file) — used by: Playlists, Collab,
   Timeline. **This is the best approach and the one to standardize on.**

**Your first task: extract the token system into a shared module and migrate every page to it.**

Create `src/theme.js` (or `src/ui/`) exporting the canonical tokens + helpers, then
replace both the `className="card"` usages and the raw-hex usages with shared components.

---

## 6. Canonical design system (standardize on this)

These tokens already exist (copied from Playlists.jsx / Collab.jsx). Promote them to a shared file.

```js
export const C = {
  bg:      "#080808",   // page background
  card:    "#0e0e0e",   // card background
  card2:   "#111111",   // input / secondary surface
  border:  "#1a1a1a",   // default border
  border2: "#222222",
  green:   "#1db954",   // primary accent (Spotify green)
  greenBg: "#0d2b18",   // selected/active tint
  greenBd: "#1a4a2a",   // highlighted card border
  amber:   "#f59e0b",   // neutral mood / warnings
  indigo:  "#6366f1",   // dark/sad mood
  red:     "#ef4444",   // error / exclude / downvote
  redBg:   "#1a0808",
  sub:     "#888888",   // secondary text
  muted:   "#555555",   // tertiary text
  label:   "#444444",   // uppercase micro-labels
};
```

**Typography**
- Headers: font-weight 800 — 28–36px (h1), 18–24px (section)
- Body: 13–14px, weight 500
- Micro-labels: 11px, weight 600, UPPERCASE, letter-spacing 0.5–1.5px, color `#444`
- Stat numbers: weight 800, 20–36px, usually green

**Component patterns (build these as shared React components):**
- `<Card>` — bg `#0e0e0e`, 1px `#1a1a1a` border, radius 12–14px, padding 18–22px
- `<Button variant="primary|ghost|danger">` — primary = green bg/black text; ghost =
  `#151515` bg + border; danger = dark-red bg + red text. radius 9–10px, weight 700
- `<Pill active>` — radius 16–20px chip; active = green bg/black text, idle = `#151515`/muted
- `<Input>` — bg `#111`, 1px `#1a1a1a`, radius 8–10px, padding 8–12px, `boxSizing: border-box`
- `<TrackRow>` — the most-repeated element: 30px circular play button (green when playing),
  title + artist (truncated with ellipsis), metadata badges (year/BPM/energy%/mood/language),
  Spotify ↗ link. **This is duplicated in ~7 files — extract it.**
- `<StatCard>`, `<PageHeader>`, `<EmptyState>` — also repeated, worth extracting

**Rules (from the original design spec):**
- No gradients. No box-shadows except modals/popovers. Transitions 0.15s.
- Mood colors: happy/bright = green, neutral = amber, dark/sad = indigo.
- Play buttons toggle ▶ / ■.

---

## 7. ⚠️ Second core task: mobile / responsive

The app is **not responsive**. On a phone (it's an installable PWA, so this matters):
- Pages use `padding: 40px` and fixed `maxWidth` — too much on mobile.
- Grids are hardcoded (`gridTemplateColumns: "repeat(4, 1fr)"`, `"repeat(3, 1fr)"`,
  `"repeat(6, 1fr)"`) — they don't collapse. Use `auto-fit/minmax` or media queries.
- The **top nav** (in `App.jsx`) is 11 items in a horizontal-scroll bar — workable but not
  great on mobile. Consider a hamburger/drawer or a bottom tab bar for small screens.
- Inputs and tap targets need to be ≥ 40px for touch.

Inline styles can't do media queries, so either: add responsive CSS classes to `index.css`,
use a small `useMediaQuery` hook to switch styles, or introduce CSS modules. Pick one and
be consistent.

---

## 8. Every page — what it does, what it calls, what to polish

All endpoints are under the `API` base. The backend is stable; these are the contracts.

### SonicIdentity (`/`) — `GET /stats/sonic-identity`
Radar chart of audio features, mood donut, energy donut, stat pills (avg BPM, key,
analyzed count), "rabbit holes" (fastest-binged artists). *Polish: chart sizing on mobile,
consistent card system.*

### Wrapped (`/wrapped`) — `GET /stats/wrapped?period=day|week|month|year` + `GET /stats/all-time`
Period toggle, top artists/songs lists with bars, 24-hr listening clock (Recharts bar).
*Note: needs listening history to be meaningful (currently ~230 plays). Uses `className="card"`
heavily — migrate.*

### Library (`/library`) — `GET /library/duplicates`, `/dead-saves`, `/top-saved-artists`
Three tabs. *Migrate from className="card".*

### LikedSongs (`/songs`) — `GET /library/liked-songs` (sort_by, order, filters, limit, offset)
Full library browser, sort + decade filter + advanced filters, infinite scroll, preview
buttons. The 11,770-track workhorse. *Heavy raw-hex; extract TrackRow.*

### Search (`/search`)
- NLP mode: `GET /search/nlp?q=...&limit=50`
- Filter mode: `GET /search/?q=&artist=&min_tempo=&...&language=&limit=50`
- Weather: `GET /search/weather-vibe?lat=&lon=`
- Save results → `POST /playlists/from-tracks` ({name, track_ids})
Two-mode toggle, quick-vibe chips (active state), language dropdown, "Save as Playlist"
modal. *One of the more polished pages; align to shared components.*

### Discovery (`/discovery`) — `GET /discovery/for-me` (vibe, seed_song, artists, language, ...)
Vibe preset buttons, library-matches vs new-discoveries sections. *Raw-hex; the original
brief flagged this page as needing the most visual work.*

### Albums (`/albums`) — `GET /albums/explore?album_name=&artist_name=` + `GET /albums/blind-spots`
Two tabs: album explorer (taste match %, entry points, scored track list) + blind spots.
*Uses className="card".*

### Timeline (`/timeline`) — `GET /stats/taste-timeline-insights`
Taste-drift line charts, named "eras," insight cards, narrative. Needs 2+ months of history
to populate (shows an empty state until then — that's correct). *Already uses C tokens.*

### Monthly Rewind (`/rewind` and `/capsule`, file `TimeCapsule.jsx`)
- `GET /library/monthly-rewind` (all months + counts + in-Spotify status)
- `GET /library/range-tracks?months=2025-12,2026-01` (combined tracks)
- `POST /library/multi-month-playlist?months=...` (create one playlist from selected months)
Year tabs + month grid with per-month counts; **multi-select across years**; preview +
"Create Spotify Playlist". *Uses className="card"; migrate.*

### Playlists (`/playlists`) — the most complex page
- `POST /playlists/preview` (conditions + excludes → matching tracks + stats)
- `GET /playlists/` , `POST /playlists/` , `PUT /playlists/{id}` , `DELETE /playlists/{id}`
- `POST /playlists/{id}/sync` , `POST /playlists/{id}/rotate`
- `GET /playlists/languages` , `POST /playlists/setup` , `POST /playlists/enrich-language`
Rule builder (condition rows: field+op+value), exclude rules, presets, preview w/ stats,
save modal, saved-playlist cards with sync/rotate/edit/delete + inline rotation settings.
**This is the reference implementation for the C-token + helper style. Match the rest of
the app to this page's quality.**

### Collab (`/collab`, `/collab/:roomId`)
- `GET /collab/presets` , `POST /collab/create` , `GET /collab/{room_id}?voter_name=`
- `POST /collab/submit` , `POST /collab/vote` , `DELETE /collab/submissions/{id}`
- `GET /collab/search/tracks?q=` , `POST /collab/{room_id}/finalize`
Create room (with vibe guardrail), QR share popover, song search w/ album art, voting,
finalize to Spotify. Polls every 5s. *Already uses C tokens — good reference.*

### NowPlaying (component, every page) — `GET /nowplaying/current`, `GET /nowplaying/lyrics-meaning`
Fixed bottom bar, polls every 30s, smooth progress, Genius "what's this about?" panel,
IN LIBRARY badge. *Make sure it doesn't overlap content on mobile; pages already pad
bottom 80–100px for it.*

---

## 9. Suggested plan of attack (in order)

1. **Extract the design system** — `src/theme.js` (tokens) + `src/ui/` shared components
   (`Card`, `Button`, `Pill`, `Input`, `TrackRow`, `StatCard`, `PageHeader`, `EmptyState`,
   `Modal`). Build them to match the Playlists/Collab look.
2. **Migrate pages to shared components**, removing `className="card/label/loading"` and
   one-off raw-hex. Do it page by page; run `npm run build` after each.
3. **Make it responsive** — pick a media-query strategy, fix the grids, rework the nav for
   small screens, ensure touch targets.
4. **Polish pass** — consistent spacing scale, hover/active transitions, loading skeletons
   or consistent "Loading…" text, thoughtful empty states (several pages need data and
   should explain that gracefully), and consistent chart theming in Recharts.
5. Optional: delete the dead `Dashboard.jsx`, `Login.jsx`, and stale `components/Nav.jsx`.

**Do not** change backend behavior, API shapes, the `usePreview` hook contract, or the PWA
files. If a polish idea needs a new endpoint or response field, note it and ask.

---

## 10. Design rules recap (keep the brand)
- Background `#080808`, Spotify green `#1db954` accent, near-black cards, subtle borders.
- Data-dense, minimal, premium analytics-dashboard feel. No gradients, no heavy shadows.
- 0.15s transitions. Mood = green/amber/indigo. Everything should feel intentional and clean.
```
```
