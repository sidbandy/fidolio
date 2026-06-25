# Fidolio — Engineering Handoff

> **Snapshot:** 2026-06-25 · branch `main` · everything below is **uncommitted working tree**.
> This doc is written so a fresh Claude session can resume with zero context loss. Read §0 and
> §1 before touching anything. **§1 (Play Next) is the #1 priority — start there.**

---

## 0. READ FIRST — git reality, ops, and the hard rules

- **Nothing is committed.** HEAD is still the **old "Editorial Wrapped"** dark theme. The entire
  **"Y2K Chrome Press" reskin + this whole session's work lives only in the working tree.**
  Do **NOT** `git stash` / `git reset` / `git checkout .` — you will nuke days of work.
- **Push = deploy.** Pushing `main` auto-deploys Vercel (frontend) + Railway (backend). **Only push
  when Sid explicitly asks.** Always `cd frontend && npm run build` first (Vite won't catch a
  missing import at dev runtime; a bad import in `Spine`/`NowPlaying` **black-screens the whole app**
  because they mount **outside** the route `ErrorBoundary`).
- **Single-user app.** One Spotify token in backend env, one `user_id` (default
  `"0tz6fep2m5bx1vq85g48518u9"`) across the DB. ~11,793 saved tracks. Multi-user auth is
  deliberately deferred ("design now, auth later").
- **Local dev:** backend = `cd backend && ENABLE_POLLER=0 venv/bin/python -m uvicorn api.main:app --port 8000`.
  Frontend = `cd frontend && npm run dev` → **:5173**. **CORS only allows `:5173`** — so verify data
  views on the **dev server (:5173)**, NOT `npm run preview` (:4173, CORS-blocked → empty data).
  Restart the backend to pick up backend code changes.
- **Untracked files added this session:** `frontend/src/ui/CoverButton.jsx`,
  `frontend/src/components/CoverThumb.jsx`, and fonts/images in `frontend/public/`
  (`discoball.png`, `Blok.ttf`, `PunkKid.ttf`, `Mexcellent.otf`, `Meloriac.ttf`).
- Build currently passes clean.

---

## 1. 🚨 CODE RED — "Play Next" recommendations are broken (TOP PRIORITY, do first)

### What Sid sees
Click **Play Next** on the Now Playing dock and the suggestions are: (1) **identical across
different songs**, (2) **nothing like the song that's playing**, (3) **no shared thread** between the
recs, and they don't feel like real, relevant picks.

### Where it lives
- **Backend:** `backend/api/routes/discovery.py` → `play_next()` (GET `/discovery/play-next`),
  approx **lines 871–974**. Signature today: `play_next(track: str, user_id, size=8)`.
- **Frontend caller:** `frontend/src/components/NowPlaying.jsx` — the `mixesView` effect:
  `fetch(\`${API}/discovery/play-next?track=${encodeURIComponent(track.name)}&size=8\`)`. It passes
  **only the track name**.

### Root cause (CONFIRMED via live diagnostic)
The endpoint resolves the "current track" by **name only**:
```sql
SELECT id, artist, <feats>, track_key, mode, language, instrumentalness
FROM tracks WHERE user_id=%s AND LOWER(name) LIKE %s   -- f"%{track.lower()}%"
ORDER BY saved_at DESC LIMIT 1
```
If that match **fails** (track not saved, name mismatch) **or the matched track has NULL audio
features** (~2,042 library tracks were never enriched by ReccoBeats), then `c` is None / features are
null → `cur_feat = similarity.DEFAULTS`, `cur_key/mode/lang = None`, `cur_moods = {}`. The
"last 10 minutes of listening" context (`listening_history`) is **empty locally** (poller off; gaps
in prod), so `recent_avg = None`. Result:
```python
target = wavg([(DEFAULTS, 6.0), (None, 4.0)])  # == DEFAULTS, a CONSTANT
```
→ every unresolved song produces the **same generic target** → the **same generic, unrelated recs**.

**Proof (I ran this):**
- `play-next?track=Heer` → `seed {lang: hindi, moods:[brooding], tempo: 78.3}` → coherent **Hindi**
  recs (Arijit Singh, Kailash Kher, Pritam). ✅ Works when the track resolves.
