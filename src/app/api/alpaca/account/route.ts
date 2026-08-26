import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/requireAuth";
import { requireEntitlement } from "@/lib/entitlements";

const KEY    = process.env.ALPACA_API_KEY    ?? "";
const SECRET = process.env.ALPACA_API_SECRET ?? "";
const BASE   = process.env.ALPACA_BASE_URL   ?? "https://paper-api.alpaca.markets";

const HEADERS = {
  "APCA-API-KEY-ID":     KEY,
  "APCA-API-SECRET-KEY": SECRET,
};

export type AlpacaAccount =
  | {
      live: true;
      isPaper:          boolean;
      equity:           number;
      lastEquity:       number;
      cash:             number;
      buyingPower:      number;
      unrealizedPl:     number;
      unrealizedPlPct:  number;
      dayPl:            number;
      dayPlPct:         number;
      dayTradeCount:    number;
      history:          { ts: number; equity: number }[];
    }
  | { live: false; error: string };

export async function GET(): Promise<NextResponse> {
  const { userId, error } = await requireAuth();
  if (error) return error;
  const gate = await requireEntitlement(userId, "quantSuite");
  if (gate) return gate;

  if (!KEY || !SECRET) {
    return NextResponse.json({ live: false, error: "Alpaca credentials not configured." });
  }

  try {
    const [acctRes, histRes] = await Promise.all([
      fetch(`${BASE}/v2/account`, { headers: HEADERS, next: { revalidate: 0 } }),
      fetch(`${BASE}/v2/account/portfolio/history?period=1D&timeframe=15Min`, {
        headers: HEADERS,
        next: { revalidate: 0 },
      }),
    ]);

    if (!acctRes.ok) {
      const text = await acctRes.text();
      console.error("[alpaca/account GET] upstream", acctRes.status, text);
      return NextResponse.json({ live: false, error: "Failed to load account." });
    }

    const acct = await acctRes.json();

    const equity          = parseFloat(acct.equity        ?? "0");
    const lastEquity      = parseFloat(acct.last_equity   ?? String(equity));
    const cash            = parseFloat(acct.cash          ?? "0");
    const buyingPower     = parseFloat(acct.buying_power  ?? "0");
    const unrealizedPl    = parseFloat(acct.unrealized_pl  ?? "0");
    const unrealizedPlPct = parseFloat(acct.unrealized_plpc ?? "0") * 100;
    const dayPl           = equity - lastEquity;
    const dayPlPct        = lastEquity > 0 ? (dayPl / lastEquity) * 100 : 0;
    const dayTradeCount   = acct.daytrade_count ?? 0;

    let history: { ts: number; equity: number }[] = [];
    if (histRes.ok) {
      const hist = await histRes.json();
      if (Array.isArray(hist.timestamp) && Array.isArray(hist.equity)) {
        history = (hist.timestamp as number[])
          .map((ts, i) => ({ ts, equity: hist.equity[i] ?? 0 }))
          .filter((p) => p.equity > 0);
      }
    }

    const isPaper = BASE.includes("paper-api");

    return NextResponse.json({
      live: true,
      isPaper,
      equity, lastEquity, cash, buyingPower,
      unrealizedPl, unrealizedPlPct,
      dayPl, dayPlPct, dayTradeCount,
      history,
    });
  } catch (err) {
    console.error("[alpaca/account GET]", err);
    return NextResponse.json({ live: false, error: "Failed to load account." });
  }
}
