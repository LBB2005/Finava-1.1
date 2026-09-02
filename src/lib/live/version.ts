// Agent version + execution mode for the ledger.
//
// The mandate is frozen for the life of the run, but the AGENTS are not: prompt
// and routing changes ship as dated versions so performance segments by version.
// That is a better artifact than a static one — "v1.2 shipped 14 Oct, here is
// before and after" is a real experiment — and it is the answer to "you tuned it
// until it worked", because every decision carries the version that made it.
//
// Bump this in the same commit as any prompt/agent change that could plausibly
// move a decision. Never retroactively.

// v1.1 — triage crew trimmed (no DCF/Risk/Competitor in the waves), shortlist
// 20 → 12, debates 6 → 4. A decision now rests on less pre-debate evidence, so
// it segments separately from v1.0 whatever it does to the returns.
export const AGENT_VERSION = process.env.LIVE_AGENT_VERSION || "v1.1-2026-09-02";

export type ExecutionMode = "shadow" | "paper" | "live";

/**
 * Shadow until LIVE_TRADING_ENABLED is explicitly "true".
 *
 * Defaults to the mode that CANNOT place an order, so a missing env var during a
 * deploy degrades to recording rather than trading. "live" is never returned
 * here — real capital would get its own module and its own opt-in, and inverting
 * a shared flag is how a config typo becomes a real-money order.
 */
export function executionMode(): ExecutionMode {
  return process.env.LIVE_TRADING_ENABLED === "true" ? "paper" : "shadow";
}
