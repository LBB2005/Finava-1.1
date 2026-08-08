// Deterministic Finava Score for a single ticker — the intelligence rail's
// Score cell and the Overview's pillar bars. Reads the warm 15-minute factor
// universe memo (the same engine the Research board uses), so this adds zero
// upstream calls. Public read-only, like /api/research/factors.

import { NextResponse } from "next/server";
import { getFactorUniverse } from "@/lib/factorUniverse";
import { composite, grade } from "@/lib/research";
import { rateLimitGuard } from "@/lib/rateLimit";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const limited = await rateLimitGuard(req, "stock-score", {
    capacity: 20,
    refillPerSec: 0.5,
  });
  if (limited) return limited;

  const { ticker } = await params;
  const symbol = (ticker ?? "").trim().toUpperCase();
  if (!symbol) return NextResponse.json({ error: "Missing ticker." }, { status: 400 });

  try {
    const universe = await getFactorUniverse();
    const stock = universe.stocks.find((s) => s.ticker === symbol) ?? null;
    if (!stock) {
      // Outside the scored universe (non-S&P names) — the rail renders
      // "Not yet scored".
      return NextResponse.json(
        { error: `${symbol} is not in the scored universe yet.` },
        { status: 404 }
      );
    }

    const score = composite(stock, "month");
    return NextResponse.json({
      ticker: symbol,
      f: stock.f,
      score,
      grade: grade(score),
      asOf: universe.asOf,
    });
  } catch (err) {
    console.error("[stock score]", symbol, err);
    return NextResponse.json(
      { error: `Couldn't compute the score for ${symbol}.` },
      { status: 502 }
    );
  }
}
