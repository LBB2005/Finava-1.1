# Finava Score v2 — Deterministic 15-Factor Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current LLM-guesstimated Finava Score with a deterministic, auditable, reproducible score built from ~15 real factors rolled into 6 display pillars, with exclude-and-reweight handling of missing data and a separate confidence model.

**Architecture:** A new pure module `src/lib/finavaScore.ts` maps raw per-metric data → 0–100 sub-factor scores via calibrated absolute curves, blends factors → pillars → overall score with proportional reweighting when data is missing. The streaming route `finava-analysis/route.ts` is rewired: it assembles the data inputs (EDGAR + Finnhub `metric=all` + candles + Grok X-sentiment + insider), computes the deterministic score, and uses the LLM **only** for the written narrative (the "take") plus the two genuinely-qualitative factors (Fundamentals nuance, news Sentiment). Confidence is derived from data coverage + signal agreement + volatility, never from the LLM.

**Tech Stack:** Next.js 16 (App Router, Node runtime), TypeScript, Vitest 4, existing libs (`factors.ts`, `dcf.ts`, `edgar.ts`, `finnhub.ts`, `sentiment/grok.ts`).

---

## ⚠️ One design decision to confirm before Phase 1

**Single-stock metric → score mapping uses *absolute calibrated curves*, not sector-relative percentiles.**

`factors.ts` scores by ranking a metric against the whole S&P 500 within a sector. On a single stock page we can't rank against a universe cheaply, and we want a *stable absolute* read ("ROE 25% → ~80" regardless of who else is on the board). So this plan defines absolute piecewise-linear scoring curves per metric (sector-agnostic for now; valuation/leverage curves are deliberately lenient because they vary by sector). A later enhancement can cross-reference the cached research universe percentile when the ticker is in the S&P 500. **If you'd rather lead with sector-relative percentiles, stop and say so — it changes the engine's core.**

---

## Pillar & factor weights (locked with Liam)

Pillar weights (sum 100):

| Pillar | Weight |
|---|---:|
| Fundamentals | 28 |
| Valuation | 22 |
| Analyst | 18 |
| Momentum | 12.5 |
| Sentiment | 12.5 |
| Insider | 7 |

Within-pillar factor weights:

| Pillar | Factor | key | In-pillar wt | Phase |
|---|---|---|---:|---|
| Fundamentals | Growth | `growth` | 0.25 | 1 |
| | Profitability (margins) | `profitability` | 0.20 | 1 |
| | Returns on capital | `returns` | 0.25 | 1 |
| | Balance-sheet health | `health` | 0.15 | 1 |
| | Cash-flow quality | `cashflow` | 0.15 | 1 |
| Valuation | Relative (multiples vs peers/history) | `relativeVal` | 0.55 | 1 |
| | Absolute (price vs DCF) | `absoluteVal` | 0.45 | 1 |
| Analyst | Consensus rating skew | `rating` | 0.40 | 1 |
| | Estimate revisions | `revisions` | 0.40 | 2 (paid feed) |
| | Earnings surprise history | `surprise` | 0.20 | 1 |
| Momentum | Price trend (MA/RSI) | `trend` | 0.55 | 1 |
| | Relative strength vs market | `relStrength` | 0.45 | 1 |
| Sentiment | News | `news` | 0.50 | 1 |
| | X / social (Grok) | `social` | 0.50 | 1 |
| Insider | Net normalized flow | `insiderFlow` | 1.00 | 1 (0 bug-fix) |

**Exclude-and-reweight rule:** a factor whose input is `null` is dropped; the pillar score is the weighted mean of the *remaining* factors (weights renormalized). A pillar with zero available factors is itself `null` and dropped from the overall blend (overall weights renormalized over present pillars). The `revisions` factor (Phase 2) is simply always-`null` until the paid feed lands, so the Analyst pillar self-reweights to rating(0.40)/surprise(0.20) → rating 0.67 / surprise 0.33.

---

## Data source verdict (from the live probe, 2026-06-11)

Probed on the current Finnhub key across AAPL/GOOGL/MSFT/NVDA/PLTR:

- ✅ Available: `recommendation` (rating skew), `earnings` (surprise), `peers`, `metric=all` (133 fields incl. `roiTTM`, `roeTTM`, `roaTTM`, margins, `peTTM`, `psTTM`, `pbAnnual`, `revenueGrowthTTMYoy`, `epsGrowthTTMYoy`, `totalDebt/totalEquityQuarterly`, `currentRatioQuarterly`).
- ❌ Premium-gated (403): `price-target`, `eps-estimate`, `revenue-estimate`.
- **Root-cause reclassification:** the GOOGL "No analyst data" bug is **not** a plan gate — `recommendation` returns full data. It is **rate-limit contention**: `getStockBundle` fires ~8 concurrent Finnhub calls (`stockData.ts:326`) on a 60/min free tier shared with the research scan, so the recommendation call intermittently 429s and `settled()` swallows it to `null`. Fixed in Phase 0.

So **Phase 1 ships 12 of 15 factors** on current keys. `targetUpside` and `revisions` are Phase 2 (a paid feed — provider TBD by Liam).

---

## File structure

- **Create** `src/lib/finavaScore.ts` — the pure deterministic engine (curves, blend, confidence). No I/O.
- **Create** `src/lib/finavaScore.test.ts` — Vitest unit tests for the engine.
- **Create** `src/lib/finavaInputs.ts` — assembles `ScoreInputs` from the data libs (EDGAR/Finnhub metric/candles/grok/insider). Has I/O; thin.
- **Create** `src/lib/finavaInputs.test.ts` — tests the pure extractor helpers in `finavaInputs.ts` (the metric→number mappers), not the network.
- **Modify** `src/lib/finava.ts` — extend types: add `valuation` to `SignalKey`, add per-pillar `factors` breakdown to `FinavaSignal`, keep wire protocol stable.
- **Modify** `src/app/api/stock/[ticker]/finava-analysis/route.ts` — rewire to compute the deterministic score, stream pillar signals, LLM only for the take.
- **Modify** `src/lib/finnhub.ts` — add `getPeerMetrics` helper (peers + their metrics) with throttling/caching; add `mapPool`-style concurrency guard import or inline.
- **Modify** `src/lib/stockData.ts` — fix the concurrency/rate-limit bug (sequence the analyst calls behind a small pool; cache-first).
- **Modify** `src/components/stock/FinavaTab.tsx` — add Valuation bar; render factor breakdown on expand; fix the "upside/downside" label sign bug.

Run tests with: `npx vitest run src/lib/finavaScore.test.ts` (there is no `npm test` script; vitest is invoked directly; path alias `@/` is configured in `vitest.config.ts`).

---

# PHASE 0 — Stop the bleeding (bug fixes on the current LLM engine)

These ship independently of the new engine and fix the most visible wrongness. Do them first.

### Task 0.1: Fix the analyst rate-limit/concurrency bug

**Why:** `recommendation` works for GOOGL; it only goes dark under the 8-wide concurrent burst. Throttle the rate-limit-sensitive Finnhub calls behind a tiny pool and keep the cache-first behavior.

**Files:**
- Modify: `src/lib/stockData.ts:326-337`

- [ ] **Step 1: Write the failing test**

