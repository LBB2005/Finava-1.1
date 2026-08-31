// Shared plumbing for every /api/live/* route: auth, configuration gate,
// idempotent step recording, and the ET trading-day clock.
//
// These routes are called by a GitHub Actions runner, not a browser, so they
// sit outside withRoute's Bearer-token model. They still establish a run context
// (so credits are metered) and they still refuse to exist when unconfigured.

import { NextResponse } from "next/server";
import { secretMatches } from "@/lib/secretMatches";
import { requireAdmin } from "@/lib/requireAdmin";
import { apiError } from "@/lib/apiError";
import { makeRunContext } from "@/lib/runContext";
import { db } from "@/lib/firebase-admin";
import { logger } from "@/lib/logger";
import { chargeStep, BudgetExceededError } from "./budget";
import { flushTraces, runTraced } from "@/lib/observability";

const log = logger("live:harness");

/** The synthetic user the harness runs as. Its usage is metered, not exempted. */
export const LIVE_HARNESS_UID = process.env.LIVE_HARNESS_UID || "finava-live";

/**
 * Is the harness configured at all?
 *
 * A deployment with no LIVE_HARNESS_SECRET has not opted into any of this, and
 * every route 503s — the same shape as stripeConfigured(). Deliberately not a
 * 404: a silent "route doesn't exist" from a misconfigured production deploy is
 * indistinguishable from a bad URL in the Actions log, and the whole point of
 * publishing is that failures are legible.
 */
export function liveHarnessConfigured(): boolean {
  return Boolean(process.env.LIVE_HARNESS_SECRET);
}

/**
 * Authorize a harness call.
 *
 * Accepts EITHER the shared secret (how Actions calls it) or an admin session
 * (how a human debugs it). A dedicated LIVE_HARNESS_SECRET, never CRON_SECRET:
 * this secret lives in a public repo's Actions settings and authorizes a system
 * that places orders, so its blast radius must not overlap the cron routes'.
 */
export async function authorizeHarness(req: Request): Promise<NextResponse | null> {
  if (!liveHarnessConfigured()) {
    return apiError("not_configured", "Finava Live is not configured on this deployment", 503);
  }

  const header = req.headers.get("x-live-secret") ?? bearer(req);
  if (secretMatches(header, process.env.LIVE_HARNESS_SECRET)) return null;

  const admin = await requireAdmin();
  if (admin.error) {
    return apiError("unauthorized", "Finava Live harness credentials required", 401);
  }
  return null;
}

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}

// ---------------------------------------------------------------------------
// Trading day / clock
// ---------------------------------------------------------------------------

/**
 * Today's date in US/Eastern as YYYY-MM-DD.
 *
 * The whole ledger is keyed on the ET calendar day. The Actions cron fires on a
 * UTC schedule that drifts an hour across DST, and a UTC date would silently
 * roll a pre-open run onto the wrong day twice a year, so the ET day is derived
 * here and never inferred from the trigger time.
 */
export function easternDay(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Minutes since ET midnight — used by the execute cutoff. */
export function easternMinutes(at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  // Intl renders midnight as hour 24 in some ICU versions.
  return (get("hour") % 24) * 60 + get("minute");
}

// ---------------------------------------------------------------------------
// Idempotent steps
// ---------------------------------------------------------------------------

/** liveRuns is mutable working state, not the append-only ledger. */
function runRef(runId: string) {
  return db.collection("liveRuns").doc(runId);
}

export interface StepRecord<T> {
  result: T;
  replayed: boolean;
}

/**
 * Run one harness step at most once per run.
 *
 * "Re-run failed jobs" is a button in the Actions UI and it re-runs SUCCEEDED
 * steps too, so without this a retry would re-spend a full crew debate and —
 * worse — append a second ledger entry for the same decision. A completed step
 * returns its stored result verbatim and costs nothing.
 *
 * The budget is charged AFTER the step body, on the way out: the work is already
 * paid for by then, and recording it is what lets the NEXT step refuse.
 */
export async function runStep<T>(
  runId: string,
  step: string,
  fn: () => Promise<T>
): Promise<StepRecord<T>> {
  const snap = await runRef(runId).get();
  const steps = (snap.data()?.steps ?? {}) as Record<string, { result?: T; done?: boolean }>;
  const prior = steps[step];
  if (prior?.done) {
    log.info("step replayed from store", { runId, step });
    return { result: prior.result as T, replayed: true };
  }

  const result = await fn();

  await runRef(runId).set(
    { steps: { [step]: { done: true, result, at: new Date().toISOString() } } },
    { merge: true }
  );
  await chargeStep(runId, step);

  return { result, replayed: false };
}

/**
 * Wrap a harness route: authorize, establish a metered run context, and map the
 * budget abort to a 429 rather than an opaque 500 so the Actions log says why.
 */
export function withHarness(
  handler: (req: Request) => Promise<Response>
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const denied = await authorizeHarness(req);
    if (denied) return denied;

    return runTraced(makeRunContext(LIVE_HARNESS_UID), async () => {
      try {
        return await handler(req);
      } catch (err) {
        if (err instanceof BudgetExceededError) {
          log.error("run aborted on budget", { runId: err.runId, step: err.step, spent: err.spent });
          return apiError("budget_exceeded", err.message, 429, {
            runId: err.runId,
            step: err.step,
            spent: err.spent,
            cap: err.cap,
          });
        }
        log.error("harness step failed", {
          path: new URL(req.url).pathname,
          err: err instanceof Error ? err.message : String(err),
        });
        return apiError(
          "step_failed",
          err instanceof Error ? err.message : "Harness step failed",
          500
        );
      } finally {
        // A harness step is the longest-running thing this app does and the
        // function is frozen the instant it returns, so anything still in the
        // tracer's batch queue is lost. Flushed on the failure path too: the
        // trace of a run that died is the one worth having.
        await flushTraces();
      }
    });
  };
}
