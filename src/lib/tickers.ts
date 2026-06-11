/**
 * Ticker symbol validation shared by API routes.
 *
 * Letters first, then letters/digits/dot/dash (BRK.B, BF-B, RDS.A). Keeps junk
 * out of Firestore docs and the agent cache, where an invalid symbol would
 * otherwise be stored and re-fetched forever.
 */
export const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

export function isValidTicker(symbol: string): boolean {
  return TICKER_RE.test(symbol);
}

/** Max tickers accepted by batch quote endpoints in a single request. */
export const MAX_BATCH_TICKERS = 50;

/**
 * Parse a comma-separated `tickers` query param into validated upper-case
 * symbols. Invalid symbols are dropped rather than rejected so one bad entry
 * in a watchlist doesn't take down the whole quote refresh.
 */
export function parseTickersParam(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t && isValidTicker(t));
}
