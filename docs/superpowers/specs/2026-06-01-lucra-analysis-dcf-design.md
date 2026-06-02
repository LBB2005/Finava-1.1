# Lucra Analysis + DCF tabs — design

**Date:** 2026-06-01
**Branch:** feat/research-page
**Status:** Approved (brainstorm), implementing

## Summary

Add two tabs to the stock detail page (`/stock/[ticker]`): **DCF** and **Lucra**.

- **Lucra** — a multi-agent AI analysis. Clicking the tab fires the run; five signal
  agents stream their results in progressively; a synthesis step then produces an
  overall score, fair value, written verdict, catalysts/risks, and a three-way
  valuation comparison (Lucra vs Street vs DCF). Layout = the approved **B1** mock
  (score ring on the left, editorial detail on the right), in light-mode app tokens.
- **DCF** — an interactive discounted-cash-flow model. Server returns base inputs
  (FCF, shares, net debt, historical growth, suggested WACC); the client renders
  sliders for WACC + growth and recomputes intrinsic fair value live.

## Decisions (from brainstorm)

| Question | Decision |
|---|---|
| Trigger | Tab click runs it (A) |
| Caching | Once per session per ticker (A) |
| Signals | 5 — Fundamentals, Momentum, Sentiment, Analyst, Insider (B) |
| DCF | Interactive, live recompute on WACC/growth (B) |
| Architecture | Streaming SSE, progressive reveal (B) |
| Layout | B1 — ring + editorial right, light mode |

## Architecture

### Shared types — `src/lib/lucra.ts`
```ts
type SignalKey = "fundamentals" | "momentum" | "sentiment" | "analyst" | "insider";
interface LucraSignal { key; label; score /*0-100*/; stance; headline; detail; }
interface LucraVerdict {
  score; stance; confidence; fairValue; upsidePct; take;
  catalysts: string[]; risks: string[];
  comparison: { lucra; street; dcf };
}
interface LucraAnalysis { signals: LucraSignal[]; verdict: LucraVerdict | null; }
```

### DCF math — `src/lib/dcf.ts` (pure, shared client+server)
- `DcfInputs` — baseFcf, sharesOutstanding, netDebt, historicalGrowth, suggestedWacc,
  currentPrice.
- `computeDcf(inputs, { wacc, growth, years=5, terminalGrowth=2.5% })` →
  `{ fairValue, equityValue, pvExplicit, pvTerminal }`. Standard 5-yr explicit FCF
  projection + Gordon terminal value, discounted, less net debt, per share.
- `suggestedWaccFromBeta(beta)` — CAPM-ish: riskFree 4% + beta·5%, clamped 7–13%.

### EDGAR — `src/lib/edgar.ts`
Add capex to `extractFinancialMetrics` (`PaymentsToAcquirePropertyPlantAndEquipment`)
so FCF = operating cash flow − capex.

### LLM routing — `src/lib/llm.ts`
Add one AgentKey `lucraSynthesis` → Sonnet (user-facing quality). The five signal
agents reuse existing keys: `fundamentals`, `technical` (momentum), `sentiment`,
`analyst`, `insider` — already tiered.

### Routes
- `POST /api/stock/[ticker]/lucra-analysis` — auth-gated, SSE. Builds the bundle +
  DCF inputs once, fires 5 signal agents in parallel, enqueues each as it resolves
  (`{type:"signal"}`), then runs synthesis and enqueues `{type:"verdict"}`. Each
  agent returns strict JSON; failures isolate to a neutral signal rather than killing
  the stream.
- `GET /api/stock/[ticker]/dcf` — returns `DcfInputs` (public, read-only market data,
  matches the bundle route).

### Client
- `src/lib/lucraStore.ts` — module-level `Map<ticker, LucraAnalysis>` + subscribe +
  in-flight dedup. Survives tab unmount, so the run happens once per session and
  progress persists if the user toggles tabs mid-stream. `runLucra(ticker)` POSTs via
  `authFetch`, reads the response stream, parses `data:` lines, updates the store.
- `src/hooks/useLucra.ts` — subscribes to the store for a ticker; exposes
  `{ analysis, status, run }`.
- `src/components/stock/LucraTab.tsx` — B1 layout. Left: score ring (spinner→fills on
  verdict), stance badge, fair value, confidence dots. Right: 5 signal bars (fill in
  progressively as they stream), then The Take, Valuation comparison, Risk flags.
- `src/components/stock/DcfTab.tsx` — fetches inputs, WACC + growth sliders, live
  fair-value readout + upside vs current price, sensitivity note. Honest labelling
  (FCF proxy, assumptions) and a not-advice footer.
- `src/app/stock/[ticker]/page.tsx` — add `"DCF"` and `"Lucra"` to `TABS`; render the
  two components.

## Error handling
- Any single signal agent failing → that signal returns a neutral 50/"unavailable"
  card; the rest proceed. Synthesis still runs.
- Synthesis failure → `{type:"error"}` event; tab shows a retry.
- DCF inputs missing (no CIK / ETF / foreign) → tab shows "DCF unavailable for this
  symbol" (same pattern as Financials/Analysts empty states).
- Streaming aborts (network) → store marks error; UI offers retry.

## Not in scope
- Persisting analyses server-side / across sessions (session cache only).
- Re-running on data refresh (cached until reload).
- Backtesting the Lucra score's predictive value (calibration is a later effort —
  the verdict is framed as research color, not advice).
