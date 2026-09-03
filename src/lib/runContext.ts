import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/**
 * Request-scoped run context — shared by usage metering, log correlation, and the
 * in-run cost accumulator.
 *
 * Deliberately dependency-light (only async_hooks + crypto): the route wrapper
 * and the logger enter/read this store, and must NOT transitively pull in the
 * heavy usage/Firestore chain just to get a requestId.
 *
 *   - userId       → recordUsage() reads it when a caller doesn't pass one.
 *   - requestId    → every log line in one request/crew shares it (correlation).
 *   - credits.total→ a running total each recordUsage() adds to, so a long crew
 *                    can abort before blowing its per-run cost cap.
 */
export interface RunContext {
  userId: string;
  requestId: string;
  credits: { total: number };
}

export const usageStore = new AsyncLocalStorage<RunContext>();

/** A short correlation id for one request/run. */
export function newRequestId(): string {
  return randomUUID().slice(0, 8);
}

/**
 * The shape a correlation id is allowed to take.
 *
 * `requestId` can originate in an inbound `x-request-id` header, which is
 * attacker-controlled, and from here it flows into every log line and into the
 * Langfuse sessionId. Constrain it to the alphabet real correlation ids use
 * (UUIDs, Vercel request ids, W3C traceparents) so nothing downstream has to
 * defend itself against control characters, delimiters, or unbounded length.
 */
const REQUEST_ID = /^[A-Za-z0-9_.:-]{1,64}$/;

/**
 * Build a fresh run context (requestId auto-generated when not supplied).
 *
 * An unusable `requestId` is REPLACED, never rejected: a hostile header must not
 * be able to fail a request, and it must not be able to steer one either. It is
 * also not truncated — a 200-char id clipped to 64 would silently merge two
 * distinct upstream runs under one correlation key.
 */
export function makeRunContext(userId: string, requestId?: string): RunContext {
  const id = requestId && REQUEST_ID.test(requestId) ? requestId : newRequestId();
  return { userId, requestId: id, credits: { total: 0 } };
}

/** The current request's correlation id (undefined outside a run context). */
export function currentRequestId(): string | undefined {
  return usageStore.getStore()?.requestId;
}

/** Credits spent so far in the current run (0 outside a run context). */
export function currentRunCredits(): number {
  return usageStore.getStore()?.credits.total ?? 0;
}
