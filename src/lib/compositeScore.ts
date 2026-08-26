import { WEIGHTS, type HorizonKey, type Stock } from "@/lib/research";

/**
 * The one definition of the 0–100 "Finava score" shown in stock LISTS (portfolio
 * holdings, watchlist rows, rails).
 *
 * It is the medium-horizon weighted blend of the six real factor sub-scores that
 * `/api/research/factors` computes for the whole S&P 500 from live data — the same
 * number the Research board ranks by, so a name can't score 74 on one page and 61
 * on another.
 *
 * NOT the same thing as the per-stock Finava Score on the FINAVA tab: that one runs
 * 15 calibrated factors against a single ticker's filings (see `lib/finavaScore.ts`)
 * and is far too expensive to compute for every row of a table. This is the cheap
 * list-view read off the shared scored universe.
 *
 * A ticker outside the universe has no score — callers MUST render "—" rather than
 * substituting a neutral 50 or a generated number.
 */
export function compositeScore(stock: Stock, horizon: HorizonKey = "month"): number {
  const w = WEIGHTS[horizon];
  let s = 0;
  for (const k in w) {
    s += (w as Record<string, number>)[k] * (stock.f as Record<string, number>)[k];
  }
  return Math.round(s);
}

/** Composite score for a ticker, or null when the scored universe doesn't cover it. */
export function scoreForTicker(
  universe: Stock[] | null,
  ticker: string,
  horizon: HorizonKey = "month"
): number | null {
  const stock = universe?.find((s) => s.ticker === ticker.toUpperCase());
  return stock ? compositeScore(stock, horizon) : null;
}
