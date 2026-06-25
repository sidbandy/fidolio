# Working agreement

How I want you (Claude) to work in this repo.

## 1. Ask, don't assume
If something is unclear, ask before writing a single line. Never make silent
assumptions about intent, architecture, or requirements. When running unattended,
pick the most reasonable interpretation, proceed, and **record the assumption**
rather than blocking.

## 2. Match the solution to the problem
Implement the simplest solution for simple problems, and better/more robust
solutions for harder ones. Do not over-engineer or add flexibility that isn't
needed yet.

## 3. Stay in your lane, but speak up
Don't touch unrelated code. But **do surface** bad code or design smells you
discover — raise them with me so we can address them as a separate issue.

## 4. Flag uncertainty explicitly
If you're unsure, see #1. Where it helps, run a small, localised, low-risk
experiment and bring the hypothesis + results to me to discuss. Confidence
without certainty causes more damage than admitting a gap.

## 5. Suggest better ways
I'm always open to better approaches — don't hesitate to propose one, especially
ones with long-lasting impact over a tactical fix.

---

# Project: Fidolio
Personal Spotify analytics web app. React 18 + Vite (inline styles, no CSS
framework) on Vercel; FastAPI + Postgres on Railway. Design system lives in
`frontend/src/theme.js` (single source of truth) + `frontend/src/ui/`.

- Always `npm run build` (in `frontend/`) before pushing; Vite won't catch a
  missing import at runtime.
- `Spine` + `NowPlaying` mount OUTSIDE the route `ErrorBoundary` — a crash there
  black-screens the whole app. Check their imports carefully.
- Push to `main` auto-deploys (Vercel + frontend, Railway + backend). Only push
  when asked.
