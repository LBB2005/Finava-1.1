// Shared helpers for the watchlists API routes.
import type { Watchlist } from "@/types/watchlist";

/** Map a serialized Firestore doc to the Watchlist wire shape. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toWatchlist(row: any): Watchlist {
  return {
    id: row.id,
    name: row.name,
    tickers: Array.isArray(row.tickers) ? row.tickers : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Uppercase, trim, drop blanks, de-dupe — preserving first-seen order. */
export function normalizeTickers(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of input) {
    if (typeof t !== "string") continue;
    const sym = t.trim().toUpperCase();
    if (!sym || seen.has(sym)) continue;
    seen.add(sym);
    out.push(sym);
  }
  return out;
}
