// Candles-only endpoint for chart timeframe switches. Avoids refetching the
// whole bundle when the user toggles 1D…5Y.

import { NextResponse } from "next/server";
import { getStockCandles, isChartRange } from "@/lib/stockData";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const symbol = (ticker ?? "").trim().toUpperCase();
  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range");

  if (!symbol) {
    return NextResponse.json({ error: "Missing ticker." }, { status: 400 });
  }

  if (!isChartRange(range)) {
    return NextResponse.json(
      { error: "Invalid range. Use one of 1D, 1W, 1M, 3M, 1Y, 5Y." },
      { status: 400 }
    );
  }

  if (!process.env.FINNHUB_API_KEY) {
    return NextResponse.json(
      { error: "Stock service not configured (FINNHUB_API_KEY missing)." },
      { status: 503 }
    );
  }

  try {
    const candles = await getStockCandles(symbol, range);
    return NextResponse.json({ range, candles });
  } catch (err) {
    console.error("[stock candles]", symbol, range, err);
    return NextResponse.json(
      { error: "Failed to load candles." },
      { status: 500 }
    );
  }
}
