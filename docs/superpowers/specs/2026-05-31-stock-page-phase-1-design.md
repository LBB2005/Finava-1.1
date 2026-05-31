# Stock Page & Data Layer — Phase 1 Design

**Date:** 2026-05-31
**Status:** Approved for spec review
**Scope:** Phase 1 of a larger portfolio-insights initiative (see "Roadmap" below)

## Problem

Clicking a stock in the portfolio currently pushes an "Analyze {ticker}" message into
`/chat` (see `src/app/portfolio/page.tsx` and `src/components/layout/Sidebar.tsx`).
There is no dedicated stock page. The user wants clicking a holding to **navigate to a
real research page** — live quote, chart, fundamentals, analysts, insider activity, news,
and their own position — like a normal research/trading platform. AI must be **opt-in**,
never auto-prompted by a click.

The data already exists in `src/lib` (`finnhub.ts`, `edgar.ts`, `polygon.ts`,
`alpaca.ts`) but is not exposed per-ticker to the client.

## Goals (Phase 1)

1. A dedicated `/stock/[ticker]` route that works for **any** ticker (owned or not).
2. A single aggregated server route that bundles all per-ticker data.
3. Replace the "click → chat prompt" behavior with "click → stock page" everywhere
   (portfolio table, sidebar holdings, tickers in summary widgets) + a ticker search box.
4. Opt-in AI only (a "Generate AI take" button and an "Ask AI about {ticker}" button).
5. A line/area price chart with timeframe toggles (1D–5Y).

## Non-Goals (Phase 1 — deferred)

- **Portfolio enrichment** (AI summary, movers, risk, equity curve, income/events) → Phase 2.
- **Multi-source LLM sentiment engine** (Reddit + news + StockTwits + X, LLM-scored) → Phase 3.
  Phase 1 ships a **simple placeholder** sentiment read derived from existing news headlines,
  clearly marked for upgrade.
- Candlestick charts + technical indicators (RSI, moving averages). Phase 1 is line/area only.
- Real trading / paper-trading actions from the stock page.

## Architecture

### Data layer

**`GET /api/stock/[ticker]`** — aggregated bundle. Follows the existing pattern in
`src/app/api/quotes/route.ts` (server-side, app-level API keys, no user auth required, so it
also works under the dev auth bypass). Returns:

- `quote` — price, change, changePct (via `finnhub.getQuote` / `getSnapshots`)
- `profile` — name, exchange, industry, logo (`getCompanyProfile`)
- `keyStats` — market cap, P/E, 52-wk range, beta, dividend yield (`getBasicFinancials`)
- `candles` — default range (1M) for first paint (`getCandles`, fallback Finnhub→Alpaca→Polygon)
- `analysts` — recommendation trend + price target (`getRecommendationTrends`, `getPriceTarget`)
- `fundamentals` — multi-year revenue/earnings/margins/FCF (`edgar.extractFundamentalTimeSeries`)
- `insider` — recent Form 4 transactions (`getInsiderTransactions`)
- `news` — recent company news (`getCompanyNews`)
- `sentiment` — **placeholder**: lightweight heuristic over `news` headlines, shaped to match
  the future engine's output so the panel upgrades cleanly in Phase 3.

Each sub-fetch is independent and failure-isolated: if one source errors, the route returns
the rest with that field `null` (the page degrades gracefully per panel).

**`GET /api/stock/[ticker]/candles?range=1D|1W|1M|3M|1Y|5Y`** — candles only, called when the
user switches timeframe (avoids refetching the whole bundle).

**Caching:** per-ticker, tiered by volatility — quote/candles short (seconds–1 min),
profile/keyStats/analysts/insider/fundamentals longer (minutes–hours) — to stay within
Finnhub/EDGAR rate limits. Use the platform's runtime cache / route-level caching.

**Live price:** the header keeps ticking via the existing `/api/quotes` 30s polling
(`useQuotes`), independent of the heavier bundle.

### Stock page (`/stock/[ticker]`)

New dynamic route. Composed of small, independently testable components:

