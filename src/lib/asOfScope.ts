// The ambient "nothing after this instant" cutoff for a run.
//
// One cutoff, several consumers: memory recall (agentMemory) and live web search
// (perplexity) both need to know what the crew is entitled to see, and both are
// reached deep inside the CEO's sub-agent fan-out. Threading a parameter through
// every signature would guarantee one path silently missed it, and that path is
// exactly where contamination hides — the same argument agentMemory already
// makes for its cache scope.
//
// It lives here rather than in lib/live/ because the consumers are general app
// modules: a dependency from perplexity.ts into the Live harness would invert
// the layering, and a second copy of this store would drift from the first.
//
// Empty outside a scoped run, which is the normal case. A chat session has no
// as-of and sees everything, because it has no future to leak from.

import { AsyncLocalStorage } from "node:async_hooks";

const asOfStore = new AsyncLocalStorage<string>();

/** Run `fn` with every as-of-aware source clipped to `asOf`. */
export function withAsOfScope<T>(asOf: string, fn: () => Promise<T>): Promise<T> {
  return asOfStore.run(asOf, fn);
}

/** The active cutoff, or null when nothing is clipped. */
export function currentAsOf(): string | null {
  return asOfStore.getStore() ?? null;
}

/**
 * The active cutoff as Perplexity's MM/DD/YYYY, or null.
 *
 * Perplexity's date filters are DAY-granular, so this is deliberately the
 * as-of's own day rather than the day before: excluding it would blind the crew
 * to the morning's news, which is most of what a pre-open run is for. The
 * residual exposure is therefore intraday — a story published at 16:00 can still
 * reach a decision stamped 09:15 on the same date.
 *
 * That is a real limit, not a solved problem, and it is why this is a bound
 * rather than a guarantee: it stops a replayed June day from reading September's
 * web, which is the leak that actually breaks a reconstructible ledger.
 */
export function currentAsOfDayFilter(): string | null {
  const iso = currentAsOf();
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getUTCFullYear()}`;
}

/**
 * Perplexity's date filters for the active as-of, or `{}` when unscoped.
 *
 * Lives here rather than in perplexity.ts on purpose. Two sub-agents post to
 * Perplexity directly instead of through `perplexitySearch`, and importing that
 * module for one pure helper would drag its usage-metering chain — and therefore
 * firebase-admin — into agents that need neither. This module has no runtime
 * dependencies at all, so anyone can reach the clipping without paying for it.
 *
 * One shared builder rather than a copy per caller, because Perplexity ignores
 * unknown keys instead of erroring: a typo in a hand-rolled duplicate fails open
 * and looks exactly like a search that was never clipped.
 *
 * `search_before_date_filter` bounds publication; `last_updated_before_filter`
 * bounds revision, without which a page published in June but rewritten in
 * September still carries September's facts.
 */
export function perplexityAsOfFilters(): Record<string, string> {
  const before = currentAsOfDayFilter();
  return before
    ? { search_before_date_filter: before, last_updated_before_filter: before }
    : {};
}
