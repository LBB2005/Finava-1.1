# Portfolio & Watchlist UI Refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `/portfolio` and `/watchlist` onto one shared design language: an open chart-canvas hero + bare stat row on Portfolio, and a simplified, portfolio-matching table + restyled intelligence rail on Watchlist.

**Architecture:** Pure presentation refactor of two page trees — no data, API, hook, or store changes. A small shared `ScorePill` component + score-placeholder helper get extracted so both pages render scores identically. Approved spec: `docs/superpowers/specs/2026-08-08-portfolio-watchlist-ui-refresh-design.md` (amended below for what the watchlist actually already has).

**Tech Stack:** Next.js App Router (read `node_modules/next/dist/docs/` before writing code — this Next version has breaking changes), React, CSS tokens in `src/app/globals.css`, vitest.

## Context

The two pages read as different products: Portfolio is an "editorial" look with a gradient hero card nowhere else in the app; Watchlist is the research-terminal look (`b-board`/`b-table`/`term` classes shared with the Research page). Liam walked through options in a visual brainstorm and chose:

- **Portfolio hero:** chart-as-canvas, **fully open** — no card, no border, no boxed background, no divider lines. Value + day change top-left, range pills top-right, chart beneath.
- **Portfolio stats:** bare 6-stat row (All-time, Invested, Cash, Equity, vs S&P YTD, Day change) — label over serif number, no borders.
- **Allocation:** keep donut card side-by-side with table, restyled to standard card chrome.
- **Holdings table:** same columns, refined chrome only.
- **Watchlist:** keep existing tabs + PageHeader; second row becomes a slim insight line (Avg day · Top mover · Worst mover) + AddTickerSearch; table simplifies to Ticker+name · Score pill · Last · Day · Mkt Cap · Trend; right rail (Signals / Movers / Score leaders) **kept but restyled** to the same refined card chrome.

**Key discovery vs the spec:** `WatchlistSplitRail.tsx` (not `WatchlistBoard.tsx`) renders the watchlist page and already has tabs, KPI tiles, score bars, factor tiles, grade pills, signal chips, sparklines, and the rail. The work there is *simplification + restyle*, not addition. `WatchlistBoard.tsx` is only used for the sidebar compact list and is untouched except where noted.

**Constraints:**
- Tokens only (`--color-*`, `--radius-*`, `--text-*`), `.std-focus`, standard z-scale (UI-consistency pass 2026-07-17). No hex literals in component code.
- Do NOT modify `b-*` or `.research-root`/`.term` CSS classes — they're shared with the Research page. Add new classes instead and stop using the shared ones in WatchlistSplitRail's content area (PageHeader keeps its own classes).
- No new dependencies. Subtle motion only (existing 100–140ms fades).
- Working tree has unrelated dirty files (`globals.css`, `DcfTab.tsx`, `FinavaTab.tsx`, `IntelligenceRail.tsx`, `useDcfInputs.ts`). **Stage files explicitly by path in every commit — never `git add -A`.** (globals.css IS touched by this plan; stage it only with hunks relevant if possible, or accept staging the file and note it.)

**Files:**
- Create: `src/components/ui/ScorePill.tsx`, `src/lib/finavaScore.ts`
- Modify: `src/app/portfolio/page.tsx`, `src/components/watchlist/WatchlistSplitRail.tsx`, `src/app/globals.css`
- Untouched: hooks, stores, API routes, `WatchlistBoard.tsx` (compact mode), `PageHeader.tsx`

---

### Task 1: Extract shared ScorePill + score placeholder

**Files:**
- Create: `src/lib/finavaScore.ts`
- Create: `src/components/ui/ScorePill.tsx`
- Modify: `src/app/portfolio/page.tsx` (delete local copies, import shared)

- [ ] **Step 1.1: Create `src/lib/finavaScore.ts`** — move `seedRng` and `finavaScore` verbatim from `src/app/portfolio/page.tsx:56-71`:

```ts
// Deterministic placeholder Finava score until Finava Score v2 lands.
export function seedRng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function finavaScore(ticker: string): number {
  const rng = seedRng(ticker + "finava25");
  return Math.floor(rng() * 30 + 60);
}
```