| Component         | Responsibility                                                        |
|-------------------|-----------------------------------------------------------------------|
| `StockHeader`     | Exchange, company, big live price + day change, Watchlist + Ask AI btn |
| `PriceChart`      | Line/area chart, 1D–5Y toggles, OHLC/volume readout, calls candles API |
| `AiTakePanel`     | Opt-in "Generate AI take" button → inline thesis; + placeholder sentiment meter |
| `PositionCard`    | Shares/cost/value/P&L/% of portfolio — **rendered only if the ticker is held** |
| `KeyStats`        | Market cap, P/E, 52-wk range, beta, dividend yield                    |
| `AnalystPanel`    | Consensus rating, price target, buy/hold/sell distribution            |
| `FundamentalsPanel`| EDGAR revenue/earnings trend bars                                    |
| `InsiderPanel`    | Form 4 buys/sells list                                                |
| `NewsPanel`       | Recent headlines with source + timestamp                             |

`PositionCard` reads `usePortfolio()` (which already serves the dev mock book under the dev
bypass) and shows only when the ticker is in holdings.

### AI access (opt-in only)

- **Header "Ask AI about {ticker}"** → `setPendingMessage` + `router.push('/chat')` (existing
  chat flow), seeded with the ticker.
- **AiTakePanel "Generate AI take"** → small server call that produces an inline thesis on
  demand. Nothing runs on page load.

### Navigation wiring

Replace the current "Analyze {ticker} → chat" behavior with `router.push('/stock/${ticker}')`:

- Portfolio holdings table rows (`src/app/portfolio/page.tsx`)
- Sidebar holdings list (`src/components/layout/Sidebar.tsx`)
- Tickers rendered inside summary/movers widgets (as they land in Phase 2; Phase 1 wires the
  two existing surfaces)
- **Ticker search box** — a lookup input (header or sidebar) that routes to any symbol's page.

## Data Flow

1. User clicks a holding → `router.push('/stock/NVDA')`.
2. Stock page server-loads the `/api/stock/NVDA` bundle for first paint.
3. `PriceChart` timeframe change → `/api/stock/NVDA/candles?range=1Y`.
4. Header price ticks via existing `/api/quotes` polling.
5. `PositionCard` reads `usePortfolio()` client-side; shows only if held.
6. AI affordances fire only on explicit click.

## Error Handling

- Bundle route: per-field failure isolation; missing field → `null` → panel shows an empty/
  "unavailable" state rather than crashing the page.
- Invalid/unknown ticker → 404 page state with a "couldn't find {ticker}" message.
- Missing `FINNHUB_API_KEY` → 503 with a clear message (mirrors the quotes route).

## Testing

- Unit-test the aggregator's failure-isolation (one source throws → others still returned).
- Unit-test the candles range mapping (range string → resolution/from/to).
- Component tests: `PositionCard` renders only when held; panels render empty states on `null`.
- Manual: under the dev bypass, click each mock holding (AAPL, MSFT, NVDA, …) → stock page
  loads with live data; switch timeframes; confirm no AI fires without a click.

## Implementation Constraints

- **This is a customized Next.js build.** Per `AGENTS.md`, read the relevant guide in
  `node_modules/next/dist/docs/` before writing route/page code; APIs and conventions may
  differ from upstream. Heed deprecation notices.
- Follow existing patterns: API routes mirror `src/app/api/quotes/route.ts`; data access goes
  through `src/lib/*` wrappers (don't call vendors directly from components).
- Keep components small and focused (one panel = one component).

## Roadmap (future phases — not specced here)

- **Phase 2 — Portfolio enrichment:** AI summary (Daily/Weekly), metric cards, movers &
  attribution, risk & concentration, equity curve vs S&P, income & events.
- **Phase 3 — Multi-source LLM sentiment engine:** Reddit + financial news + StockTwits + X,
  each behind a common pluggable source interface (X gated on a paid key, flipped on later),
  LLM-classified per item, aggregated and cached per ticker. Upgrades the Phase 1 sentiment
  placeholder in place.
