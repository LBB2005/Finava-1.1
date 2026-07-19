import { timingSafeEqual } from "crypto";

/**
 * Constant-time comparison of a caller-provided secret against the expected
 * value. Used to gate cron / external-ingest endpoints (CRON_SECRET,
 * MARKOV_INGEST_SECRET, …).
 *
 * - Fails CLOSED: returns false whenever either side is empty, so an unset
 *   expected secret never authenticates anyone.
 * - Constant-time: avoids leaking the secret's length/contents through a
 *   response-time side channel on the compare (timingSafeEqual throws on a
 *   length mismatch, so we guard the lengths first — a mismatch is still a
 *   non-match, just decided before the constant-time step).
 */
export function secretMatches(
  provided: string | null | undefined,
  expected: string | undefined,
): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
