// Live market-data overlay for the research leaderboard.
//
// Mirrors src/app/api/quotes/route.ts: server-side, app-level API keys, no user
// auth required (works under the dev bypass). getBoardData is failure-isolated —
// a down source nulls its column rather than 500-ing the whole board, so we only
// 500 on a truly unexpected error.

import { NextResponse } from "next/server";
import { getBoardData } from "@/lib/leaderboardData";
import { UNIVERSE } from "@/lib/research";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("tickers") ?? "";
  const requested = raw
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  // Default to the full seed universe when the client sends no explicit list.
  const tickers = requested.length ? requested : UNIVERSE.map((s) => s.ticker);

  try {
    const rows = await getBoardData(tickers);
    return NextResponse.json({ rows });
  } catch (err) {
    console.error("[leaderboard]", err);
    return NextResponse.json(
      { error: "Failed to fetch leaderboard data" },
      { status: 500 }
    );
  }
}
