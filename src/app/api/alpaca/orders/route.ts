import { NextResponse } from "next/server";
import type { Order, OrderSide, OrderStatus } from "@/components/hedge-fund/types";
import { requireAuth } from "@/lib/requireAuth";
import { requireEntitlement } from "@/lib/entitlements";

const KEY    = process.env.ALPACA_API_KEY    ?? "";
const SECRET = process.env.ALPACA_API_SECRET ?? "";
const BASE   = process.env.ALPACA_BASE_URL   ?? "https://paper-api.alpaca.markets";
const HEADERS = {
  "APCA-API-KEY-ID":     KEY,
  "APCA-API-SECRET-KEY": SECRET,
};

function mapType(t: string): string {
  switch (t) {
    case "limit":         return "LMT";
    case "market":        return "MKT";
    case "stop":          return "STP";
    case "stop_limit":    return "STP-LMT";
    case "trailing_stop": return "TRAIL";
    default:              return t.toUpperCase();
  }
}

function mapStatus(s: string): OrderStatus {
  if (s === "partially_filled")                return "Partial";
  if (s === "pending_new" || s === "accepted") return "Queued";
  if (s === "filled")                          return "Filled";
  return "Working";
}

function mapTif(t: string): string {
  switch (t) {
    case "day": return "DAY";
    case "gtc": return "GTC";
    case "ioc": return "IOC";
    default:    return t.toUpperCase();
  }
}

export async function GET(): Promise<NextResponse> {
  const { userId, error } = await requireAuth();
  if (error) return error;
  const gate = await requireEntitlement(userId, "quantSuite");
  if (gate) return gate;

  if (!KEY || !SECRET) return NextResponse.json([]);

  try {
    const res = await fetch(`${BASE}/v2/orders?status=open&limit=500`, {
      headers: HEADERS,
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Alpaca ${res.status}: ${text}` }, { status: res.status });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[] = await res.json();
    const orders: Order[] = data.map((o) => ({
      id:     o.client_order_id?.slice(0, 8).toUpperCase() ?? o.id.slice(0, 8).toUpperCase(),
      side:   (o.side === "buy" ? "BUY" : "SELL") as OrderSide,
      ticker: o.symbol,
      qty:    parseFloat(o.qty ?? "0"),
      type:   mapType(o.type),
      px:     o.limit_price ? parseFloat(o.limit_price) : null,
      tif:    mapTif(o.time_in_force),
      filled: parseFloat(o.filled_qty ?? "0"),
      status: mapStatus(o.status),
    }));

    return NextResponse.json(orders);
  } catch (err) {
    console.error("[alpaca/orders GET]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const { userId, error } = await requireAuth();
  if (error) return error;
  const gate = await requireEntitlement(userId, "quantSuite");
  if (gate) return gate;

  if (!KEY || !SECRET) {
    return NextResponse.json({ error: "Alpaca not configured" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId");

  try {
    const url = orderId
      ? `${BASE}/v2/orders/${orderId}`
      : `${BASE}/v2/orders`;

    const res = await fetch(url, {
      method: "DELETE",
      headers: HEADERS,
      next: { revalidate: 0 },
    });

    return NextResponse.json({ ok: res.ok, status: res.status });
  } catch (err) {
    console.error("[alpaca/orders DELETE]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
