/**
 * Shared fetch-with-retry for the market-data clients (Finnhub, Polygon, EDGAR).
 *
 * The raw fetchers used to do a single fetch with a 10s timeout and no retry, so a
 * transient rate-limit (429) or 5xx during a cold ~500-name factor compute would
 * throw immediately — and downstream `catch → null` blocks then rendered that
 * transport blip identically to a genuinely dataless ticker. This adds bounded
 * exponential backoff (with jitter) on the transient failure classes only, giving a
 * blip a few more shots before it becomes an error the caller has to interpret.
 *
 * Retried (all transient): HTTP 429, any 5xx, network errors (undici throws
 * `TypeError`), and timeouts (`AbortSignal.timeout` rejects with an
 * AbortError/TimeoutError). NOT retried: 2xx/3xx (returned as-is) and authoritative
 * non-429 4xx like 403 (premium-gated) or 404 (unknown symbol) — those are real
 * answers, not blips, so retrying only burns the rate-limit budget and slows the
 * fallback path (e.g. Finnhub 403 → Alpaca/Polygon candle fallback).
 */

/**
 * How a market-data source answered, threaded through the factor/DCF path so a
 * transport failure is never mistaken for a genuine absence of data:
 *
 *   ok          — data was retrieved.
 *   unavailable — the source responded, authoritatively, that it has no such data
 *                 (empty result set, no CIK, no analyst coverage). "No data exists."
 *   failed      — the source could not be reached (network / timeout / 429 / 5xx,
 *                 even after retries). We DON'T know whether data exists; this must
 *                 never surface as "no data exists".
 */
export type SourceStatus = "ok" | "unavailable" | "failed";

export interface RetryOptions {
  /** Total attempts including the first. Default 3 (→ up to 2 retries). */
  retries?: number;
  /** Base backoff in ms; grows ~2^n with jitter. Default 300. */
  baseDelayMs?: number;
  /** Per-attempt timeout applied via AbortSignal.timeout. Default 10_000. */
  timeoutMs?: number;
  /** Cap on any single backoff wait (and on a honoured Retry-After). Default 4_000. */
  maxDelayMs?: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Full-ish jittered exponential backoff: half fixed, half random, capped. */
function backoffMs(attempt: number, base: number, cap: number): number {
  const exp = Math.min(base * 2 ** (attempt - 1), cap);
  return exp / 2 + Math.random() * (exp / 2);
}

/** A thrown fetch error worth retrying: a network failure or a timeout/abort. */
function isRetryableError(err: unknown): boolean {
  // undici surfaces network failures as TypeError("fetch failed"); AbortSignal.timeout
  // rejects with a DOMException named "TimeoutError" (older runtimes: "AbortError").
  if (err instanceof TypeError) return true;
  const name = (err as { name?: string } | null)?.name;
  return name === "AbortError" || name === "TimeoutError";
}

/** Parse a Retry-After header (delta-seconds form only; HTTP-date form is ignored). */
function retryAfterMs(res: Response, cap: number): number | null {
  const header = res.headers.get("retry-after");
  if (!header) return null;
  const secs = Number(header);
  return Number.isFinite(secs) && secs >= 0 ? Math.min(secs * 1000, cap) : null;
}

/**
 * `fetch` with bounded retry/backoff. Owns the per-attempt timeout (a fresh
 * AbortSignal.timeout per try), so callers should NOT pass their own `signal`.
 * Returns the final Response (whatever its status) for the caller to inspect;
 * throws only when a retryable *error* persists past the last attempt — same
 * throw-shape callers already handle.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: RetryOptions = {},
): Promise<Response> {
  const { retries = 3, baseDelayMs = 300, timeoutMs = 10_000, maxDelayMs = 4_000 } = opts;
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const isLast = attempt === retries;
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if ((res.status === 429 || res.status >= 500) && !isLast) {
        await sleep(retryAfterMs(res, maxDelayMs) ?? backoffMs(attempt, baseDelayMs, maxDelayMs));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (!isRetryableError(err) || isLast) throw err;
      await sleep(backoffMs(attempt, baseDelayMs, maxDelayMs));
    }
  }
  // Unreachable: the loop always returns or throws on the last attempt.
  throw lastError;
}