- [ ] **Step 1.2: Create `src/components/ui/ScorePill.tsx`** — move the `ScorePill` component verbatim from `src/app/portfolio/page.tsx:74-92` (add `"use client"` not needed — it's stateless; keep it a plain component with the same tier colors: ≥70 bull, ≥60 warn, else bear; bg tiers at 80/70/60).

- [ ] **Step 1.3: Update `src/app/portfolio/page.tsx`** — delete the local `seedRng`, `finavaScore`, `ScorePill` definitions; import from the new modules. `seedRng` is still used by `BenchmarkChart` and `trendSeries` in this file.

- [ ] **Step 1.4: Verify** — `npx tsc --noEmit` (or `npm run build` if no tsc script) passes; `npx vitest run` green.

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/finavaScore.ts src/components/ui/ScorePill.tsx src/app/portfolio/page.tsx
git commit -m "refactor(ui): extract shared ScorePill + finavaScore placeholder"
```

---

### Task 2: Portfolio open hero (chart as canvas)

**Files:**
- Modify: `src/app/portfolio/page.tsx` (hero JSX, `src/app/portfolio/page.tsx:575-652`)
- Modify: `src/app/globals.css` (`.portfolio-hero*` rules, lines ~328-350)

- [ ] **Step 2.1: Replace the hero JSX.** Delete the bordered two-panel card (gradient panel + `portfolio-hero-chart`). New structure — an open section, no border/shadow/background:

```tsx
{/* ── HERO: open chart canvas — value floats over the benchmark chart ── */}
<div className="portfolio-hero-open">
  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Eyebrow>Total account value</Eyebrow>
      <div className="serif" style={{
        fontSize: "var(--text-hero)", fontWeight: 900,
        letterSpacing: "-0.025em", color: "var(--color-text)", lineHeight: 0.95,
      }}>
        ${fmt0(totalAccountValue)}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {hasQuotes ? (
          <>
            <span className="mono" style={{
              fontSize: "var(--text-sm)", fontWeight: 700,
              color: totalDayChange >= 0 ? "var(--color-bull)" : "var(--color-bear)",
            }}>
              {totalDayChange >= 0 ? "▲" : "▼"}{" "}
              {totalDayChange >= 0 ? "+" : "−"}${fmt0(Math.abs(totalDayChange))}{"  "}
              {totalDayChangePct >= 0 ? "+" : ""}{fmt(totalDayChangePct, 2)}%
            </span>
            <span style={{ fontSize: "var(--text-meta)", color: "var(--color-muted)" }}>today</span>
          </>
        ) : (
          <span style={{ fontSize: "var(--text-meta)", color: "var(--color-muted)" }}>
            {holdings.length} positions · {cashBalance > 0 ? `$${fmt0(cashBalance)} cash` : "no cash"}
          </span>
        )}
      </div>
    </div>
    <RangeToggle value={period} onChange={setPeriod} />
  </div>
  <BenchmarkChart totalGainPct={totalGainPct} period={period} seed={benchmarkSeed} />
</div>
```

Notes: the "Growth vs S&P 500" eyebrow is dropped (legend under the chart already names both series). The All-time / Invested block and its `borderTop` divider are deleted — they move to the stat row (Task 3). `BenchmarkChart` is unchanged (it already has the transparent-fading area fill, axis labels, legend, and outperformance badge).

- [ ] **Step 2.2: Make the chart taller for the hero role.** In `BenchmarkChart`, change `const W = 520, H = 172;` to `const W = 900, H = 200;` (it renders `width="100%"` + `preserveAspectRatio="none"`, so this only changes proportions/px height).

- [ ] **Step 2.3: Update CSS.** In `src/app/globals.css`, replace the `.portfolio-hero` / `.portfolio-hero-chart` rules (and their 900px media-query overrides) with:

```css
/* Portfolio open hero — value block over full-bleed chart, no card chrome. */
.portfolio-hero-open {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
```

Grep first to confirm nothing else uses `portfolio-hero` / `portfolio-hero-chart`: `grep -rn "portfolio-hero" src/`. Delete both class rules everywhere they appear.

- [ ] **Step 2.4: Visual check** — dev server (see Verification section), portfolio page: no border/box around the hero, value top-left, pills top-right, chart full-width beneath, legend below chart. Check light + dark themes.

- [ ] **Step 2.5: Commit**

```bash
git add src/app/portfolio/page.tsx src/app/globals.css
git commit -m "feat(portfolio): open chart-canvas hero, drop gradient card"
```

---

### Task 3: Portfolio bare 6-stat row

**Files:**
- Modify: `src/app/portfolio/page.tsx` (KPI strip, `src/app/portfolio/page.tsx:654-678`)
- Modify: `src/app/globals.css` (`.portfolio-kpis` grid)

- [ ] **Step 3.1: Extend the stat row to six `KpiStat`s** in this order (All-time and Invested first, migrated from the old hero):

```tsx
<div className="portfolio-kpis" style={{ gap: 28, padding: "0 4px" }}>
  <KpiStat
    label="All-time"
    value={`${totalGain >= 0 ? "+" : "−"}$${fmt0(Math.abs(totalGain))}`}
    sub={`${totalGainPct >= 0 ? "+" : ""}${fmt(totalGainPct, 1)}% overall`}
    accent={totalGain >= 0 ? "var(--color-bull)" : "var(--color-bear)"}
  />
  <KpiStat label="Invested" value={`$${fmt0(totalCost)}`} sub="Cost basis" />
  <KpiStat
    label="Buying power"
    value={cashBalance > 0 ? `$${fmt0(cashBalance)}` : "—"}
    sub="Available cash"
  />
  <KpiStat
    label="Equity"
    value={`$${fmt0(equityValue)}`}
    sub={`${holdings.length} holding${holdings.length !== 1 ? "s" : ""}`}
  />
  <KpiStat
    label="vs S&P 500 YTD"
    value={`${ytdOutperform >= 0 ? "+" : ""}${fmt(ytdOutperform, 1)}%`}
    sub="Outperformance"
    accent={ytdOutperform >= 0 ? "var(--color-bull)" : "var(--color-bear)"}
  />
  <KpiStat
    label="Day change"
    value={hasQuotes ? `${totalDayChange >= 0 ? "+" : "−"}$${fmt0(Math.abs(totalDayChange))}` : "—"}
    sub={hasQuotes ? `${totalDayChangePct >= 0 ? "+" : ""}${fmt(totalDayChangePct, 2)}% today` : undefined}
    accent={totalDayChange >= 0 ? "var(--color-bull)" : "var(--color-bear)"}
  />
</div>
```

The cash inline-edit affordance in the topbar (`ADD CASH` tbtn) is untouched.

- [ ] **Step 3.2: CSS grid** — update `.portfolio-kpis` to `repeat(6, 1fr)` desktop; in the existing `@media (max-width: 900px)` block change to `repeat(3, 1fr)`; add `@media (max-width: 560px) { .portfolio-kpis { grid-template-columns: repeat(2, 1fr); } }`.

- [ ] **Step 3.3: Update `PortfolioSkeleton`** (`src/app/portfolio/page.tsx:336-368`) to mirror the new layout: replace the bordered 220px hero block with an unboxed shimmer (eyebrow-width bar + wide value bar + 160px-tall chart shimmer), and change the KPI shimmer grid from `repeat(4, 1fr)` to `repeat(6, 1fr)`.

- [ ] **Step 3.4: Visual check** — six stats, no borders, wraps 3-up on tablet width; skeleton shows correct shape on hard reload.

- [ ] **Step 3.5: Commit**

```bash
git add src/app/portfolio/page.tsx src/app/globals.css
git commit -m "feat(portfolio): bare six-stat row (all-time + invested join)"
```

---

### Task 4: Portfolio donut card + holdings table chrome

**Files:**
- Modify: `src/app/portfolio/page.tsx` (alloc grid, `src/app/portfolio/page.tsx:680-856`)

- [ ] **Step 4.1: Donut card header** — give the allocation card the same header strip as the holdings table instead of a floating eyebrow: a header div with `padding: "12px 18px"`, `background: "var(--color-surface)"`, `borderBottom: "1px solid var(--color-border)"` containing `<Eyebrow>Allocation</Eyebrow>`; card body keeps padding 20. Card container: `border: 1px solid var(--color-border)`, `borderRadius: "var(--radius-lg)"`, `overflow: "hidden"`, background `var(--color-bg)` (drop the full-card `--color-surface` fill so both cards match).

- [ ] **Step 4.2: Holdings table polish** — keep columns and behavior exactly; only align chrome: header cells keep current style; ensure row hover uses the existing `.portfolio-row:hover` rule; add `.std-focus` to interactive rows if missing (`className="portfolio-row std-focus"`); last row `borderBottom: "none"` for a clean card edge.

- [ ] **Step 4.3: Visual check** — donut card and table card read as siblings (same border, radius, header strip); hover-linking donut ↔ legend still works.

- [ ] **Step 4.4: Commit**

```bash
git add src/app/portfolio/page.tsx
git commit -m "style(portfolio): align donut + holdings cards to standard chrome"
```

---

### Task 5: Watchlist — simplified table columns

**Files:**
- Modify: `src/components/watchlist/WatchlistSplitRail.tsx` (COLS/TableHead/TableRow/RowData, lines ~229-348, 434-453)

- [ ] **Step 5.1: RowData gains `marketCap`** — in the row-building map (`WatchlistSplitRail.tsx:434-453`), add `marketCap: live?.marketCap ?? null` (`useLiveBoard`'s rows already carry `marketCap` — `WatchlistBoard.tsx:167` uses it). Drop `f`, `grade`, and `signals` from `RowData` **only if** no longer referenced — NOTE: `signals` and `f` are still used for the rail feed and KPI `signalCount`; keep them in `RowData`, just stop rendering them as columns.

- [ ] **Step 5.2: New column set** — replace `COLS`/`RIGHT_COLS`:

```tsx
const COLS = ["Ticker", "Finava", "Last", "Day", "Mkt Cap", "Trend"] as const;
const RIGHT_COLS = new Set(["Last", "Day", "Mkt Cap", "Trend"]);
```

- [ ] **Step 5.3: Rewrite `TableRow`** to match the portfolio table cell-for-cell:
  - Ticker cell: accent chip (`padding: "3px 7px"`, `background: "var(--color-accent-light)"`, `color: "var(--color-accent)"`, `borderRadius: "var(--radius-xs)"`) + company name in `--text-sm` secondary — same as `portfolio/page.tsx:791-802`.
  - Finava cell: `<ScorePill score={data.score} />` (import from `@/components/ui/ScorePill`), replacing `ScoreBar` + `GradePill` + rank `#` column.
  - Last / Day / Mkt Cap: right-aligned `mono` `--text-sm`, tabular-nums; Day keeps bull/bear color + `+`/`−` prefix (drop the `▲/▼` glyphs to match portfolio); Mkt Cap formats `$X.XB` / `$X.XT` (reuse the `/1e9` formatting from `WatchlistBoard.tsx:167`, adding a `>= 1e12` T branch).
  - Trend: existing `<Sparkline data={data.series} width={68} height={22} …/>` sized to match portfolio (68×22).
  - Row: `className="portfolio-row std-focus"`, `cursor: "pointer"`, same borderBottom, remove-button cell unchanged (hover-reveal ×).
  - Delete now-unused components/imports if fully orphaned: `ScoreBar`, `GradePill`, `FactorTiles`, `FactorSkeleton` (check `FACTORS`, `factorColor`, `gradeClass` imports too).

- [ ] **Step 5.4: Verify** — `npx tsc --noEmit` clean; table renders: chip+name, score pill, last, day, cap, sparkline, hover ×; rows still sorted by score; click → stock page.

- [ ] **Step 5.5: Commit**

```bash
git add src/components/watchlist/WatchlistSplitRail.tsx
git commit -m "feat(watchlist): simplify table to portfolio-matching columns"
```

---

### Task 6: Watchlist — board + rail restyle, insight line

**Files:**
- Modify: `src/components/watchlist/WatchlistSplitRail.tsx` (root div, PageHeader secondRow, board wrapper, rail sections)
- Modify: `src/app/globals.css` (new `.wl-*` classes if needed)

- [ ] **Step 6.1: Stop using research-terminal wrappers in the content area.** Root div: change `className="research-root term"` → `className="research-root"` ONLY IF the page still renders correctly (PageHeader needs `research-root` context; `term` applies the terminal skin — verify with a quick before/after screenshot; if `term` is required by `b-lenses` pill styling in the header, keep it on a wrapper around PageHeader only). Replace the `b-board`/`b-boardhead`/`b-table` table wrapper with the portfolio card pattern:

```tsx
<div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", background: "var(--color-surface)", borderBottom: "1px solid var(--color-border)" }}>
    <Eyebrow>{active?.name ?? "Watchlist"}</Eyebrow>
    <span style={{ fontSize: "var(--text-meta)", color: "var(--color-muted)" }}>Sorted by Finava score · click a row to open</span>
  </div>
  <table style={{ width: "100%", borderCollapse: "collapse" }}>…</table>
</div>
```

(Add a local `Eyebrow` helper identical to portfolio's, or inline the `eyebrow-label` class — grep `eyebrow-label` in globals.css to confirm it's global.)

- [ ] **Step 6.2: Insight line.** Replace the six `KpiTile`s in `secondRow` with three plain label/value pairs (no borders, KpiStat-style) computed from existing values: Avg day (`avg`), Top mover (`movers[0]` ticker + %), Worst mover (`movers[movers.length-1]` ticker + %); keep `AddTickerSearch` right-aligned via `marginLeft: "auto"`. Update the PageHeader `subtitle` to `` `${n} TICKERS · ${gainers} GREEN TODAY` ``. Delete `KpiTile` if orphaned.

- [ ] **Step 6.3: Rail restyle.** Keep `RailSection` structure and all three sections' content, but restyle each section as a standard card: container `border: 1px solid var(--color-border)`, `borderRadius: "var(--radius-lg)"`, `overflow: "hidden"`, header strip like Step 6.1 (surface bg, eyebrow label + count); rows keep their current layouts with `.portfolio-row`-style hover (`className="portfolio-row"` or a shared hover class) instead of `b-railrow`. Do not modify `b-*` CSS.

- [ ] **Step 6.4: Empty/loading states** — reword nothing; just confirm the skeleton and empty states still look right against the restyled page (the loading skeleton at `WatchlistSplitRail.tsx:579-589` is generic bars — leave as is).

- [ ] **Step 6.5: Verify** — Research page (`/research`) is pixel-identical (b-* untouched): open it and compare board styling. Watchlist: tabs work, rename/delete/new work, add-ticker works, remove-ticker works, rail rows navigate.

- [ ] **Step 6.6: Commit**

```bash
git add src/components/watchlist/WatchlistSplitRail.tsx src/app/globals.css
git commit -m "feat(watchlist): refined card chrome for board + rail, insight line"
```

---

### Task 7: Full verification pass

- [ ] **Step 7.1:** `npx vitest run` — all green (logic untouched; this guards accidental import breaks).
- [ ] **Step 7.2:** `npx tsc --noEmit` (or the project's typecheck script) — clean.
- [ ] **Step 7.3:** Dev-server walkthrough (see Verification below): portfolio with holdings, portfolio empty state, portfolio loading skeleton, watchlist with tickers, watchlist empty list, watchlist no-lists state, research page unchanged, light + dark themes, and the `md` breakpoint (resize to tablet width).
- [ ] **Step 7.4:** Copy this plan to `docs/superpowers/plans/2026-08-12-portfolio-watchlist-ui-refresh.md` and commit it (plan-mode blocked writing it there during planning):

```bash
git add docs/superpowers/plans/2026-08-12-portfolio-watchlist-ui-refresh.md
git commit -m "docs(plan): portfolio & watchlist UI refresh implementation plan"
```

## Verification (end-to-end)

1. **Dev server:** another session may hold port 3000 — start via the Browser pane's `preview_start` with the launch.json config. If the server dies on start, `rm -rf .next` first (known gotcha). Log in via the dev-auth toggle (`finava_dev_auth` localStorage key) if the login gate appears; dev portfolio holdings come from `src/lib/devPortfolio.ts`.
2. **Portfolio** (`/portfolio`): open hero — no card/border anywhere around value+chart; range pills switch periods; 6-stat row; donut/table sibling cards; row click → `/stock/NVDA`.
3. **Watchlist** (`/watchlist`): tabs switch lists; insight line shows avg/top/worst; simplified 6-column table with score pills and sparklines; hover × removes; rail = three refined cards with working navigation.
4. **Regression:** `/research` board unchanged; sidebar compact watchlist (`WatchlistBoard` compact mode) unchanged; `npx vitest run` green.
5. **Themes/responsive:** toggle dark mode (Settings → Appearance); check 900px and 560px widths.
