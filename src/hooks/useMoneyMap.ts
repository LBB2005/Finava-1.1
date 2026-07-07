"use client";
import { useSyncExternalStore, useCallback } from "react";
import { getEntry, subscribe, runMoneyMap, resetMoneyMap } from "@/lib/moneyMapStore";
import type { MoneyMapEntry } from "@/lib/moneyMap";

/** Subscribe to the session-cached Money Map for a ticker. The map streams once
 *  per ticker per visit; `run()` is a no-op if it's already streaming/done. */
export function useMoneyMap(ticker: string | null) {
  const sym = ticker ? ticker.toUpperCase() : "";

  const sub = useCallback((cb: () => void) => (sym ? subscribe(sym, cb) : () => {}), [sym]);
  const snapshot = useCallback(() => getEntry(sym), [sym]);
  const entry = useSyncExternalStore<MoneyMapEntry>(sub, snapshot, snapshot);

  const run = useCallback(() => {
    if (sym) void runMoneyMap(sym);
  }, [sym]);

  const retry = useCallback(() => {
    if (sym) {
      resetMoneyMap(sym);
      void runMoneyMap(sym);
    }
  }, [sym]);

  return { ...entry, run, retry };
}
