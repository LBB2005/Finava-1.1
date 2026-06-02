// Real factor scores for the Research "Tune" lens, computed across the whole
// S&P 500. Server-side, app-level API keys, no user auth (works under the dev
// bypass), mirroring /api/leaderboard.
//
// The heavy upstream calls (Polygon financials, Finnhub analyst, Alpaca bars)
// are individually cached via Next's Data Cache (per-fetch `revalidate`), so a
// cold compute is expensive but warm ones are cheap. On top of that we memoise
// the fully-assembled universe in-process for a short TTL so a burst of 30s SWR
// polls re-ranks instantly instead of re-walking 500 names every time.
//
// computeFactorUniverse is failure-isolated — a down source nulls a factor
// (→ neutral 50) rather than 500-ing the board — so we only 500 on a truly
// unexpected error.

import { NextResponse } from "next/server";
import { computeFactorUniverse, type FactorUniverse } from "@/lib/factors";

export const runtime = "nodejs";
export const maxDuration = 300; // cold compute fans out across ~500 tickers

const TTL_MS = 15 * 60 * 1000;
let cache: { at: number; data: FactorUniverse } | null = null;
let inflight: Promise<FactorUniverse> | null = null;

async function load(): Promise<FactorUniverse> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  // Collapse concurrent cold requests onto a single computation.
  if (!inflight) {
    inflight = computeFactorUniverse()
      .then((data) => {
        cache = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export async function GET() {
  try {
    const data = await load();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[research/factors]", err);
    return NextResponse.json({ error: "Failed to compute factor universe" }, { status: 500 });
  }
}
