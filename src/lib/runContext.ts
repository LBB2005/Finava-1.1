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

/** Build a fresh run context (requestId auto-generated when not supplied). */
export function makeRunContext(userId: string, requestId?: string): RunContext {
  return { userId, requestId: requestId ?? newRequestId(), credits: { total: 0 } };
}

/** The current request's correlation id (undefined outside a run context). */
export function currentRequestId(): string | undefined {
  return usageStore.getStore()?.requestId;
}

/** Credits spent so far in the current run (0 outside a run context). */
export function currentRunCredits(): number {
  return usageStore.getStore()?.credits.total ?? 0;
}
