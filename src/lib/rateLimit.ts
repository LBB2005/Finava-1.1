import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Token-bucket rate limiter for API routes.
 *
 * Cost-protection backstop against runaway clients hammering paid market-data
 * and LLM APIs — not a hard security boundary.
 *
 * Two backends:
 *   - Shared (preferred): an Upstash Redis token bucket, so the ceiling holds
 *     across all warm serverless instances. Enabled automatically when both
 *     UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set (provision an
 *     Upstash Redis via the Vercel Marketplace and the env vars are injected).
 *   - In-memory fallback: the per-instance bucket below. Used when Upstash isn't
 *     configured (local dev, un-provisioned prod) and whenever a Redis call
 *     errors — so a Redis blip degrades to per-instance throttling rather than
 *     removing the guard or 500-ing the request.
 *
 * Because `userRateLimit` (the burst guard in front of the credit meter) now
 * shares one bucket across instances, a burst of concurrent requests can no
 * longer each clear a separate per-instance bucket before any spend lands — the
 * meter's read-then-act overshoot is bounded to a single bucket's capacity.
 * (The Firestore credit ledger itself stays the source of truth; exact
 * pre-reservation isn't possible since a call's token cost is unknown up front.)
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

/** Take one token from `key`'s in-memory bucket. Returns true when allowed. */
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

// ── Shared Redis backend ─────────────────────────────────────────────────────
// Constructed once from env. Null when Upstash isn't configured → in-memory path.
const redis: Redis | null = (() => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    return new Redis({ url, token });
  } catch (e) {
    console.error("[rateLimit] Upstash init failed, using in-memory fallback:", e);
    return null;
  }
})();

/** Whether the shared store is active. Exposed for diagnostics/tests. */
export function usingSharedStore(): boolean {
  return redis !== null;
}

// One Ratelimit instance per distinct bucket shape, reused across requests.
const limiterCache = new Map<string, Ratelimit>();

function limiterFor(opts: RateLimitOptions): Ratelimit | null {
  if (!redis) return null;
  const cacheKey = `${opts.capacity}:${opts.refillPerSec}`;
  let rl = limiterCache.get(cacheKey);
  if (!rl) {
    // Map our (capacity, refillPerSec) onto Upstash's tokenBucket(refillRate,
    // interval, maxTokens). Refill in batches over a fixed 10s window: refillRate
    // = refillPerSec × 10 (≥1). Average rate matches; the bucket is still capped
    // at `capacity`, so burst behavior is preserved. Granularity is per-window
    // rather than continuous, which is fine for a cost backstop.
    const WINDOW_SEC = 10;
    const refillRate = Math.max(1, Math.round(opts.refillPerSec * WINDOW_SEC));
    rl = new Ratelimit({
      redis,
      limiter: Ratelimit.tokenBucket(refillRate, `${WINDOW_SEC} s`, opts.capacity),
      prefix: "rl",
      analytics: false,
    });
    limiterCache.set(cacheKey, rl);
  }
  return rl;
}

/** Take one token from `key`'s bucket (shared store, or in-memory fallback). */
async function allow(key: string, opts: RateLimitOptions): Promise<boolean> {
  const rl = limiterFor(opts);
  if (!rl) return consumeToken(key, opts);
  try {
    const { success } = await rl.limit(key);
    return success;
  } catch (e) {
    // Redis unreachable/errored: degrade to per-instance throttling rather than
    // dropping the guard entirely.
    console.error("[rateLimit] Redis error, falling back to in-memory:", e);
    return consumeToken(key, opts);
  }
}

function tooManyRequests(): NextResponse {
  return NextResponse.json(
    { error: "Too many requests — slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": "10" } }
  );
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
 * lands; this token bucket caps the burst so the meter can't be overshot. With
 * the shared store the bucket is global across instances.
 *
 * Returns a 429 when `userId` is over the limit, or null to proceed. Defaults to
 * a burst of 8 and ~0.3/sec sustained — comfortable for real UI use, tight
 * enough to stop scripted concurrent abuse.
 */
export async function userRateLimit(
  userId: string,
  route: string,
  opts: RateLimitOptions = { capacity: 8, refillPerSec: 0.3 }
): Promise<NextResponse | null> {
  if (await allow(`${route}:user:${userId}`, opts)) return null;
  return tooManyRequests();
}

/**
 * Guard for market-data routes: returns a 429 response when `req`'s client is
 * over the limit, or null when the call may proceed.
 *
 * Defaults allow a burst of 30 calls and 1 call/sec sustained per client per
 * route — generous for real UI polling, tight enough to stop quota abuse.
 */
export async function rateLimitGuard(
  req: Request,
  route: string,
  opts: RateLimitOptions = { capacity: 30, refillPerSec: 1 }
): Promise<NextResponse | null> {
  if (await allow(`${route}:${clientKey(req)}`, opts)) return null;
  return tooManyRequests();
}

/** Visible for tests only — clears the in-memory buckets. */
export function _resetBuckets() {
  buckets.clear();
}
