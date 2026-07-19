// Money Map — streaming relationship web for the stock page.
//
// Emits `self` first, then the VERIFIED legs (peers + institutional/fund owners
// from Finnhub) as each resolves, then the AI-ESTIMATED leg (suppliers/customers
// extracted from the latest 10-K). Each relation is enqueued the instant it's
// ready so the graph fills progressively. Mirrors the finava-analysis SSE route.

import { requireAuth } from "@/lib/requireAuth";
import { checkUsageLimit, usageStore, makeRunContext } from "@/lib/usage";
import { userRateLimit } from "@/lib/rateLimit";
import { getCompanyProfile, getPeers, getOwnership, getFundOwnership } from "@/lib/finnhub";
import { runSupplyChainAgent } from "@/agents/sub-agents/supply-chain-agent";
import {
  relationsFromOwnership,
  relationsFromPeers,
  type MoneyMapEvent,
  type MoneyMapSelf,
  type MoneyRelation,
} from "@/lib/moneyMap";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { userId, error: authError } = await requireAuth();
  if (authError) return authError;
  const throttled = await userRateLimit(userId, "money-map");
  if (throttled) return throttled;
  const limited = await checkUsageLimit(userId);
  if (limited) return limited;
  usageStore.enterWith(makeRunContext(userId));

  const { ticker } = await params;
  const symbol = (ticker ?? "").trim().toUpperCase();
  if (!symbol) {
    return new Response(JSON.stringify({ error: "Missing ticker." }), { status: 400 });
  }

  // Lightweight self profile (name / sector / market cap for the centre node).
  let profile: Record<string, unknown> | null = null;
  try {
    profile = (await getCompanyProfile(symbol)) as Record<string, unknown>;
  } catch {
    /* degrade — centre node falls back to the bare symbol */
  }
  const self: MoneyMapSelf = {
    ticker: symbol,
    name: typeof profile?.name === "string" && profile.name ? profile.name : symbol,
    sector: typeof profile?.finnhubIndustry === "string" ? profile.finnhubIndustry : null,
    marketCap:
      typeof profile?.marketCapitalization === "number"
        ? profile.marketCapitalization * 1e6 // Finnhub reports millions
        : null,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: MoneyMapEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      const emit = (relations: MoneyRelation[]) =>
        relations.forEach((r) => send({ type: "relation", relation: r }));

      send({ type: "self", self });

      // ── Verified legs — fan out, emit each as it lands ──────────────────────
      const verified = await Promise.allSettled([
        getPeers(symbol).then((p) => emit(relationsFromPeers(p, symbol))),
        getOwnership(symbol).then((o) => emit(relationsFromOwnership(o, "Institutional"))),
        getFundOwnership(symbol).then((o) => emit(relationsFromOwnership(o, "Fund"))),
      ]);
      verified.forEach((r) => {
        if (r.status === "rejected") console.error("[money-map verified]", symbol, r.reason);
      });

      // ── AI-estimated leg — suppliers + customers from the 10-K ──────────────
      try {
        emit(await runSupplyChainAgent(symbol, self.name));
      } catch (err) {
        console.error("[money-map supply]", symbol, err);
      }

      send({ type: "done", generatedAt: new Date().toISOString() });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