- `play-next?track=Man in the Box` → `seed {lang: None, moods: [], tempo: 120.0}` (← **all DEFAULTS**)
  → random unrelated recs (SiR, Anderson .Paak, Car Seat Headrest). ❌ Track didn't resolve → garbage.

So the engine itself (similarity scoring, harmonic Camelot matching, mood bonus) is **fine** — it
just gets fed a **constant default target** whenever the playing song can't be resolved with real
features.

### The fix (do it properly, end to end)
The frontend has more signal than it's sending. Plumb it through and never silently collapse to
defaults:

1. **Frontend (`NowPlaying.jsx`):** send the now-playing track's **artist**, **spotify id**, and the
   **audio features it already has** to `/play-next`. `/current` returns `track.features`
   (`energy, valence, tempo, danceability, acousticness`) for saved tracks + `track.artist` +
   `track.track_id`. Pass them as query params (and re-fetch when the track changes — it currently
   keys on `track?.name`, which is fine, but make sure it actually re-runs per song).
2. **Backend (`play_next`):**
   - Accept optional `artist`, `spotify_id`, and feature params. **Resolve the current track by id
     first, then name + artist** (not name-LIKE alone — that mis-matches common titles).
   - If the client passed features, **use them as `cur_feat`** (override the DB row). This makes the
     target reflect the real song even for unsaved / un-enriched tracks.
   - If features are *still* missing (unsaved AND client didn't pass them), **fetch them from
     ReccoBeats by name+artist** (the file already has `call_reccobeats` / `format_rb_tracks`
     infra + a ReccoBeats client) instead of using DEFAULTS.
   - **Never produce a constant target.** If there is genuinely no signal, fall back to the user's
     recent listening or top-played tracks — not `DEFAULTS`.
   - Make sure the **unowned (out-of-library) ReccoBeats picks are seeded by the actual current
     track** (`cur_id`/spotify id), so the "new · fits the flow" suggestions are relevant.
3. **Verify:** call `/discovery/play-next` for several *different* songs (a Hindi track, a grunge
   track, a hip-hop track) and confirm the `seed` reflects each song (distinct tempo/lang/moods) and
   the recs share an audible thread **and change per song**. Then test live on `:5173`.

Helpers already in `discovery.py` you'll reuse: `FEAT_COLS`, `_feat_row`, `similarity` (z-score
norm + weighted-Euclidean `score`, `to_vector`, `library_feature_stats`, `merge_features`,
`DEFAULTS`, `FEATURES`), `_camelot`, `_relation` (harmonic key), `compute_moods`, `call_reccobeats`,
`format_rb_tracks`. The scoring blend (similarity + `0.18` in-key harmonic + `0.13` mood bonus) is
good — keep it; just feed it a real target.

---

## 2. The project (what Fidolio is + the vision)

