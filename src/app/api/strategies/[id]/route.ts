import { NextResponse } from "next/server";
import { db, serializeDoc } from "@/lib/firebase-admin";
import { apiError } from "@/lib/apiError";
import { requireEntitlement } from "@/lib/entitlements";
import { withRoute } from "@/lib/withRoute";
import { UpdateStrategySchema } from "@/lib/schemas/strategy";
import { isPaperTradingHost } from "@/lib/alpaca";
import fs from "fs";
import path from "path";
import type { Strategy } from "@/components/hedge-fund/types";

const ALPACA_KEY    = process.env.ALPACA_API_KEY    ?? "";
const ALPACA_SECRET = process.env.ALPACA_API_SECRET ?? "";
const ALPACA_BASE   = process.env.ALPACA_BASE_URL   ?? "https://paper-api.alpaca.markets";
const ALPACA_HEADERS = {
  "APCA-API-KEY-ID":     ALPACA_KEY,
  "APCA-API-SECRET-KEY": ALPACA_SECRET,
};

const BOT_STATUS_PATH = process.env.BOT_STATUS_PATH
  ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "trading bot 1.0", "status.json");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toStrategy(row: any): Strategy {
  return {
    id:        row.id,
    name:      row.name,
    tag:       row.tag,
    desc:      row.desc,
    tickers:   JSON.parse(row.tickers || "[]"),
    config:    JSON.parse(row.config  || "{}"),
    research:  row.research || "",
    sharpe:    row.sharpe,
    cagr:      row.cagr,
    maxDD:     row.maxDD,
    winRate:   row.winRate,
    active:    row.active,
    lastTrade: row.lastTrade,
  };
}

export const PATCH = withRoute(
  { body: UpdateStrategySchema },
  async ({ userId, body }, { params }: { params: Promise<{ id: string }> }) => {
  const gate = await requireEntitlement(userId, "quantSuite");
  if (gate) return gate;
    const { id } = await params;

    const data: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (body.active    !== undefined) data.active    = body.active;
    if (body.name      !== undefined) data.name      = body.name;
    if (body.tag       !== undefined) data.tag       = body.tag;
    if (body.desc      !== undefined) data.desc      = body.desc;
    if (body.tickers   !== undefined) data.tickers   = JSON.stringify(body.tickers);
    if (body.config    !== undefined) data.config    = JSON.stringify(body.config);
    if (body.research  !== undefined) data.research  = body.research;
    if (body.lastTrade !== undefined) data.lastTrade = body.lastTrade;

    const docRef = db.collection("users").doc(userId).collection("strategies").doc(id);
    await docRef.update(data);
    const snap = await docRef.get();
    return NextResponse.json(toStrategy(serializeDoc(snap.id, snap.data()!)));
  }
);

export const DELETE = withRoute(
  {},
  async ({ userId }, { params }: { params: Promise<{ id: string }> }) => {
  const gate = await requireEntitlement(userId, "quantSuite");
  if (gate) return gate;
    const { id } = await params;

    const docRef = db.collection("users").doc(userId).collection("strategies").doc(id);
    const stratSnap = await docRef.get();
    if (!stratSnap.exists) {
      return apiError("not_found", "Not found", 404);
    }
    const strategy = stratSnap.data()!;
    const tickers: string[] = JSON.parse(strategy.tickers || "[]");

    // Cancel open Alpaca orders for this strategy's tickers. Refuse to touch a
    // live trading host — cancellation runs against the one shared brokerage
    // account, so it is allowed only against the paper sandbox.
    if (ALPACA_KEY && ALPACA_SECRET && tickers.length > 0 && isPaperTradingHost(ALPACA_BASE)) {
      try {
        const ordersRes = await fetch(`${ALPACA_BASE}/v2/orders?status=open&limit=500`, {
          headers: ALPACA_HEADERS,
        });
        if (ordersRes.ok) {
          const orders = await ordersRes.json() as Array<{ id: string; symbol: string }>;
          const toCancel = orders.filter((o) => tickers.includes(o.symbol));
          await Promise.allSettled(
            toCancel.map((o) =>
              fetch(`${ALPACA_BASE}/v2/orders/${o.id}`, {
                method: "DELETE",
                headers: ALPACA_HEADERS,
              })
            )
          );
        }
      } catch (err) {
        console.error("[strategy DELETE] Alpaca cancel error:", err);
      }
    }

    // Remove from bot status.json if it exists
    try {
      if (fs.existsSync(/*turbopackIgnore: true*/ BOT_STATUS_PATH)) {
        const raw = fs.readFileSync(/*turbopackIgnore: true*/ BOT_STATUS_PATH, "utf-8");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const status: any = JSON.parse(raw);
        if (Array.isArray(status.strategies)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          status.strategies = status.strategies.filter((s: any) => s.id !== id);
          fs.writeFileSync(BOT_STATUS_PATH, JSON.stringify(status, null, 2));
        }
      }
    } catch (err) {
      console.error("[strategy DELETE] Bot status update error:", err);
    }

    await docRef.delete();
    return NextResponse.json({ ok: true });
  }
);
