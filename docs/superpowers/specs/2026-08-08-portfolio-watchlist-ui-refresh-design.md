# Portfolio & Watchlist UI Refresh — Design

**Date:** 2026-08-08
**Status:** Approved via visual brainstorm (companion session, choices recorded below)
**Pages:** `/portfolio`, `/watchlist`

## Problem

The Portfolio and Watchlist pages read as a different product from the rest of the app.
The portfolio hero uses a diagonal gradient panel and card chrome found nowhere else;
the watchlist is a bare table with none of the app's intelligence (score, trend).
Goal: bring both pages onto the shared design language (stock page card chrome,
tokens, UI-consistency standards) by polishing the existing structure — not a
ground-up redesign.

## Decisions (from the visual walkthrough)

| Element | Choice |
|---|---|
| Portfolio direction | Polish existing shape, anchor to design system |
| Hero | Chart-as-canvas, **fully open** (no card, no border, no boxed background) |
| KPI strip | Bare stat row (label + serif number, no borders) |
| Allocation | Donut card kept, restyled to system chrome |
| Holdings table | Current columns kept, restyled |
| Watchlist layout | Sibling of Portfolio: tabs + insight line + same table style |

## Portfolio page

Top-to-bottom structure (replaces the current hero card + KPI strip + alloc grid):

### 1. Open hero (chart as canvas)

- Full-width section sitting directly on the page background — **no border, no
  card box, no gradient panel, no divider lines**. The only graphics are the
  benchmark chart line and its soft area-gradient fade.
- Top-left overlay: `TOTAL ACCOUNT VALUE` eyebrow, total value in the serif hero
  size, day change line (`▲ +$1,204 · +0.95% today`) in bull/bear color.
- Top-right overlay: existing range pill toggle (1D · 1W · 1M · YTD · 1Y · 5Y · ALL).
- Bottom-left overlay: legend `You +x%` (accent solid) vs `S&P 500 +y%` (muted
  dashed), plus the existing outperformance badge.
- Chart: keep the current seeded synthetic `BenchmarkChart` SVG (real series is a
  separate project), rendered full-bleed across the content column with the
  portfolio line + dashed S&P line. Area fill fades to transparent so there is no
  hard bottom edge.
- The old left gradient panel, its `borderTop` divider, and the All-time /
  Invested block inside the hero are removed.

### 2. Bare stat row

Six stats as label-over-number pairs, no borders or cards, single row (wraps on
narrow viewports via the existing `portfolio-kpis` responsive grid):

1. All-time (`+$23.4k · +22.3%`, bull/bear color)
2. Invested (total cost basis)
3. Cash / buying power (keeps the existing inline edit affordance when Plaid is
   not connected)
4. Equity (with holdings count sub-line)
5. vs S&P 500 YTD (outperformance, bull/bear color)
6. Day change (bull/bear color)

### 3. Allocation donut card + holdings table (side by side, unchanged grid)

- Donut card: same SVG donut + legend, chrome aligned to stock-page cards
  (`--color-surface`, `--radius-lg`, standard card header treatment). Hover
  linking between segments, legend, and table rows stays.
- Holdings table: same columns — Ticker (chip + company name) · Finava score
  pill · Price · Day · Mkt Value · Return · Trend sparkline. Restyle only:
  header row, paddings, hover state, and borders per the stock-page table
  standard. Row click → `/stock/[ticker]` unchanged.

### 4. Loading / empty states

Same behavior as today; the skeleton mirrors the new layout (open chart region,
stat row, donut + table) instead of the old hero card.

## Watchlist page

Structure (inside the existing `WatchlistSplitRail` full-page view):

### 1. List tabs

Watchlists render as pill tabs across the top (`Main · AI plays · … · +`),
replacing the current switcher placement. Right-aligned summary text:
`12 tickers · 8 green today`.

### 2. Insight line

One slim row of computed-from-live-quotes stats: Avg day move · Top mover
(ticker + %) · Worst mover (ticker + %). Plain text, eyebrow labels, no cards.

### 3. Sibling table

Same refined table treatment as the portfolio holdings table. Columns:

- Ticker (chip) + company name
- **Finava score** (new — same `ScorePill` tiering as portfolio)
- Last price
- Day %
- Mkt Cap
- **Trend sparkline** (new — same seeded intraday series helper already used in
  the split rail)

Hover-reveal remove (×) button and row click → stock page stay. The 50-row
windowing ("Show N more…") stays.

## Shared rules

- Colors, radii, type sizes: tokens only (`--color-*`, `--radius-*`, `--text-*`),
  per the 2026-07-17 UI-consistency pass (no hex literals, `.std-focus`,
  standard z-scale).
- Motion: subtle transitions only (existing 100–140ms color/opacity fades); no
  new animation libraries.
- No new dependencies. No API/data changes — quotes, Plaid sync, page-context
  publishing, and chat wiring are untouched.
- Score pill on watchlist uses the same deterministic placeholder
  `finavaScore()` seed as portfolio until Finava Score v2 lands (shared helper —
  move it out of `portfolio/page.tsx` into a small shared module).

## Files affected

- `src/app/portfolio/page.tsx` — hero rework, stat row, donut/table restyle,
  skeleton update
- `src/components/watchlist/WatchlistSplitRail.tsx` — tabs, insight line
- `src/components/watchlist/WatchlistBoard.tsx` — score + trend columns, table
  restyle
- `src/app/globals.css` — any new layout classes (e.g. open-hero responsive
  rules), keeping tokens-only colors
- New: `src/lib/finavaScorePlaceholder.ts` (or similar) — shared seeded score
  helper

## Error handling

Unchanged: portfolio/quotes fetch errors keep their toast surfacing; missing
quotes render "—" / shimmer as today; watchlist live-board loading renders "…".

## Testing

- Logic layer untouched, so no new unit tests required; existing vitest suite
  must stay green.
- Visual verification in the dev server across: holdings present, empty state,
  Plaid-connected state, loading skeletons, light/dark themes, and the `md`
  responsive breakpoint (per dev-auth preview notes).
