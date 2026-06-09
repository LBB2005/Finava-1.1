# Research Lenses — Design

**Date:** 2026-06-02
**Branch:** `feat/research-lenses`
**Status:** Approved by Liam to build all four autonomously ("just build all, don't get back to me until done"). Flat tab row; lens grouping deferred.

## Goal

The Research page today has two lenses: **Board** (forward factor picks + leaderboard + backward movers) and **Tune** (weight the six factors → matched S&P 500 names). Add four more **AI-driven** lenses that share the same factor engine and terminal aesthetic. Every new lens must have a genuine AI component, not just mechanical filtering.

Final command-bar tab row: `BOARD · TUNE · COMPARE · SCREEN · THEMES · SIGNALS`.

## Shared foundation (reused, not rebuilt)

- **Factor universe**: `useFactorUniverse()` → `/api/research/factors` → `computeFactorUniverse()` returns `Stock[]` (503 S&P names, real six-factor scores). Live price/cap/PE/rvol overlaid by `overlayLive()` + `useLiveBoard()`. The page already loads this once; all new lenses consume the same in-memory universe — no extra heavy compute.
- **Scoring math**: `composite`, `ranked`, `rankByWeights`, `grade`, `gradeClass`, `factorColor` in `src/lib/research.ts`.
- **AI**: `generate({ agent, prompt, maxTokens })` in `src/lib/llm.ts` (OpenRouter gateway, per-agent model routing). New `AgentKey`s registered for each lens.
- **SSE / store pattern**: `finavaStore.ts` + `finava-analysis/route.ts` are the reference for streamed multi-agent output where used.
- **UI primitives**: `Radar`, `MiniBars`, `GradeBadge` (`primitives.tsx`), `LadderRow`, terminal CSS classes (`.tbtn`, `.lad-table`, `.fbar-track`, `.grade`, etc., all scoped under `.research-root`).
- **Auth**: server routes use `requireAuth()`; client uses `authFetch()`. Factor route stays unauthenticated (dev-bypass friendly); AI routes require auth like `finava-analysis`.

## New AgentKeys (`llm.ts`)

| key | tier / model | job |
|-----|--------------|-----|
| `compareVerdict` | Sonnet | head-to-head winner + per-stock bull/bear |
| `screenParse` | Haiku | NL query → structured `ScreenFilter` JSON |
| `screenRead` | Gemini Flash | commentary on a resulting basket |
| `screenSuggest` | Gemini Flash | propose regime-aware ready screens |
| `themesGenerate` | Sonnet | generate named themes + constituent tickers + thesis |
| `signalsNarrate` | Gemini Flash-Lite | narrate pre-computed cross-sectional events |

## Lens 1 — Compare (head-to-head)

**Component:** `CompareMode.tsx`. User searches/adds 2–5 tickers from the universe. Renders:
- Overlaid factor radar (`RadarOverlay` — new primitive, multiple polygons) + a factor table (rows = 6 factors, columns = stocks, best cell highlighted per row).
- Live row: price, today %, P/E, market cap, Finava score for a chosen horizon.
- **AI verdict panel**: POST `/api/research/compare` with the selected stocks' factor + market data → `compareVerdict` agent → `{ winner, summary, perStock: [{ ticker, oneLiner, bullCase, bearCase }] }`. Single non-streaming JSON response with a loading state (fast, ≤5 stocks).

**Server:** client sends the stocks (already has scored data) so no recompute. Failure → 503/error panel with retry.

## Lens 2 — Screen (AI screener)

**Component:** `ScreenMode.tsx`. One route file `/api/research/screen` (POST, `mode` discriminator) does three jobs:
- `mode:"parse"` `{ query }` → `screenParse` (Haiku) → `{ filter: ScreenFilter, interpretation }`. `ScreenFilter` = `{ factors?: Partial<Record<FactorKey,{min?,max?}>>, sectors?, maxPe?, minMarketCap?, minChg?, maxChg?, sort?: {key,dir}, limit? }`.
- `mode:"commentary"` `{ query, stocks }` → `screenRead` (Flash) → `{ commentary, standout, watchout }` on the resulting basket.
- `mode:"suggest"` `{ summary }` → `screenSuggest` (Flash) → `{ screens: [{ label, rationale, query }] }`. `summary` is a compact client-computed universe digest (sector momentum leaders/laggards, breadth, cheapest sector) so suggestions reflect the current tape.

Pure filter math `applyScreen(universe, filter): RankedStock[]` lives in `src/lib/screen.ts` and runs client-side. Results render via `LadderRow`. NL input + suggested-screen chips above; AI commentary panel beside results.

## Lens 3 — Themes (AI baskets)

**Component:** `ThemesMode.tsx`, `useThemes()` SWR hook → `GET /api/research/themes` (server-cached, long TTL). `themesGenerate` (Sonnet) is given the S&P 500 list and returns `{ themes: [{ key, name, thesis, tickers[] }] }` (6–8 themes, 5–8 validated tickers each). Tickers filtered to ones present in the factor universe. Grid of theme cards (name + thesis + sparkline of avg score); selecting one expands its constituents as factor rows. Server validates tickers against `SP500` and drops unknowns.

## Lens 4 — Signals (AI feed)

**Component:** `SignalsMode.tsx`. Client computes candidate **events** from the live-overlaid universe with `deriveSignals(universe)` in `src/lib/signals.ts` — categories: top % movers, relative-volume spikes, momentum breakouts (high MOM + above-trend), analyst-skew standouts, deep-value oversold, grade extremes. Top ~12 events POST to `/api/research/signals` → `signalsNarrate` (Flash-Lite) → `{ feed: [{ ticker, category, headline, take, sentiment }] }`, rendered as a time-ordered feed with category tags and bull/bear coloring. Events are real (computed from data); AI only writes the human-readable narration.

## Page wiring (`research/page.tsx`)

- `Mode` union extended to the six lenses; flat tab buttons in the command bar.
- Horizon control shown only for Board (as today).
- Each lens lazy-renders its component; all read the shared `universe`/`liveMap` already in page state (passed as props where convenient, or each calls `useFactorUniverse()` which is SWR-deduped).

## Error handling & isolation

Every AI route is failure-isolated like `finava-analysis`: missing `OPENROUTER_API_KEY` → 503 with a clear message; agent error → error payload the client turns into a retry; unparseable JSON → graceful fallback (neutral/empty state), never a crash. Lenses degrade independently — a down AI call never breaks the factor board.

## Out of scope (YAGNI)

- Historical factor snapshots (Signals derives "what's notable now" cross-sectionally, not true time-deltas).
- Persisting user screens/comparisons to Firestore.
- Lens grouping/segmented nav (revisit once all six exist).
