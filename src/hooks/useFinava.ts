"use client";
import { useSyncExternalStore, useCallback } from "react";
import { getEntry, subscribe, runFinava, resetFinava, type FinavaEntry } from "@/lib/finavaStore";

/** Subscribe to the session-cached Finava analysis for a ticker. The analysis runs
 *  once per ticker per visit; `run()` is a no-op if it's already streaming/done. */
export function useFinava(ticker: string | null) {
  const sym = ticker ? ticker.toUpperCase() : "";

  const sub = useCallback((cb: () => void) => (sym ? subscribe(sym, cb) : () => {}), [sym]);
  const snapshot = useCallback(() => getEntry(sym), [sym]);
  const entry = useSyncExternalStore<FinavaEntry>(sub, snapshot, snapshot);

  const run = useCallback(() => {
    if (sym) void runFinava(sym);
  }, [sym]);

  const retry = useCallback(() => {
    if (sym) {
      resetFinava(sym);
      void runFinava(sym);
    }
  }, [sym]);

  /** Re-run a done ticker stale-while-revalidate: the old verdict stays on
   *  screen while fresh signals stream over it (the rail's ↻). */
  const refresh = useCallback(() => {
    if (sym) void runFinava(sym, { force: true });
  }, [sym]);

  return { ...entry, run, retry, refresh };
}
