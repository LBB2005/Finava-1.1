import { NextResponse } from "next/server";
import type { Fill, OrderSide } from "@/components/hedge-fund/types";
import { requireAuth } from "@/lib/requireAuth";
import { requireEntitlement } from "@/lib/entitlements";

const KEY    = process.env.ALPACA_API_KEY    ?? "";
const SECRET = process.env.ALPACA_API_SECRET ?? "";
const BASE   = process.env.ALPACA_BASE_URL   ?? "https://paper-api.alpaca.markets";
const HEADERS = {
  "APCA-API-KEY-ID":     KEY,
  "APCA-API-SECRET-KEY": SECRET,
};

export async function GET(): Promise<NextResponse> {
  const { userId, error } = await requireAuth();
  if (error) return error;
  const gate = await requireEntitlement(userId, "quantSuite");
  if (gate) return gate;

  if (!KEY || !SECRET) return NextResponse.json([]);

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  try {
    const res = await fetch(
      `${BASE}/v2/account/activities/FILL?date=${today}&direction=desc&page_size=100`,
      { headers: HEADERS, next: { revalidate: 0 } }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Alpaca ${res.status}: ${text}` }, { status: res.status });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[] = await res.json();
    const fills: Fill[] = data.map((a) => {
      const qty = parseFloat(a.qty ?? a.cum_qty ?? "0");
      const px  = parseFloat(a.price ?? "0");
      const ts  = new Date(a.transaction_time).toLocaleTimeString("en-US", {
        hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
      });
      return {
        ts,
        side:  (a.side === "buy" ? "BUY" : "SELL") as OrderSide,
        ticker: a.symbol,
        qty,
        px,
        value:  qty * px,
        route: "ALPACA",
      };
    });

    return NextResponse.json(fills);
  } catch (err) {
    console.error("[alpaca/activities GET]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
