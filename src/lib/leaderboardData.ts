// Live market-data overlay for the research leaderboard.
//
// Combines three sources, each failure-isolated so one outage degrades a single
// column rather than the whole board:
//   • Alpaca multi-symbol snapshot → live price + % change (1 request)
//   • Alpaca multi-symbol daily bars → 10-session avg volume, for RVOL (1 request)
//   • Finnhub /stock/metric per ticker → P/E, market cap, consolidated avg volume
//
// Why two volume figures: Alpaca's free feed is IEX-only, so its absolute volume
// undercounts the consolidated tape — fine as a RATIO (today ÷ avg, scale cancels)
// but wrong as a displayed number. So RVOL comes from Alpaca, while the absolute
// "Avg Vol" column shows Finnhub's consolidated 10-day average.
//
// Finnhub metrics are fetched with bounded concurrency and cached for an hour
// (see getBasicFinancials); on a cold start a few may hit the rate limit and
// return null, then self-heal on the next refresh once the rest are cached.

import { getBasicFinancials } from "@/lib/finnhub";
import { getAlpacaSnapshots, getAlpacaAvgVolumes, type AlpacaSnapshot } from "@/lib/alpaca";
import type { LiveRow } from "@/lib/research";

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Run `fn` over `items` with at most `limit` in flight at once. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

interface Metric {
  pe: number | null;
  marketCap: number | null; // absolute USD
  avgVol: number | null; // absolute shares
}

async function fetchMetric(ticker: string): Promise<Metric> {
  try {
    const raw = (await getBasicFinancials(ticker)) as { metric?: Record<string, unknown> };
    const m = raw?.metric ?? {};
    const mcMillions = num(m.marketCapitalization); // Finnhub unit: millions USD
    const avgMillions =
      num(m["10DayAverageTradingVolume"]) ?? num(m["3MonthAverageTradingVolume"]); // millions of shares
    return {
      pe: num(m.peTTM) ?? num(m.peBasicExclExtraTTM),
      marketCap: mcMillions != null ? mcMillions * 1e6 : null,
      avgVol: avgMillions != null ? avgMillions * 1e6 : null,
    };
  } catch {
    return { pe: null, marketCap: null, avgVol: null };
  }
}

/** Assemble live rows for the whole universe. Never throws — missing fields are null. */
export async function getBoardData(tickers: string[]): Promise<LiveRow[]> {
  const syms = Array.from(new Set(tickers.map((t) => t.toUpperCase())));

  const [snaps, avgVols, metrics] = await Promise.all([
    getAlpacaSnapshots(syms).catch(() => new Map<string, AlpacaSnapshot>()),
    getAlpacaAvgVolumes(syms).catch(() => new Map<string, number>()),
    mapPool(syms, 8, fetchMetric),
  ]);

  return syms.map((ticker, i) => {
    const snap = snaps.get(ticker);
    const avg10 = avgVols.get(ticker) ?? null;
    const today = snap?.dayVolume ?? null;
    const rvol = today != null && avg10 != null && avg10 > 0 ? today / avg10 : null;
    const m = metrics[i];
    return {
      ticker,
      price: snap?.price ?? null,
      changePct: snap?.changePct ?? null,
      marketCap: m.marketCap,
      pe: m.pe,
      avgVol: m.avgVol,
      rvol,
    };
  });
}
