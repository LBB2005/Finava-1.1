import type { Constituent } from "@/lib/sp500";

/** Uppercase, trim, strip to a valid free-form symbol (A–Z, 0–9, dot, dash). */
export function sanitizeSymbol(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
}

/**
 * Rank a universe against a query.
 * Order: exact ticker → ticker prefix → name substring. Ties keep input order.
 * Returns at most `limit` matches; empty/whitespace query → [].
 */
export function searchStocks(
  query: string,
  universe: Constituent[],
  limit: number,
): Constituent[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];

  const scored: { c: Constituent; rank: number }[] = [];
  for (const c of universe) {
    const ticker = c.ticker.toUpperCase();
    const name = c.name.toUpperCase();
    let rank: number;
    if (ticker === q) rank = 0;
    else if (ticker.startsWith(q)) rank = 1;
    else if (name.includes(q)) rank = 2;
    else continue;
    scored.push({ c, rank });
  }

  scored.sort((a, b) => a.rank - b.rank);
  return scored.slice(0, limit).map((s) => s.c);
}