Create `src/lib/stockData.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// We test the new runPooled helper in isolation: it must cap concurrency.
import { runPooled } from "@/lib/stockData";

describe("runPooled", () => {
  it("never runs more than `limit` tasks at once", async () => {
    let active = 0;
    let peak = 0;
    const make = () => async () => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--; return active;
    };
    await runPooled([make(), make(), make(), make(), make(), make()], 2);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("returns results index-aligned and isolates failures to null", async () => {
    const tasks = [
      async () => 1,
      async () => { throw new Error("boom"); },
      async () => 3,
    ];
    const out = await runPooled(tasks, 2);
    expect(out).toEqual([1, null, 3]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/stockData.test.ts`
Expected: FAIL — `runPooled` is not exported.

- [ ] **Step 3: Implement `runPooled` and use it for the rate-limited calls**

Add to `src/lib/stockData.ts` (near the other helpers, after `settled`):

```ts
/**
 * Run thunks with at most `limit` in flight. Each thunk's rejection is isolated
 * to a `null` in the output (index-aligned), so one rate-limited Finnhub call
 * can't blank the whole bundle. Used to keep the per-ticker fan-out under the
 * 60/min free-tier ceiling that was intermittently 429-ing the analyst feed.
 */
export async function runPooled<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<Array<T | null>> {
  const out = new Array<T | null>(tasks.length).fill(null);
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const idx = cursor++;
      try {
        out[idx] = await tasks[idx]();
      } catch {
        out[idx] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return out;
}
```

Then replace the single `Promise.all([...])` block at `getStockBundle` (`stockData.ts:326-337`) with a pooled fan-out capped at 4 concurrent Finnhub calls (EDGAR/Alpaca/Polygon are separate hosts and stay parallel):

```ts
  // Finnhub free tier is 60/min and shared with the research scan; cap the
  // per-ticker Finnhub fan-out at 4 in flight so the analyst feed stops 429-ing.
  const [profileRaw, quote, statsRaw, candles, trendsRaw, targetRaw, insiderRaw, newsRaw] =
    await runPooled(
      [
        () => getCompanyProfile(ticker),
        () => getQuote(ticker),
        () => getBasicFinancials(ticker),
        () => getCandles(ticker, resolution, cFrom, cTo),
        () => getRecommendationTrends(ticker),
        () => getPriceTarget(ticker),
        () => getInsiderTransactions(ticker),
        () => getCompanyNews(ticker, from, to),
      ],
      4
    );
  const fundamentals = await settled(fetchFundamentals(ticker)); // EDGAR, separate host
```

