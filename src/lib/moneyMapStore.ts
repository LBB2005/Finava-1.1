"use client";
// Session-scoped store for Money Maps — a module-level Map keyed by ticker that
// survives tab unmount/remount, so the map streams once per ticker per visit.
// All event folding lives in the pure applyEvent() reducer (see moneyMap.ts);
// this file is just the fetch + SSE-frame plumbing around it.

import { authFetch } from "@/lib/authFetch";
import {
  applyEvent,
  emptyMoneyMap,
  type MoneyMapEntry,
  type MoneyMapEvent,
} from "@/lib/moneyMap";

const store = new Map<string, MoneyMapEntry>();
const inflight = new Set<string>();
const listeners = new Map<string, Set<() => void>>();

// Stable singleton for the "not started" state — useSyncExternalStore compares
// snapshots by reference, so an absent ticker must return the SAME object.
const EMPTY: MoneyMapEntry = emptyMoneyMap();

export function getEntry(ticker: string): MoneyMapEntry {
  return store.get(ticker) ?? EMPTY;
}

function setEntry(ticker: string, entry: MoneyMapEntry) {
  store.set(ticker, entry);
  listeners.get(ticker)?.forEach((fn) => fn());
}

export function subscribe(ticker: string, fn: () => void): () => void {
  let set = listeners.get(ticker);
  if (!set) {
    set = new Set();
    listeners.set(ticker, set);
  }
  set.add(fn);
  return () => set!.delete(fn);
}

/** Kick off (or no-op resume) the map for a ticker. Safe to call repeatedly. */
export async function runMoneyMap(ticker: string): Promise<void> {
  const sym = ticker.toUpperCase();
  const existing = store.get(sym);
  if (inflight.has(sym)) return; // already running
  if (existing && (existing.status === "done" || existing.status === "streaming")) return;

  inflight.add(sym);
  setEntry(sym, { ...emptyMoneyMap(), status: "streaming" });

  try {
    const res = await authFetch(`/api/stock/${encodeURIComponent(sym)}/money-map`, {
      method: "POST",
    });
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error ?? `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? ""; // keep the trailing partial frame
      for (const frame of frames) {
        const line = frame.trim();
        if (!line.startsWith("data:")) continue;
        const json = line.slice(5).trim();
        if (!json) continue;
        let event: MoneyMapEvent;
        try {
          event = JSON.parse(json) as MoneyMapEvent;
        } catch {
          continue;
        }
        setEntry(sym, applyEvent(store.get(sym) ?? emptyMoneyMap(), event));
      }
    }

    // Stream ended without a terminal `done`/`error` event.
    const final = store.get(sym) ?? emptyMoneyMap();
    if (final.status !== "done" && final.status !== "error") {
      const hasData = final.map.relations.length > 0;
      setEntry(sym, {
        ...final,
        status: hasData ? "done" : "error",
        error: hasData ? null : "No relationships found for this company.",
      });
    }
  } catch (err) {
    const cur = store.get(sym) ?? emptyMoneyMap();
    setEntry(sym, {
      ...cur,
      status: "error",
      error: err instanceof Error ? err.message : "Failed to load the money map.",
    });
  } finally {
    inflight.delete(sym);
  }
}

/** Drop a ticker's cached map so the next run starts fresh (used by retry). */
export function resetMoneyMap(ticker: string) {
  const sym = ticker.toUpperCase();
  store.delete(sym);
  setEntry(sym, emptyMoneyMap());
}
