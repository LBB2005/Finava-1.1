// Data-integrity guards for market quotes.
//
// The upstream feed occasionally returns a wrong-but-internally-consistent quote
// (e.g. NFLX at ~$67 while its real price is ~10x higher) or a quote that simply
// hasn't updated in days. Neither is caught by the existing "price > 0" check in
// getQuote, so bad numbers reach the leaderboard, screens, portfolio and — worst
// of all — the AI narratives that reason on top of them.
//
// These are pure detectors: they never mutate or suppress a value, they only
// return a warning the UI can surface as a caution marker next to the number.
// `now` and thresholds are parameters so the logic is deterministic under test.

export interface QuoteWarning {
  code: "stale" | "price-marketcap-mismatch";
  /** Human-readable explanation, suitable for a tooltip. */
  detail: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How old a quote may be before we flag it. Generous on purpose: quotes legitimately
 * go untouched over weekends and holidays (a Friday close viewed on Monday is fine),
 * so only a multi-day gap — like the 10-day-stale MU quote — should raise a flag.
 */
export const STALE_MAX_AGE_MS = 4 * DAY_MS;

/**
 * Max allowed divergence between the price-implied market cap (price x shares) and
 * the separately-reported market cap. They come from different feeds, so a small
 * drift (stale share counts, buybacks) is expected; an order-of-magnitude gap means
 * one of the two is wrong.
 */
export const MARKETCAP_MAX_RATIO = 4;

/** Flag a quote whose timestamp is older than `maxAgeMs`. */
export function assessFreshness(
  asOf: string | null | undefined,
  nowMs: number,
  maxAgeMs: number = STALE_MAX_AGE_MS,
): QuoteWarning | null {
  if (!asOf) return null;
  const t = Date.parse(asOf);
  if (!Number.isFinite(t)) return null;

  const ageMs = nowMs - t;
  if (ageMs <= maxAgeMs) return null; // fresh, or a future timestamp (clock skew)

  const days = Math.floor(ageMs / DAY_MS);
  const age = days >= 1 ? `${days} day${days === 1 ? "" : "s"}` : "several hours";
  return { code: "stale", detail: `Price last updated ${age} ago — may be out of date.` };
}

/**
 * Flag a quote whose price is inconsistent with its reported market cap, using
 * shares outstanding as the bridge (marketCap == price x shares by definition).
 * Returns null whenever it can't assess (any input missing or non-positive).
 */
export function assessMarketCapConsistency(
  price: number | null | undefined,
  marketCap: number | null | undefined,
  sharesOutstanding: number | null | undefined,
  maxRatio: number = MARKETCAP_MAX_RATIO,
): QuoteWarning | null {
  if (!price || !marketCap || !sharesOutstanding) return null;
  if (price <= 0 || marketCap <= 0 || sharesOutstanding <= 0) return null;

  const impliedCap = price * sharesOutstanding;
  const ratio = Math.max(impliedCap / marketCap, marketCap / impliedCap);
  if (ratio <= maxRatio) return null;

  return {
    code: "price-marketcap-mismatch",
    detail: "Price looks inconsistent with this company's market cap — the quote may be wrong.",
  };
}
