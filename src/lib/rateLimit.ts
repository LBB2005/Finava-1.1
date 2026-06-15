import { NextResponse } from "next/server";

/**
 * In-memory token-bucket rate limiter for API routes.
 *
 * Per-instance only: under serverless each warm instance keeps its own buckets,
 * so the effective ceiling is (limit × instances). That's fine — this is a
 * cost-protection backstop against runaway clients hammering paid market-data
 * APIs (Finnhub/Polygon charge per call), not a hard security boundary.
 */

type Bucket = { tokens: number; last: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export type RateLimitOptions = {
  /** Burst capacity (max tokens in the bucket). */
  capacity: number;
  /** Sustained refill rate, tokens per second. */
  refillPerSec: number;
};

/** Take one token from `key`'s bucket. Returns true when the call is allowed. */
export function consumeToken(key: string, opts: RateLimitOptions): boolean {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    // Crude bound on memory: drop everything once the map gets large. Losing
    // bucket state just means a brief burst allowance for everyone — acceptable.
    if (buckets.size >= MAX_BUCKETS) buckets.clear();
    bucket = { tokens: opts.capacity, last: now };
    buckets.set(key, bucket);
  }

  const elapsed = (now - bucket.last) / 1000;
  bucket.tokens = Math.min(opts.capacity, bucket.tokens + elapsed * opts.refillPerSec);
  bucket.last = now;

  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

/** Identity for unauthenticated routes: first hop of x-forwarded-for, else a shared key. */
export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "anonymous";
}

/**
 * Per-user throttle for authenticated, expensive routes (LLM fan-outs, deep
 * research). The credit meter (`checkUsageLimit`) is a read-then-act cap, so a
 * burst of concurrent requests can all pass the pre-check before any spend
 * lands; this token bucket caps the burst so the meter can't be overshot.
 *
 * Returns a 429 when `userId` is over the limit, or null to proceed. Defaults to
 * a burst of 8 and ~0.3/sec sustained — comfortable for real UI use, tight
 * enough to stop scripted concurrent abuse.
 */
export function userRateLimit(
  userId: string,
  route: string,
  opts: RateLimitOptions = { capacity: 8, refillPerSec: 0.3 }
): NextResponse | null {
  if (consumeToken(`${route}:user:${userId}`, opts)) return null;
  return NextResponse.json(
    { error: "Too many requests — slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": "10" } }
  );
}

/**
 * Guard for market-data routes: returns a 429 response when `req`'s client is
 * over the limit, or null when the call may proceed.
 *
 * Defaults allow a burst of 30 calls and 1 call/sec sustained per client per
 * route — generous for real UI polling, tight enough to stop quota abuse.
 */
export function rateLimitGuard(
  req: Request,
  route: string,
  opts: RateLimitOptions = { capacity: 30, refillPerSec: 1 }
): NextResponse | null {
  if (consumeToken(`${route}:${clientKey(req)}`, opts)) return null;
  return NextResponse.json(
    { error: "Too many requests — slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": "10" } }
  );
}

/** Visible for tests only. */
export function _resetBuckets() {
  buckets.clear();
}