Personal Spotify-analytics web app for Sid (UT Austin CS) and friends. Treats his ~11.8k-song saved
library as a dataset and fixes what Spotify won't: real stats, library hygiene, plain-English search
of your own songs, smart/auto playlists, taste-aware discovery, rich Now Playing. **Quality bar: no
filler — every element must mean something on the data** (gold standard cited: Genius's "what does
this song mean").

**Art direction — "Y2K Chrome Press":** Y2K teen-magazine energy rendered **dark + metallic**. Deep
volcanic-graphite base, **bold jewel-color BLOCKS per department**, chrome/gloss headlines, glossy
gel ("aqua") UI bits, retro display type, **green disco-ball wordmark**, glitch/disco accents. Chic
NYC magazine × Y2K. Tasteful and intentional, never "thrown together."

**Stack:** React 18 + Vite (inline styles, **no CSS framework**) on Vercel; FastAPI + Postgres on
Railway. Design system = `frontend/src/theme.js` (single source of truth) + `frontend/src/ui/`.

**5 magazine sections** behind a custom left-rail nav ("**The Spine**"):

| Route | File | Section (color) | Contents |
|---|---|---|---|
| `/` | `pages/Identity.jsx` | Identity (electric blue) | Fingerprint (radar + mood/energy/lang donuts + eras) · Charts (Top Artists/Albums) · live Wrapped |
| `/collection` | `pages/Collection.jsx` | Collection (jewel pink) | Library browser + Health (dupes / dead saves via SwipeDeck) |
| `/discover` | `pages/Discover.jsx` | Discover (emerald) | NLP + structured search · editorial vibes · albums · blind spots |
| `/timeline` | `pages/Chronicle.jsx` | Rewind (blood red) | **Timeline** + **Monthly Rewind** (two toggle views) |
| `/playlists` | `pages/Studio.jsx` → `Playlists.jsx` / `Collab.jsx` | Playlists (violet) | Smart Playlists / Collab Rooms toggle |
| `/collab/:roomId` | `pages/Collab.jsx` | — | Standalone share/join deep links |

---

## 3. What we did this session (changelog)

### Sidebar ("The Spine", `components/Spine.jsx`)
- **Edge-to-edge sliding band:** one full-bleed indicator band slides to the active tab (no boxes).
  On switch it fires a **sharp sword-gleam sweep** + a **glitch/scanline pop** (`index.css`:
  `.nav-sword`, `.tab-pop`, `swordDown/Up`, `tabPop`).
- **Disco-ball logo rebuilt in code** (`DiscoBall` component): green Spotify-shade faceted sphere
  with drifting mirror tiles + twinkling glints + glow (no more broken `/discoball.png` photo). The
  **FIDOLIO** wordmark (Monoton, green `discoText`) fills the sidebar, no clipping.
- **Chrome aqua orb** tab markers (glossy gel beads in each section color; active = chrome-silver)
  replaced the old square. Tab names get a **glitchy glow** (`.tab-glow`).
- **"high fidelity" slogan** under the wordmark (replaced the `Nº 06 · JUN 2026` date).
- Removed the old edge **EQ rail**; thickened the right seam to a 4px gunmetal line.
- dek line: `fingerprint + wrapped` (was "live wrapped").

### Typography (lots of iteration — final state lives in `theme.js` `FONT`)
- **Page header titles (masthead) → `FONT.head` = Meloriac** (`/Meloriac.ttf`).
- **Sidebar tab names → `FONT.tab` = Mexcellent** (`/Mexcellent.otf`), bigger + bolder (22.5px/700).
- **Big single words (e.g. donut centers "Neutral"/"2020s") → `FONT.fat` = Syne**.
- **Descriptions / ledes → `FONT.lede` = Syne** (600 weight, kept readable).
- **`FONT.serif` = Fraunces** — intended for song/artist/album/mood/filter labels; **wired but not
  yet broadly applied** (see §5 itinerary).
- `@font-face` for Blok / Punk Kid / Mexcellent / Meloriac in `index.css`; Google/Fontshare links in
  `index.html`. **Cleanup opportunity:** several candidate fonts were trialed and left loaded but
  unused (Archivo Black, Bricolage, Big Shoulders, Anton, Unbounded, Blok, Punk Kid). The user
  rejected Blok (zine/wonky), Punk Kid (dripping/grunge), Archivo/Archivo Black ("boring"/"just
  bold") for headers/tabs — **don't reintroduce those.**

### Color (`theme.js`)
- **`SECTION` jewel colors (louder/magazine):** 1 Identity electric storm-blue `#1E6BFF` · 2
  Collection jewel pink `#FF2E9C` · 3 Discover emerald `#1AD46B` · 4 Rewind blood-red `#D6122E` ·
  5 Playlists violet `#8E3BFF`.
- **Neon/glow experiment was REVERTED** — the user disliked glowing card edges + heavy page glow.
  Cards are clean dark graphite again; `PAGE_BG` is just a subtle accent top-glow.
- **Masthead gleam (`.jewel-sheen`) redone** as a soft, blurred single sweep (no visible banding).
- Duotone color direction is **chosen but deferred** (see itinerary).

### Masthead (`ui/Masthead.jsx`)
- Big **folio number** kicker (`Nº 02`) replaced the small square + redundant section name.
- `isolation: isolate` fix so the gleam no longer renders over the overlapping stat card.
- Ledes are Sid's exact lines (and Rewind → "Press play on whoever you were back then.").

### Now Playing / Preview (`components/NowPlaying.jsx`, `ui/CoverButton.jsx`, `components/CoverThumb.jsx`, `context/PreviewProvider.jsx`)
- **Preview revamp:** album cover (from Deezer) replaces the gold circle; **curated stat block**
  (BPM · Key · Energy · Mood · Year — only what we actually have); FFT waveform.
- **`CoverButton`** (new, reusable): album cover that *is* the play/pause control.
  - default (track rows): hover darkens cover + reveals icon.
  - **`persistent`** (preview dock): cover stays bright, icon **always visible (dimmer)**, hover
    **brightens + glows** it.
- **Genius attribution** chip in "What's this about".
- Fixed the Now Playing cover **cutoff** (capped height + scrollable dock).
- **Fixed a black-screen crash:** `previewStats(null)` threw (NowPlaying is outside the
  ErrorBoundary). Guarded.

### Visualizer (`components/Waveform.jsx`)
- Rewrote. **Preview = real FFT** (log-freq bins, gain-lift, **attack/release dynamics** = fast snap
  up / slow fall, 512-bin via `PreviewProvider` `fftSize=512`, `smoothingTimeConstant=0.35`).
  **Now Playing = feature-shaped pseudo-spectrum** (bass→treble envelope from energy/danceability/
  acousticness; a beat that **travels across the bars at the track's BPM**) + a **glitchy Y2K render
  layer** (RGB-split glitch frames + scanlines). **Sid confirmed it "looks good."**
- **HARD LIMIT (don't re-promise):** the *Now Playing* song plays in the Spotify app — the browser
  cannot read that audio, and Spotify's audio-analysis API is retired. So the Now Playing viz is an
  honest feature-driven *signature*, not literal FFT. Only the in-browser **preview** is real FFT.

### Collection (`pages/Collection.jsx`, `ui/TrackRow.jsx`)
- **Song list now shows album covers as the play button** (`CoverThumb` lazy-loads Deezer covers via
  `/library/album-cover`, with a module cache + IntersectionObserver). Shape is **circular**.

### Identity / stats (`pages/Identity.jsx`, `ui/StatBlock.jsx`)
- **Top Artists podium → gold/silver/bronze** medals (not blue) with medal-colored names; bigger.
- **`sizeTiles` rewritten:** blends rank-percentile + true count so the mid-pack visibly steps down
  (was crushed flat by one outlier); bigger tiles (min 94 → max 192). (Still a left-to-right
  flex-wrap — see Charts masonry item in itinerary.)
- **Albums chart → 50** (backend cap raised, fetch `limit=50`; counts/calcs verified correct).
- **ⓘ tooltips on Groove / Signature Mood / Peak Year** (`StatBlock` gained an `info` prop →
  `InfoTip`). Copy is truthful to the real formulas; added `peak_year_count` to the backend so the
  Peak Year tip can say "N of your songs came out in YYYY".
- **Listening clock tooltip text → white** (recharts `itemStyle`/`labelStyle`; cursor → light).

### Rewind (`pages/Chronicle.jsx`)
- Split into **two toggle views** ("Timeline" — renamed from "The Story" — and "Monthly Rewind"),
  matching the other sections' pattern. "save a month as a playlist" → **"rediscover your eras"**.

### Backend
- `routes/nowplaying.py`: `deezer-preview` now returns `album_art` (Deezer cover).
- `routes/stats.py`: `sonic_identity` returns `peak_year_count`; `top-albums-rich` cap `le=40→60`,
  default `50`.

---

## 4. Architecture quick-map

**Backend (`backend/api/`)** — FastAPI + Postgres on Railway; routers in `api/main.py`; boots via
`Procfile`. CORS via `CORS_ORIGINS` env (default only `:5173`). Hourly in-app poller daemon
(`run_poller.main`) → `listening_history` + incremental saved-track sync (`ENABLE_POLLER=0` to
disable locally).
- Routes (`api/routes/`): `auth` (Spotify OAuth), `stats` (sonic identity/fingerprint, Wrapped,
  top-albums-rich, taste-timeline, eras), `library` (covers/typeahead/enrich/unsave/monthly-playlist,
  `/album-cover`), `search` (NLP + weather-vibe), **`discovery` (recs incl. `/play-next` — see §1)**,
  `nowplaying` (`/current`, `/deezer-preview`, Genius meaning), `albums` (explorer, **blind spots**),
  `collab`, `playlists` (smart-playlist rule engine).
- Data model: `tracks` (metadata + ReccoBeats features + `track_key`/`mode` for harmonic + `language`
  + `release_year`; **~2,042 rows have NULL features** — relevant to §1), `listening_history`,
  `smart_playlists`, `collab_*`, `monthly_playlists`.
- Integrations: ReccoBeats (audio features + recs; Spotify's own feature/analysis APIs are retired),
  Last.fm, Genius, LRCLIB, Deezer (covers/previews), OpenMeteo.

**Frontend (`frontend/src/`)** — `App.jsx` shell (5 routes + legacy redirects, `PreviewProvider`).
`theme.js` = SSOT (`C`, `SECTION`, `FONT`, `TYPE`, `SP`, `PAGE_BG`, `card`, `btn`, `pill`, `tint`,
chrome/gold/disco gradients). `ui/` primitives: `Masthead`, `PageHeader`, `StatBlock`, `Card`,
`TrackRow`, `CoverButton`, `Department`, `Expander`, `Modal`, `PullQuote`, `InfoTip`, `Button`,
`Pill`, `Input`, `EmptyState`, `Reveal`, `CountUp`. Feature components: `Waveform`, `SwipeDeck`,
`CoverThumb`, `Spine`, `NowPlaying`, `ErrorBoundary`. `MOBILE_Q = (max-width: 860px)`.

---

## 5. Remaining itinerary (priority order)

1. **🚨 Play Next fix — §1. Do this first, do it perfectly.**
2. **Spice up the Identity stats page.** Sid asked for ideas to make the stats page cooler — propose
   a few concrete, data-meaningful concepts and implement the chosen one(s). (Not started.)
3. **Charts → masonry / "puzzle" layout.** Sid's reference: a Pinterest-style board where tiles are
   **intentionally placed**, sizes **step down going down the page** but never get so small the
   artist/album art can't render. Big + intentional, not "filled left-to-right like an essay."
   Applies to Top Artists + Top Albums mosaics in `Identity.jsx` (`sizeTiles` + the flex-wrap
   container). **Sid said do this LAST of the active items.**
4. **Fix the WHOLE mobile design to match.** Known vestige: the light-paper (cream) **mobile
   header + drawer** in `Spine.jsx` `MobileSpine` (`rgba(241,236,224,…)`, ~lines 133–142) and the
   Collab QR `bgcolor=F1EDE4`. Beyond those, do a full pass so mobile matches the dark Y2K theme.
5. **Editorial serif (Fraunces) for short labels** — apply `FONT.serif` to song/artist/album/mood/
   filter labels (track rows, Play Next suggestions, blind spots, filter chips). Wired, not applied.
6. **More ⓘ tooltips** — extend beyond the 3 Identity stats to blind spots and anywhere a number/
   feature is non-obvious (must add *meaning*, never just restate the shown number).
7. **Deferred (Sid said NOT now, keep in mind):** duotone section-identity color; a motion pass
   (button presses + general transitions); Collection filters **moods/sort/eras side-by-side**; the
   Collection **energy 0–1 stat** (replace the raw 0–1 with something humans can actually search by).
8. **Perf:** `stats.sonic_identity` recomputes over all ~11.8k tracks every load (no cache) → the
   Identity landing page hangs ~9s+ on "Analyzing your sound…". Add caching.
9. **Later:** multi-user Spotify auth (per-user accounts + sync; Spotify dev-mode allowlist ~25
   friends by email is fine) — explicitly deferred.

---

## 6. Gotchas & verification

- **`Spine` + `NowPlaying` are outside the `ErrorBoundary`** → any throw there black-screens the app.
  (The preview crash was exactly this — be defensive with null data.)
- **Always `npm run build`** before declaring done / before any push.
- **CORS:** verify data-driven views on **`:5173` (vite dev)**; `:4173` (preview) is CORS-blocked and
  shows empty data (don't mistake that for a bug).
- **Headless screenshots:** Identity is slow (uncached `sonic_identity`) — it often shows
  "Analyzing your sound…" before data lands; give it time or screenshot other routes.
- **Don't re-promise true Now Playing FFT** (external Spotify audio is inaccessible — §3 visualizer).
- **Verify steps:** `cd frontend && npm run build` (clean) → run backend (:8000) + `npm run dev`
  (:5173) → eyeball each route → confirm the **Spine wordmark** and **NowPlaying** render (outside
  ErrorBoundary) → for §1, diff `/discovery/play-next` across several different songs.
