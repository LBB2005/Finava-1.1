// Reads of liveRuns — the run's mutable working state.
//
// liveRuns is NOT part of the append-only ledger: it holds the step results a
// multi-invocation run needs to carry forward, and it is rewritten as the run
// progresses. Keeping it clearly separate from the live* collections is what
// lets the ledger's discipline test be absolute — nothing here is published as
// part of the tamper-evident record, so nothing here needs to be immutable.

import { db } from "@/lib/firebase-admin";

function runRef(runId: string) {
  return db.collection("liveRuns").doc(runId);
}

/**
 * A completed step's stored result, or null if it has not run.
 *
 * Later steps read their inputs from here rather than trusting the runner to
 * pass them: a workflow that re-runs one job mid-pipeline would otherwise be
 * able to feed step N a payload step N-1 never produced.
 */
export async function getStepResult<T>(runId: string, step: string): Promise<T | null> {
  const snap = await runRef(runId).get();
  const steps = (snap.data()?.steps ?? {}) as Record<string, { done?: boolean; result?: T }>;
  const entry = steps[step];
  return entry?.done ? ((entry.result ?? null) as T | null) : null;
}

/** Every completed step's result, keyed by step name. Used by the export. */
export async function getRunState(
  runId: string
): Promise<{ steps: Record<string, unknown>; creditsSpent: number } | null> {
  const snap = await runRef(runId).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  return {
    steps: (data.steps ?? {}) as Record<string, unknown>,
    creditsSpent: Number(data.creditsSpent ?? 0),
  };
}

/**
 * The as-of instant this run was opened with.
 *
 * Null when session_open has not run or predates as-of stamping. Callers decide
 * what that means: `decide` refuses, because a decision must be able to say what
 * it was entitled to know; `debate` proceeds unclipped, because a crew that
 * recalls too much is a weaker result, not a corrupted ledger entry.
 */
export async function getRunAsOf(runId: string): Promise<string | null> {
  const open = await getStepResult<{ asOf?: string }>(runId, "session_open");
  return open?.asOf ?? null;
}
