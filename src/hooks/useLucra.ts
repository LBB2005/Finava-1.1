"use client";
import { useSyncExternalStore, useCallback } from "react";
import { getEntry, subscribe, runLucra, resetLucra, type LucraEntry } from "@/lib/lucraStore";

/** Subscribe to the session-cached Lucra analysis for a ticker. The analysis runs
 *  once per ticker per visit; `run()` is a no-op if it's already streaming/done. */
export function useLucra(ticker: string | null) {
  const sym = ticker ? ticker.toUpperCase() : "";

  const sub = useCallback((cb: () => void) => (sym ? subscribe(sym, cb) : () => {}), [sym]);
  const snapshot = useCallback(() => getEntry(sym), [sym]);
  const entry = useSyncExternalStore<LucraEntry>(sub, snapshot, snapshot);

  const run = useCallback(() => {
    if (sym) void runLucra(sym);
  }, [sym]);

  const retry = useCallback(() => {
    if (sym) {
      resetLucra(sym);
      void runLucra(sym);
    }
  }, [sym]);

  return { ...entry, run, retry };
}