(Keep the existing `extractNews`/return block unchanged below.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/stockData.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stockData.ts src/lib/stockData.test.ts
git commit -m "fix(finava): throttle per-ticker Finnhub fan-out so analyst data stops going dark"
```

### Task 0.2: Fix the insider false-negative (normalize, don't penalize routine selling)

**Why:** routine 10b5-1 / RSU selling at megacaps reads as "significant insider selling → 10". Normalize net flow by shares outstanding and damp the magnitude so routine selling lands near neutral, and pass a structured `insiderNetFlow` instead of a raw transaction dump.

**Files:**
- Modify: `src/lib/stockData.ts` (add `insiderNetFlow` to the bundle), `src/lib/finava.ts` is untouched here.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/stockData.test.ts`:

```ts
import { insiderNetFlow } from "@/lib/stockData";

describe("insiderNetFlow", () => {
  const sharesOut = 12_000_000_000; // ~GOOGL scale

  it("routine modest selling lands near neutral, not bearish", () => {
    const trades = [
      { shares: -50_000, direction: "sell" as const },
      { shares: -30_000, direction: "sell" as const },
    ];
    const f = insiderNetFlow(trades, sharesOut);
    // tiny fraction of float → close to 0 (neutral), never near -1
    expect(f).not.toBeNull();
    expect(Math.abs(f!)).toBeLessThan(0.15);
  });

  it("heavy net buying is clearly bullish", () => {
    const trades = [
      { shares: 3_000_000, direction: "buy" as const },
      { shares: 2_000_000, direction: "buy" as const },
    ];
    const f = insiderNetFlow(trades, 50_000_000);
    expect(f!).toBeGreaterThan(0.3);
  });

  it("returns null when there are no trades", () => {
    expect(insiderNetFlow([], sharesOut)).toBeNull();
    expect(insiderNetFlow(null, sharesOut)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/stockData.test.ts`
Expected: FAIL — `insiderNetFlow` is not exported.

- [ ] **Step 3: Implement `insiderNetFlow`**

Add to `src/lib/stockData.ts`:

```ts
/**
 * Net insider flow as a signed magnitude in roughly [-1, 1].
 * netShares / sharesOutstanding is a minuscule number for real companies, so we
 * scale it by a sensitivity constant and clamp. The point is that *routine*
 * scheduled selling (a sliver of float) sits near 0 (neutral), while only an
 * unusually large net buy or sell pushes toward the extremes. Returns null when
 * there's nothing to judge — the caller then EXCLUDES the insider factor rather
 * than scoring a misleading 50.
 */
export function insiderNetFlow(
  trades: Array<{ shares: number }> | null,
  sharesOutstanding: number | null
): number | null {
  if (!trades || trades.length === 0) return null;
  const net = trades.reduce((a, t) => a + (Number.isFinite(t.shares) ? t.shares : 0), 0);
  if (net === 0) return 0;
  if (!sharesOutstanding || sharesOutstanding <= 0) {
    // No float to normalize against → use sign only, lightly.
    return Math.sign(net) * 0.1;
  }
  const SENSITIVITY = 800; // ~0.1% of float net ≈ 0.8 magnitude before clamp
  const raw = (net / sharesOutstanding) * SENSITIVITY;
  return Math.max(-1, Math.min(1, raw));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/stockData.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stockData.ts src/lib/stockData.test.ts
git commit -m "fix(finava): normalize insider flow so routine 10b5-1 selling isn't scored bearish"
```

### Task 0.3: Fix the upside/downside label sign bug in the UI

**Why:** the card shows "-38.5% upside" when the value is negative (it's downside). Label by sign.

**Files:**
- Modify: `src/components/stock/FinavaTab.tsx` (the fair-value block rendering `upsidePct`).

- [ ] **Step 1: Locate and read the label**

Run: `grep -n "upside" src/components/stock/FinavaTab.tsx`
Read the surrounding JSX so the exact expression is known before editing.

- [ ] **Step 2: Edit the label to be sign-aware**

Replace the rendered string (currently e.g. `` `${upsidePct.toFixed(1)}% upside` ``) with:

```tsx
{`${upsidePct >= 0 ? "+" : ""}${upsidePct.toFixed(1)}% ${upsidePct >= 0 ? "upside" : "downside"}`}
```

Keep the existing color logic; if none, color green when `>= 0` else red.

- [ ] **Step 3: Verify in the browser**

Use the preview workflow: start the dev server, open a stock whose fair value is below price (e.g. GOOGL), confirm the card reads "−38.5% downside" in red. Screenshot.

- [ ] **Step 4: Commit**

```bash
git add src/components/stock/FinavaTab.tsx
git commit -m "fix(finava): label negative fair-value gap as downside, not upside"
```

---

# PHASE 1 — The deterministic 15-factor engine

## Task 1.1: Scoring curve primitive + tests

**Files:**
- Create: `src/lib/finavaScore.ts`
- Test: `src/lib/finavaScore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/finavaScore.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { interp } from "@/lib/finavaScore";

describe("interp", () => {
  const curve: [number, number][] = [[-0.4, 18], [0, 55], [0.2, 72], [0.5, 88]];

  it("returns the anchor score at an exact anchor", () => {
    expect(interp(0, curve)).toBe(55);
    expect(interp(0.2, curve)).toBe(72);
  });

  it("interpolates linearly between anchors", () => {
    expect(interp(0.1, curve)).toBeCloseTo((55 + 72) / 2, 5); // midpoint of [0,0.2]
  });

  it("clamps below the first and above the last anchor", () => {
    expect(interp(-1, curve)).toBe(18);
    expect(interp(99, curve)).toBe(88);
  });

  it("returns null for null/NaN input", () => {
    expect(interp(null, curve)).toBeNull();
    expect(interp(NaN, curve)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/finavaScore.test.ts`
Expected: FAIL — module/export missing.

- [ ] **Step 3: Implement `interp`**

Create `src/lib/finavaScore.ts`:

```ts
// Deterministic Finava Score engine — pure, no I/O. Maps raw per-metric values to
// 0–100 sub-factor scores via calibrated piecewise-linear curves, then blends
// factors → pillars → overall with proportional reweighting when data is missing.

/** Piecewise-linear interpolation over ascending [x, score] anchors. Clamps at the
 *  ends. Returns null for null/NaN so missing data flows through as "excluded". */
export function interp(value: number | null, anchors: [number, number][]): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (value <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (value >= last[0]) return last[1];
  for (let i = 1; i < anchors.length; i++) {
    const [x0, s0] = anchors[i - 1];
    const [x1, s1] = anchors[i];
    if (value <= x1) {
      const t = (value - x0) / (x1 - x0);
      return s0 + t * (s1 - s0);
    }
  }
  return last[1];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/finavaScore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/finavaScore.ts src/lib/finavaScore.test.ts
git commit -m "feat(finava): add interp scoring primitive for the deterministic engine"
```

## Task 1.2: Factor curves + `ScoreInputs` type

**Files:**
- Modify: `src/lib/finavaScore.ts`
- Test: `src/lib/finavaScore.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/finavaScore.test.ts`:

```ts
import { scoreFactors, type ScoreInputs } from "@/lib/finavaScore";

const EMPTY: ScoreInputs = {
  revenueYoY: null, epsYoY: null, revenueCagr3y: null,
  grossMargin: null, operatingMargin: null, netMargin: null,
  roe: null, roa: null, roic: null,
  debtToEquity: null, currentRatio: null, fcfConversion: null,
  price: null, dcfFair: null,
  peTTM: null, peerPe: null, psTTM: null, peerPs: null,
  ratingSkew: null, targetUpsidePct: null, estimateRevisionPct: null, earningsSurprisePct: null,
  trendVs200: null, ret3m: null, relStrength6m: null,
  newsSentiment: null, xSentiment: null,
  insiderFlow: null,
  beta: null, annualizedVol: null,
};

describe("scoreFactors", () => {
  it("overvalued name scores absoluteVal low", () => {
    const f = scoreFactors({ ...EMPTY, price: 357, dcfFair: 143 });
    const av = f.find((x) => x.key === "absoluteVal")!;
    expect(av.score).not.toBeNull();
    expect(av.score!).toBeLessThan(40); // ~ -60% gap → bearish valuation
  });

  it("strong margins score profitability high", () => {
    const f = scoreFactors({ ...EMPTY, grossMargin: 60, operatingMargin: 35, netMargin: 28 });
    const p = f.find((x) => x.key === "profitability")!;
    expect(p.score!).toBeGreaterThan(75);
  });

  it("routine insider selling lands near neutral", () => {
    const f = scoreFactors({ ...EMPTY, insiderFlow: -0.08 });
    const i = f.find((x) => x.key === "insiderFlow")!;
    expect(Math.abs(i.score! - 50)).toBeLessThan(12);
  });

  it("missing inputs yield null-scored factors (excluded downstream)", () => {
    const f = scoreFactors(EMPTY);
    expect(f.every((x) => x.score === null)).toBe(true);
  });

  it("rating skew maps -1→~10, 0→50, +1→~90", () => {
    const lo = scoreFactors({ ...EMPTY, ratingSkew: -1 }).find((x) => x.key === "rating")!;
    const mid = scoreFactors({ ...EMPTY, ratingSkew: 0 }).find((x) => x.key === "rating")!;
    const hi = scoreFactors({ ...EMPTY, ratingSkew: 1 }).find((x) => x.key === "rating")!;
    expect(lo.score!).toBeLessThan(20);
    expect(mid.score!).toBe(50);
    expect(hi.score!).toBeGreaterThan(80);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/finavaScore.test.ts`
Expected: FAIL — `scoreFactors`/`ScoreInputs` missing.

- [ ] **Step 3: Implement `ScoreInputs`, factor metadata, and `scoreFactors`**

Append to `src/lib/finavaScore.ts`:

```ts
export interface ScoreInputs {
  // Fundamentals
  revenueYoY: number | null;      // fraction, 0.12 = +12%
  epsYoY: number | null;          // fraction
  revenueCagr3y: number | null;   // fraction
  grossMargin: number | null;     // percent (47.8)
  operatingMargin: number | null; // percent
  netMargin: number | null;       // percent
  roe: number | null;             // percent
  roa: number | null;             // percent
  roic: number | null;            // percent (null if unavailable; ROE/ROA still score the factor)
  debtToEquity: number | null;    // ratio (0.79)
  currentRatio: number | null;    // ratio
  fcfConversion: number | null;   // FCF / net income, ratio
  // Valuation
  price: number | null;
  dcfFair: number | null;
  peTTM: number | null;
  peerPe: number | null;          // median peer P/E
  psTTM: number | null;
  peerPs: number | null;          // median peer P/S
  // Analyst
  ratingSkew: number | null;          // -1..1
  targetUpsidePct: number | null;     // fraction; null until paid feed (Phase 2)
  estimateRevisionPct: number | null; // fraction; null until paid feed (Phase 2)
  earningsSurprisePct: number | null; // avg surprise, fraction
  // Momentum
  trendVs200: number | null;   // price/MA200 - 1, fraction
  ret3m: number | null;        // fraction
  relStrength6m: number | null;// stock 6m return minus SPY 6m return, fraction (percentage points/100)
  // Sentiment (already 0–100)
  newsSentiment: number | null;
  xSentiment: number | null;
  // Insider
  insiderFlow: number | null;  // -1..1 from insiderNetFlow()
  // Risk (confidence only)
  beta: number | null;
  annualizedVol: number | null; // fraction, e.g. 0.30
}

export interface FactorScore {
  key: string;
  label: string;
  pillar: PillarKey;
  weight: number;       // in-pillar weight
  score: number | null; // 0–100 or null when excluded
  detail: string;       // human one-liner
}

export type PillarKey =
  | "fundamentals" | "valuation" | "analyst" | "momentum" | "sentiment" | "insider";

const pct = (n: number | null) => (n == null ? "n/a" : `${n.toFixed(1)}%`);
const fpct = (n: number | null) => (n == null ? "n/a" : `${(n * 100).toFixed(1)}%`);

/** Average of the non-null sub-scores (used to combine e.g. ROE+ROA+ROIC). */
function meanScore(parts: (number | null)[]): number | null {
  const present = parts.filter((p): p is number => p != null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

export function scoreFactors(i: ScoreInputs): FactorScore[] {
  // ---- curves (absolute, sector-agnostic; lenient where sector variance is high) ----
  const growth = meanScore([
    interp(i.revenueYoY, [[-0.1, 25], [0, 42], [0.1, 62], [0.2, 78], [0.4, 92]]),
    interp(i.epsYoY, [[-0.15, 25], [0, 45], [0.15, 66], [0.3, 80], [0.5, 92]]),
    interp(i.revenueCagr3y, [[0, 40], [0.1, 62], [0.2, 80], [0.35, 92]]),
  ]);
  const profitability = meanScore([
    interp(i.grossMargin, [[10, 40], [30, 58], [50, 75], [70, 88]]),
    interp(i.operatingMargin, [[0, 38], [10, 55], [25, 75], [40, 90]]),
    interp(i.netMargin, [[0, 40], [10, 60], [20, 76], [30, 88]]),
  ]);
  const returns = meanScore([
    interp(i.roe, [[5, 40], [15, 62], [25, 80], [40, 92]]),
    interp(i.roa, [[1, 40], [6, 62], [12, 80], [20, 90]]),
    interp(i.roic, [[4, 40], [10, 62], [18, 80], [30, 92]]),
  ]);
  const health = meanScore([
    interp(i.debtToEquity, [[0, 85], [0.5, 70], [1, 55], [2, 38], [3, 22]]), // lower better
    interp(i.currentRatio, [[0.8, 38], [1, 50], [1.5, 68], [2.5, 80]]),
  ]);
  const cashflow = interp(i.fcfConversion, [[0.3, 38], [0.6, 55], [0.9, 70], [1.2, 84]]);

  // Valuation
  const upside = i.price != null && i.price > 0 && i.dcfFair != null
    ? (i.dcfFair - i.price) / i.price : null;
  const absoluteVal = interp(upside, [[-0.4, 18], [-0.2, 35], [0, 55], [0.2, 72], [0.5, 88]]);
  const peRel = i.peTTM != null && i.peerPe != null && i.peerPe > 0 ? i.peTTM / i.peerPe : null;
  const psRel = i.psTTM != null && i.peerPs != null && i.peerPs > 0 ? i.psTTM / i.peerPs : null;
  const relativeVal = meanScore([
    interp(peRel, [[0.6, 85], [0.8, 72], [1, 55], [1.3, 40], [1.8, 25]]), // cheaper-than-peers better
    interp(psRel, [[0.6, 82], [0.8, 70], [1, 55], [1.3, 42], [1.8, 28]]),
  ]);

  // Analyst
  const rating = i.ratingSkew == null ? null
    : Math.max(0, Math.min(100, 50 + i.ratingSkew * 40));
  const revisions = interp(i.estimateRevisionPct, [[-0.1, 22], [-0.02, 42], [0, 52], [0.03, 68], [0.08, 84]]);
  const surprise = interp(i.earningsSurprisePct, [[-0.1, 28], [0, 50], [0.05, 68], [0.1, 80]]);
  // NOTE: targetUpsidePct (Phase 2) folds into `rating` weighting later; kept separate-ready.

  // Momentum
  const trend = meanScore([
    interp(i.trendVs200, [[-0.2, 22], [0, 50], [0.1, 68], [0.25, 82]]),
    interp(i.ret3m, [[-0.25, 25], [0, 50], [0.15, 70], [0.3, 82]]),
  ]);
  const relStrength = interp(i.relStrength6m, [[-0.25, 25], [0, 52], [0.15, 72], [0.3, 85]]);

  // Sentiment (already 0–100; pass through with null-safety)
  const news = i.newsSentiment == null ? null : Math.max(0, Math.min(100, i.newsSentiment));
  const social = i.xSentiment == null ? null : Math.max(0, Math.min(100, i.xSentiment));

  // Insider: -1..1 → centered on 50, damped so routine selling stays near neutral.
  const insiderFlow = i.insiderFlow == null ? null
    : Math.max(0, Math.min(100, 50 + i.insiderFlow * 45));

  return [
    { key: "growth", label: "Growth", pillar: "fundamentals", weight: 0.25, score: growth, detail: `Revenue ${fpct(i.revenueYoY)} YoY, EPS ${fpct(i.epsYoY)}` },
    { key: "profitability", label: "Profitability", pillar: "fundamentals", weight: 0.20, score: profitability, detail: `Net margin ${pct(i.netMargin)}, op margin ${pct(i.operatingMargin)}` },
    { key: "returns", label: "Returns on capital", pillar: "fundamentals", weight: 0.25, score: returns, detail: `ROE ${pct(i.roe)}, ROIC ${pct(i.roic)}` },
    { key: "health", label: "Balance sheet", pillar: "fundamentals", weight: 0.15, score: health, detail: `Debt/equity ${i.debtToEquity?.toFixed(2) ?? "n/a"}, current ratio ${i.currentRatio?.toFixed(2) ?? "n/a"}` },
    { key: "cashflow", label: "Cash-flow quality", pillar: "fundamentals", weight: 0.15, score: cashflow, detail: `FCF conversion ${i.fcfConversion?.toFixed(2) ?? "n/a"}×` },
    { key: "relativeVal", label: "Relative valuation", pillar: "valuation", weight: 0.55, score: relativeVal, detail: `P/E ${i.peTTM?.toFixed(1) ?? "n/a"} vs peers ${i.peerPe?.toFixed(1) ?? "n/a"}` },
    { key: "absoluteVal", label: "Absolute (DCF)", pillar: "valuation", weight: 0.45, score: absoluteVal, detail: upside == null ? "No DCF" : `${fpct(upside)} vs DCF fair value` },
    { key: "rating", label: "Analyst rating", pillar: "analyst", weight: 0.40, score: rating, detail: i.ratingSkew == null ? "No consensus data" : `Consensus skew ${i.ratingSkew.toFixed(2)}` },
    { key: "revisions", label: "Estimate revisions", pillar: "analyst", weight: 0.40, score: revisions, detail: i.estimateRevisionPct == null ? "Feed pending" : `Fwd estimates ${fpct(i.estimateRevisionPct)}` },
    { key: "surprise", label: "Earnings surprise", pillar: "analyst", weight: 0.20, score: surprise, detail: i.earningsSurprisePct == null ? "No history" : `Avg surprise ${fpct(i.earningsSurprisePct)}` },
    { key: "trend", label: "Price trend", pillar: "momentum", weight: 0.55, score: trend, detail: `vs 200-day ${fpct(i.trendVs200)}, 3-mo ${fpct(i.ret3m)}` },
    { key: "relStrength", label: "Relative strength", pillar: "momentum", weight: 0.45, score: relStrength, detail: i.relStrength6m == null ? "n/a" : `${fpct(i.relStrength6m)} vs market (6-mo)` },
    { key: "news", label: "News", pillar: "sentiment", weight: 0.50, score: news, detail: news == null ? "No headlines" : `News read ${news.toFixed(0)}/100` },
    { key: "social", label: "X / social", pillar: "sentiment", weight: 0.50, score: social, detail: social == null ? "No social data" : `Social read ${social.toFixed(0)}/100` },
    { key: "insiderFlow", label: "Insider flow", pillar: "insider", weight: 1.0, score: insiderFlow, detail: i.insiderFlow == null ? "No recent trades" : `Net flow ${i.insiderFlow.toFixed(2)}` },
  ];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/finavaScore.test.ts`
Expected: PASS (all cases incl. the GOOGL-shaped overvaluation case).

- [ ] **Step 5: Commit**

```bash
git add src/lib/finavaScore.ts src/lib/finavaScore.test.ts
git commit -m "feat(finava): add 15 calibrated factor curves + ScoreInputs"
```

## Task 1.3: Pillar blend + overall score with exclude-and-reweight

**Files:**
- Modify: `src/lib/finavaScore.ts`
- Test: `src/lib/finavaScore.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { computeFinavaScore, PILLAR_WEIGHTS } from "@/lib/finavaScore";

describe("computeFinavaScore", () => {
  it("pillar weights sum to 100", () => {
    const sum = Object.values(PILLAR_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 6);
  });

  it("excludes a dark pillar and reweights the rest (analyst missing)", () => {
    // Two synthetic factor sets: one with analyst present, one with analyst dark.
    const withAnalyst = computeFinavaScore({
      ...EMPTY, netMargin: 25, roe: 22, revenueYoY: 0.12,
      price: 100, dcfFair: 120, peTTM: 18, peerPe: 20,
      ratingSkew: 0.6, earningsSurprisePct: 0.04,
      trendVs200: 0.1, ret3m: 0.08, relStrength6m: 0.05,
      newsSentiment: 62, xSentiment: 58, insiderFlow: 0.0,
    });
    const noAnalyst = computeFinavaScore({
      ...EMPTY, netMargin: 25, roe: 22, revenueYoY: 0.12,
      price: 100, dcfFair: 120, peTTM: 18, peerPe: 20,
      ratingSkew: null, earningsSurprisePct: null,
      trendVs200: 0.1, ret3m: 0.08, relStrength6m: 0.05,
      newsSentiment: 62, xSentiment: 58, insiderFlow: 0.0,
    });
    const analystPillar = noAnalyst.pillars.find((p) => p.key === "analyst")!;
    expect(analystPillar.score).toBeNull();         // pillar dropped
    expect(noAnalyst.score).toBeGreaterThan(0);     // still produces a score
    expect(noAnalyst.score).toBeLessThanOrEqual(100);
    // dropping a present pillar should not crash and should renormalize
    expect(Number.isFinite(withAnalyst.score)).toBe(true);
  });

  it("confidence drops when coverage is poor", () => {
    const thin = computeFinavaScore({ ...EMPTY, netMargin: 25 }); // 1 factor only
    expect(thin.confidence).toBe("Low");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/finavaScore.test.ts`
Expected: FAIL — `computeFinavaScore`/`PILLAR_WEIGHTS` missing.

- [ ] **Step 3: Implement the blend + confidence**

Append to `src/lib/finavaScore.ts`:

```ts
export const PILLAR_WEIGHTS: Record<PillarKey, number> = {
  fundamentals: 28,
  valuation: 22,
  analyst: 18,
  momentum: 12.5,
  sentiment: 12.5,
  insider: 7,
};

const PILLAR_LABELS: Record<PillarKey, string> = {
  fundamentals: "Fundamentals",
  valuation: "Valuation",
  analyst: "Analyst",
  momentum: "Momentum",
  sentiment: "Sentiment",
  insider: "Insider Flow",
};

export interface PillarScore {
  key: PillarKey;
  label: string;
  weight: number;       // nominal pillar weight
  score: number | null; // weighted mean of present factors, null if none present
  factors: FactorScore[];
}

export interface FinavaScoreResult {
  score: number;        // 0–100 overall (deterministic)
  pillars: PillarScore[];
  confidence: "Low" | "Moderate" | "High";
  coverage: number;     // fraction of the 15 factors with data
}

/** Weighted mean of present factor scores, weights renormalized over present factors. */
function blendFactors(factors: FactorScore[]): number | null {
  let acc = 0, wsum = 0;
  for (const f of factors) {
    if (f.score != null) { acc += f.score * f.weight; wsum += f.weight; }
  }
  return wsum > 0 ? acc / wsum : null;
}

export function computeFinavaScore(inputs: ScoreInputs): FinavaScoreResult {
  const all = scoreFactors(inputs);
  const pillarKeys = Object.keys(PILLAR_WEIGHTS) as PillarKey[];

  const pillars: PillarScore[] = pillarKeys.map((key) => {
    const factors = all.filter((f) => f.pillar === key);
    return {
      key, label: PILLAR_LABELS[key], weight: PILLAR_WEIGHTS[key],
      score: blendFactors(factors), factors,
    };
  });

  // Overall: weighted mean over PRESENT pillars (reweight across survivors).
  let acc = 0, wsum = 0;
  for (const p of pillars) {
    if (p.score != null) { acc += p.score * p.weight; wsum += p.weight; }
  }
  const score = wsum > 0 ? Math.round(acc / wsum) : 50;

  // Coverage: present factors / total factors.
  const present = all.filter((f) => f.score != null);
  const coverage = present.length / all.length;

  // Agreement: low spread across present pillar scores = corroboration.
  const ps = pillars.map((p) => p.score).filter((s): s is number => s != null);
  const mean = ps.reduce((a, b) => a + b, 0) / (ps.length || 1);
  const variance = ps.reduce((a, b) => a + (b - mean) ** 2, 0) / (ps.length || 1);
  const stdev = Math.sqrt(variance);

  // Volatility penalty: very high beta/vol erodes confidence (not the score).
  const volPenalty = (inputs.annualizedVol ?? 0) > 0.6 || (inputs.beta ?? 0) > 2 ? 1 : 0;

  let confidence: FinavaScoreResult["confidence"];
  if (coverage >= 0.75 && stdev < 18 && !volPenalty) confidence = "High";
  else if (coverage < 0.5 || stdev > 28) confidence = "Low";
  else confidence = "Moderate";

  return { score, pillars, confidence, coverage };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/finavaScore.test.ts`
Expected: PASS (all suites).

- [ ] **Step 5: Commit**

```bash
git add src/lib/finavaScore.ts src/lib/finavaScore.test.ts
git commit -m "feat(finava): blend factors into pillars and overall score with exclude-and-reweight + confidence"
```

## Task 1.4: `finavaInputs.ts` — assemble `ScoreInputs` from the data libs

**Files:**
- Create: `src/lib/finavaInputs.ts`
- Modify: `src/lib/finnhub.ts` (add `getPeerMetrics`)
- Test: `src/lib/finavaInputs.test.ts`

- [ ] **Step 1: Add `getPeerMetrics` to `finnhub.ts`**

Append to `src/lib/finnhub.ts`:

```ts
// Median peer P/E and P/S for relative valuation. Fetches /peers then each peer's
// metric (capped concurrency, 6h cache). Returns nulls when peers are unavailable.
export async function getPeerMetrics(
  ticker: string
): Promise<{ peerPe: number | null; peerPs: number | null }> {
  let peers: string[] = [];
  try {
    const raw = await getPeers(ticker);
    peers = (Array.isArray(raw) ? raw : []).filter((p) => p && p !== ticker).slice(0, 8);
  } catch {
    return { peerPe: null, peerPs: null };
  }
  if (peers.length === 0) return { peerPe: null, peerPs: null };

  const metrics = await Promise.all(
    peers.map(async (p) => {
      try {
        const d = (await getBasicFinancials(p)) as { metric?: Record<string, number> };
        return { pe: d.metric?.peTTM ?? null, ps: d.metric?.psTTM ?? null };
      } catch {
        return { pe: null, ps: null };
      }
    })
  );
  const median = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null && x > 0).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : null;
  };
  return { peerPe: median(metrics.map((m) => m.pe)), peerPs: median(metrics.map((m) => m.ps)) };
}
```

- [ ] **Step 2: Write the failing test for the pure extractor**

Create `src/lib/finavaInputs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { metricsToFundamentalInputs, surpriseAvg, computeRelStrength } from "@/lib/finavaInputs";

describe("metricsToFundamentalInputs", () => {
  it("maps Finnhub metric fields to the right ScoreInputs shape", () => {
    const m = {
      roeTTM: 146.69, roaTTM: 34.02, roicTTM: undefined,
      grossMarginTTM: 47.86, operatingMarginTTM: 32.64, netProfitMarginTTM: 27.15,
      "totalDebt/totalEquityQuarterly": 0.7955, currentRatioQuarterly: 1.0704,
      revenueGrowthTTMYoy: 12.76, epsGrowthTTMYoy: 29.01,
      peTTM: 35.55, psTTM: 9.65, beta: 1.2,
    };
    const out = metricsToFundamentalInputs(m);
    expect(out.roe).toBeCloseTo(146.69);
    expect(out.roic).toBeNull();               // missing field → null
    expect(out.revenueYoY).toBeCloseTo(0.1276); // percent → fraction
    expect(out.debtToEquity).toBeCloseTo(0.7955);
    expect(out.peTTM).toBeCloseTo(35.55);
  });
});

describe("surpriseAvg", () => {
  it("averages percent surprise across the recent earnings list", () => {
    // Finnhub /stock/earnings: [{actual, estimate}, ...]
    const rows = [
      { actual: 1.1, estimate: 1.0 },  // +10%
      { actual: 0.9, estimate: 1.0 },  // -10%
    ];
    expect(surpriseAvg(rows)).toBeCloseTo(0, 5);
  });
  it("returns null on empty/garbage", () => {
    expect(surpriseAvg([])).toBeNull();
    expect(surpriseAvg(null)).toBeNull();
  });
});

describe("computeRelStrength", () => {
  it("is positive when the stock outran the benchmark over the window", () => {
    const stock = Array.from({ length: 130 }, (_, k) => 100 + k);     // +~1.3x
    const bench = Array.from({ length: 130 }, (_, k) => 100 + k * 0.5);
    const rs = computeRelStrength(stock, bench);
    expect(rs!).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/lib/finavaInputs.test.ts`
Expected: FAIL — module/exports missing.

- [ ] **Step 4: Implement `finavaInputs.ts`**

Create `src/lib/finavaInputs.ts`:

```ts
// Assembles ScoreInputs for the deterministic Finava Score from the data libs.
// Pure extractor helpers (metricsToFundamentalInputs, surpriseAvg, computeRelStrength)
// are unit-tested; assembleScoreInputs() does the I/O and is exercised via the route.

import type { ScoreInputs } from "@/lib/finavaScore";
import { getBasicFinancials, getEarnings, getPeerMetrics, getRecommendationTrends, getCandles } from "@/lib/finnhub";
import { getCikByTicker, getCompanyFacts, extractFinancialMetrics, extractFundamentalTimeSeries } from "@/lib/edgar";
import { suggestedWaccFromBeta, defaultFairValue, type DcfInputs } from "@/lib/dcf";
import { getGrokSentiment } from "@/lib/sentiment/grok";
import { insiderNetFlow } from "@/lib/stockData";

type Metric = Record<string, number | undefined>;
const n = (v: number | undefined | null) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Map Finnhub `metric=all` → the fundamentals/valuation slice of ScoreInputs. */
export function metricsToFundamentalInputs(m: Metric): Partial<ScoreInputs> {
  const frac = (v: number | undefined) => (typeof v === "number" ? v / 100 : null);
  return {
    grossMargin: n(m.grossMarginTTM),
    operatingMargin: n(m.operatingMarginTTM),
    netMargin: n(m.netProfitMarginTTM),
    roe: n(m.roeTTM),
    roa: n(m.roaTTM),
    roic: n(m.roicTTM ?? undefined),
    debtToEquity: n(m["totalDebt/totalEquityQuarterly"]),
    currentRatio: n(m.currentRatioQuarterly),
    revenueYoY: frac(m.revenueGrowthTTMYoy),
    epsYoY: frac(m.epsGrowthTTMYoy),
    peTTM: n(m.peTTM),
    psTTM: n(m.psTTM),
    beta: n(m.beta),
  };
}

/** Average percent earnings surprise over the recent list. null when unusable. */
export function surpriseAvg(rows: Array<{ actual?: number; estimate?: number }> | null): number | null {
  if (!rows || rows.length === 0) return null;
  const s = rows
    .map((r) => (r.estimate && r.estimate !== 0 ? (r.actual! - r.estimate) / Math.abs(r.estimate) : null))
    .filter((x): x is number => x != null);
  return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
}

/** Rating skew normalized to [-1, 1] from Finnhub recommendation trends. */
export function ratingSkew(rec: unknown): number | null {
  if (!Array.isArray(rec) || rec.length === 0) return null;
  const r = rec[0] as Record<string, number>;
  const sb = r.strongBuy ?? 0, b = r.buy ?? 0, h = r.hold ?? 0, s = r.sell ?? 0, ss = r.strongSell ?? 0;
  const total = sb + b + h + s + ss;
  return total > 0 ? (2 * sb + b - s - 2 * ss) / (2 * total) : null;
}

/** 6-month relative strength: stock window-return minus benchmark window-return. */
export function computeRelStrength(stockCloses: number[], benchCloses: number[]): number | null {
  const ret = (c: number[]) => {
    const v = c.filter((x) => x > 0);
    if (v.length < 2) return null;
    return v[v.length - 1] / v[0] - 1;
  };
  const a = ret(stockCloses), b = ret(benchCloses);
  return a != null && b != null ? a - b : null;
}

/** Full assembly. Failure-isolated per source; missing fields stay null (excluded). */
export async function assembleScoreInputs(
  symbol: string,
  price: number | null,
  insiderTrades: Array<{ shares: number }> | null
): Promise<ScoreInputs> {
  const base: ScoreInputs = {
    revenueYoY: null, epsYoY: null, revenueCagr3y: null,
    grossMargin: null, operatingMargin: null, netMargin: null,
    roe: null, roa: null, roic: null,
    debtToEquity: null, currentRatio: null, fcfConversion: null,
    price, dcfFair: null, peTTM: null, peerPe: null, psTTM: null, peerPs: null,
    ratingSkew: null, targetUpsidePct: null, estimateRevisionPct: null, earningsSurprisePct: null,
    trendVs200: null, ret3m: null, relStrength6m: null,
    newsSentiment: null, xSentiment: null, insiderFlow: null,
    beta: null, annualizedVol: null,
  };

  const day = 86_400, now = Math.floor(Date.now() / 1000);
  const [metricRaw, earningsRaw, recRaw, peerRaw, grok, stockC, benchC, dcf] = await Promise.all([
    getBasicFinancials(symbol).catch(() => null),
    getEarnings(symbol).catch(() => null),
    getRecommendationTrends(symbol).catch(() => null),
    getPeerMetrics(symbol).catch(() => ({ peerPe: null, peerPs: null })),
    getGrokSentiment(symbol).catch(() => null),
    getCandles(symbol, "D", now - 200 * day, now).catch(() => null),
    getCandles("SPY", "D", now - 200 * day, now).catch(() => null),
    computeDcfFair(symbol, price).catch(() => null),
  ]);

  const m = (metricRaw as { metric?: Metric } | null)?.metric ?? {};
  Object.assign(base, metricsToFundamentalInputs(m));
  base.peerPe = peerRaw.peerPe;
  base.peerPs = peerRaw.peerPs;
  base.earningsSurprisePct = surpriseAvg(earningsRaw as Array<{ actual?: number; estimate?: number }> | null);
  base.ratingSkew = ratingSkew(recRaw);
  base.dcfFair = dcf;
  base.insiderFlow = insiderNetFlow(insiderTrades, n(m.sharesOutstanding) ? m.sharesOutstanding! * 1e6 : null);

  // News + X sentiment from Grok engine (already 0–100). Shape per GrokSentiment.
  if (grok) {
    base.xSentiment = n((grok as { score?: number }).score);
    base.newsSentiment = n((grok as { newsScore?: number }).newsScore) ?? base.xSentiment;
  }

  // Momentum from candle closes.
  const closes = (stockC as { c?: number[] } | null)?.c ?? [];
  if (closes.length >= 200) {
    const last = closes[closes.length - 1];
    const ma200 = closes.slice(-200).reduce((a, b) => a + b, 0) / 200;
    base.trendVs200 = ma200 > 0 ? last / ma200 - 1 : null;
    const p63 = closes[closes.length - 64];
    base.ret3m = p63 && p63 > 0 ? last / p63 - 1 : null;
  }
  const benchCloses = (benchC as { c?: number[] } | null)?.c ?? [];
  if (closes.length >= 126 && benchCloses.length >= 126) {
    base.relStrength6m = computeRelStrength(closes.slice(-126), benchCloses.slice(-126));
  }

  return base;
}

/** DCF fair value via the existing dcf lib + EDGAR facts. */
async function computeDcfFair(symbol: string, price: number | null): Promise<number | null> {
  const cik = await getCikByTicker(symbol);
  if (!cik) return null;
  const facts = await getCompanyFacts(cik);
  const mm = extractFinancialMetrics(facts);
  const series = extractFundamentalTimeSeries(facts, 6);
  const ocf = typeof mm.operatingCashFlow === "number" ? mm.operatingCashFlow : null;
  const capex = typeof mm.capex === "number" ? mm.capex : null;
  const rev = series.revenue;
  const cagr = rev.length >= 2 && rev[0].value > 0 && rev.at(-1)!.value > 0
    ? Math.pow(rev.at(-1)!.value / rev[0].value, 1 / (rev.length - 1)) - 1 : null;
  const inputs: DcfInputs = {
    baseFcf: ocf != null ? (capex != null ? ocf - capex : ocf) : null,
    fcfIsProxy: capex == null,
    sharesOutstanding: typeof mm.sharesOutstanding === "number" ? mm.sharesOutstanding : null,
    netDebt: (typeof mm.totalDebt === "number" ? mm.totalDebt : 0) - (typeof mm.cash === "number" ? mm.cash : 0),
    historicalGrowth: cagr,
    suggestedWacc: suggestedWaccFromBeta(typeof (facts as { beta?: number }).beta === "number" ? (facts as { beta?: number }).beta! : null),
    currentPrice: price,
    currency: "USD",
  };
  return defaultFairValue(inputs);
}
```

> **Note for executor:** verify the exact `GrokSentiment` field names by reading `src/lib/sentiment/grok.ts:40` and adjust the `grok.score`/`grok.newsScore` access in `assembleScoreInputs` to match. If the engine exposes a single 0–100 read, set both `xSentiment` and `newsSentiment` from it and leave the per-source split for a later task.

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/lib/finavaInputs.test.ts`
Expected: PASS (the three pure-helper suites).

- [ ] **Step 6: Commit**

```bash
git add src/lib/finnhub.ts src/lib/finavaInputs.ts src/lib/finavaInputs.test.ts
git commit -m "feat(finava): assemble ScoreInputs from EDGAR/Finnhub/candles/Grok/insider"
```

## Task 1.5: Extend `finava.ts` types for the factor breakdown

**Files:**
- Modify: `src/lib/finava.ts`

- [ ] **Step 1: Add `valuation` to `SignalKey` and a factor breakdown to the signal**

In `src/lib/finava.ts`:

- Change `SignalKey` (line 5) to include `valuation`:

```ts
export type SignalKey = "fundamentals" | "valuation" | "momentum" | "sentiment" | "analyst" | "insider";
```

- Add a factor row type and extend `FinavaSignal`:

```ts
export interface FinavaFactor {
  key: string;
  label: string;
  score: number | null; // null = excluded (no data)
  detail: string;
}
```

Append `factors?: FinavaFactor[];` to the `FinavaSignal` interface.

- Add the label + order entries:

```ts
export const SIGNAL_LABELS: Record<SignalKey, string> = {
  fundamentals: "Fundamentals",
  valuation: "Valuation",
  momentum: "Momentum",
  sentiment: "Sentiment",
  analyst: "Analyst",
  insider: "Insider Flow",
};

export const SIGNAL_ORDER: SignalKey[] = [
  "fundamentals", "valuation", "analyst", "momentum", "sentiment", "insider",
];
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors ONLY where `SignalKey`/`SIGNAL_LABELS` are now exhaustively switched (route + UI). These are fixed in 1.6 and 1.7. Note the failing files.

- [ ] **Step 3: Commit**

```bash
git add src/lib/finava.ts
git commit -m "feat(finava): add valuation pillar + factor breakdown to signal types"
```

## Task 1.6: Rewire the route to the deterministic engine (LLM only for the take)

**Files:**
- Modify: `src/app/api/stock/[ticker]/finava-analysis/route.ts`

- [ ] **Step 1: Replace the five signal agents + synthesis-score with the deterministic engine**

Rewrite the route body so that, after `getStockBundle`:

```ts
import { assembleScoreInputs } from "@/lib/finavaInputs";
import { computeFinavaScore, type PillarScore } from "@/lib/finavaScore";
// ...
const inputs = await assembleScoreInputs(symbol, price, bundle.insider);
const result = computeFinavaScore(inputs);
```

Map each `PillarScore` → a `FinavaSignal` and stream it (preserve the progressive SSE UX by sending pillars as they're ready; since the compute is synchronous after `assembleScoreInputs`, send them in `SIGNAL_ORDER`):

```ts
function pillarToSignal(p: PillarScore): FinavaSignal {
  const score = p.score == null ? 50 : Math.round(p.score);
  const present = p.factors.filter((f) => f.score != null);
  const headline = p.score == null ? "No data" : topFactorHeadline(p);
  return {
    key: p.key as SignalKey,
    label: p.label,
    score,
    stance: stanceFromScore(score),
    headline,
    detail: present.map((f) => f.detail).slice(0, 2).join(" · ") || "Insufficient data",
    factors: p.factors.map((f) => ({ key: f.key, label: f.label, score: f.score, detail: f.detail })),
  };
}
```

(Implement `topFactorHeadline` as a small helper that names the highest-|score−50| present factor, e.g. `"Strong returns on capital"`.)

The overall `score`, `confidence`, and `comparison` come straight from `result` + the DCF/street values; **only** the `take`, `catalysts`, `risks` are produced by the LLM, given the *already-decided* numbers:

```ts
const synthPrompt = `You are Finava's lead analyst. The deterministic Finava Score for ${name} (${symbol}) is ${result.score}/100 (${verdictLabel(result.score)}), confidence ${result.confidence}.
Pillar scores: ${result.pillars.map((p) => `${p.label} ${p.score == null ? "n/a" : Math.round(p.score)}`).join(", ")}.
Price $${fmt(price, 2)}; DCF fair value ${dcfFair != null ? `$${fmt(dcfFair, 2)}` : "n/a"}; Street target ${street != null ? `$${fmt(street, 2)}` : "n/a"}.
Write ONLY this JSON, explaining the score we already computed (do NOT invent a different score):
{"take":"<2-3 sentences, specific to these pillar scores>","catalysts":["..."],"risks":["..."]}`;
```

Build the `FinavaVerdict` from `result.score`, `result.confidence`, a blended fair value (`finavaFairValue(result, dcfFair, street, price)` — see Task 1.8), and the LLM `take`/`catalysts`/`risks`. Keep the `error` event fallback for LLM failure but **still emit the verdict with the deterministic score** and a templated take, so a narrative failure never blanks the score.

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/app/api/stock/[ticker]/finava-analysis/route.ts`
Expected: PASS.

- [ ] **Step 3: Manual smoke via preview**

Start dev server; open GOOGL's Finava tab. Confirm: 6 bars including Valuation; Analyst now shows a real rating-based score (not "No analyst data"); Insider no longer 10 for routine selling; overall score is stable across two reloads (deterministic).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/stock/[ticker]/finava-analysis/route.ts
git commit -m "feat(finava): compute score deterministically; LLM now only writes the narrative"
```

## Task 1.7: UI — Valuation bar + factor breakdown on expand

**Files:**
- Modify: `src/components/stock/FinavaTab.tsx`

- [ ] **Step 1: Render the new valuation bar**

`FinavaTab` already maps over `SIGNAL_ORDER`/signals; adding `valuation` to `SIGNAL_ORDER` (Task 1.5) makes the bar appear automatically. Verify the bar renders and that an N/A pillar (score from a dark pillar) shows a muted "N/A" treatment instead of a misleading 50 — read the current bar component and add: if the signal's `factors` are all `score == null`, render the label with a dimmed "No data" pill and no colored bar.

- [ ] **Step 2: Add an expandable factor breakdown**

Under each signal row, when expanded (reuse any existing disclosure pattern, else a simple `useState` toggle on the row), list `signal.factors`: label, a thin sub-bar for `score` (or "—" when null), and `detail`. Keep it subtle per the motion preference (no flashy animation; a quiet height/opacity transition).

- [ ] **Step 3: Verify via preview**

Reload GOOGL; expand Fundamentals → see Growth/Profitability/Returns/Health/Cash-flow with their numbers; expand Analyst → Rating present, Estimate revisions shows "Feed pending", Surprise present. Screenshot for Liam.

- [ ] **Step 4: Commit**

```bash
git add src/components/stock/FinavaTab.tsx
git commit -m "feat(finava): show Valuation bar and per-pillar factor breakdown"
```

## Task 1.8: Blended fair value (defined rule, not an LLM guess)

**Files:**
- Modify: `src/lib/finavaScore.ts` (add `blendFairValue`)
- Test: `src/lib/finavaScore.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
import { blendFairValue } from "@/lib/finavaScore";

describe("blendFairValue", () => {
  it("weights DCF and Street when both present", () => {
    expect(blendFairValue({ dcf: 140, street: 200 })).toBeCloseTo(140 * 0.5 + 200 * 0.5, 5);
  });
  it("falls back to whichever is present", () => {
    expect(blendFairValue({ dcf: 140, street: null })).toBe(140);
    expect(blendFairValue({ dcf: null, street: 200 })).toBe(200);
  });
  it("returns null when neither is present", () => {
    expect(blendFairValue({ dcf: null, street: null })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/finavaScore.test.ts`
Expected: FAIL — `blendFairValue` missing.

- [ ] **Step 3: Implement**

```ts
/** Defined fair-value blend: equal-weight DCF and Street when both exist, else the
 *  one present. Deliberately simple and transparent — no LLM guess. (Phase 2 can add
 *  an analyst-target weight once that feed lands.) */
export function blendFairValue(v: { dcf: number | null; street: number | null }): number | null {
  const parts = [v.dcf, v.street].filter((x): x is number => x != null && x > 0);
  if (parts.length === 0) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}
```

Wire it into the route's verdict (`fairValue = blendFairValue({ dcf: dcfFair, street })`).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/finavaScore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/finavaScore.ts src/lib/finavaScore.test.ts src/app/api/stock/[ticker]/finava-analysis/route.ts
git commit -m "feat(finava): blend fair value by a defined rule instead of an LLM guess"
```

## Task 1.9: Full-suite green + lint + build

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: PASS (new finavaScore, finavaInputs, stockData suites + existing suites).

- [ ] **Step 2: Lint + typecheck + build**

Run: `npx tsc --noEmit && npx eslint . && npm run build`
Expected: PASS. (Build matters — AGENTS.md notes this Next.js is non-standard; if the build complains, read the relevant guide in `node_modules/next/dist/docs/` before changing config.)

- [ ] **Step 3: Commit any fixups**

```bash
git add -A && git commit -m "chore(finava): green suite, lint, and build for the deterministic score"
```

---

# PHASE 2 — Paid feed for the two premium Analyst factors

Gated on Liam picking a provider (FMP vs Finnhub upgrade — currently "decide later"). Until then the Analyst pillar self-reweights to rating/surprise and `revisions` shows "Feed pending".

## Task 2.1: Provider client + `targetUpsidePct` and `estimateRevisionPct`

**Files:**
- Create: `src/lib/<provider>.ts` (e.g. `src/lib/fmp.ts`)
- Modify: `src/lib/finavaInputs.ts` (populate `targetUpsidePct`, `estimateRevisionPct`)
- Modify: `src/lib/finavaScore.ts` (add the `targetUpside` factor weight into the Analyst pillar; rebalance rating/revisions/surprise/upside)

- [ ] **Step 1:** Add the env key to `.env.local` and `.env.example`; add a typed client with the two endpoints (price target, analyst estimates incl. revision history).
- [ ] **Step 2:** Write failing tests for the pure response→fraction mappers (mirror `surpriseAvg`'s test style).
- [ ] **Step 3:** Implement the mappers; populate the two fields in `assembleScoreInputs`.
- [ ] **Step 4:** Decide the final Analyst in-pillar split once `upside` is real (proposed: rating 0.30 / revisions 0.30 / upside 0.25 / surprise 0.15) and update `scoreFactors`; update the test in 1.2.
- [ ] **Step 5:** Full suite green; commit.

---

## Self-review checklist (completed by plan author)

- **Spec coverage:** deterministic score ✅ (1.3); 6 pillars/15 factors ✅ (1.2); exclude-and-reweight ✅ (1.3); valuation as explicit bar ✅ (1.5/1.7); the four new factor groups — estimate revisions (Phase 2), returns on capital ✅, relative valuation ✅, earnings surprise ✅ + X sentiment ✅; risk → confidence only ✅ (1.3); Sentiment 12.5 / pillar weights ✅ (1.3); analyst-gap bug ✅ (0.1); insider false-negative ✅ (0.2); upside label bug ✅ (0.3); narrative-only LLM ✅ (1.6); blended fair value rule ✅ (1.8).
- **Placeholder scan:** Phase-2 tasks are intentionally lighter (provider undecided) but each names files and a concrete deliverable; no `TODO`/`handle edge cases` in Phase 0/1 code steps.
- **Type consistency:** `ScoreInputs` fields are referenced identically across `scoreFactors`, `computeFinavaScore`, `assembleScoreInputs`, and tests; `PillarKey`/`SignalKey` aligned (`finava.ts` adds `valuation`); `insiderNetFlow` signature matches its call site in `assembleScoreInputs`.

## Open item to confirm with Liam during execution
- The **absolute-curve vs sector-relative** decision at the top. Default in this plan: absolute curves. The curve anchors in 1.2 are first-pass calibrations — expect to tune them against 8–10 real tickers (e.g. GOOGL, KO, a SaaS name, a bank) once the engine streams, and adjust the `interp` anchors. This tuning is cheap (pure functions, fast tests) and is where the score earns its credibility.
