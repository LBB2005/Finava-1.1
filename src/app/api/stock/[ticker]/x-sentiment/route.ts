// X Chatter gauge (Grok x_search) — cached-first, like every AI surface on the
// stock page. GET serves the shared per-ticker cache (5h TTL in agentCache;
// market-wide data, deliberately not per-user) and never spends credits.
// POST computes a fresh read — authed, usage-gated, metered ~120 credits by
// getGrokSentiment — and caches it for everyone. Degraded reads (no real
// posts) are never cached and never rendered as a score.

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/requireAuth";
import { userRateLimit } from "@/lib/rateLimit";
import { checkUsageLimit, usageStore } from "@/lib/usage";
import { checkCache, saveCache } from "@/lib/agentMemory";
import { getGrokSentiment } from "@/lib/sentiment/grok";
import { getCompanyProfile } from "@/lib/finnhub";

const AGENT = "x-sentiment";

export interface XSentimentPayload {
  ticker: string;
  score: number; // 0-100 (Grok's [-1,+1] mapped)
  confidence: number; // 0-1
  foundPosts: number;
  detail: string;
  updatedAt: string;
}

function parseCached(raw: string | null): XSentimentPayload | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    return typeof p?.score === "number" && typeof p?.updatedAt === "string"
      ? (p as XSentimentPayload)
      : null;
  } catch {
    return null;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const symbol = (ticker ?? "").trim().toUpperCase();
  if (!symbol) return NextResponse.json({ error: "Missing ticker." }, { status: 400 });

  const cached = parseCached(await checkCache(AGENT, { ticker: symbol }));
  if (!cached) {
    return NextResponse.json(
      { error: "No X read yet for this ticker." },
      { status: 404 }
    );
  }
  return NextResponse.json(cached);
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { userId, error: authError } = await requireAuth();
  if (authError) return authError;
  const throttled = await userRateLimit(userId, "x-sentiment");
  if (throttled) return throttled;
  const limited = await checkUsageLimit(userId);
  if (limited) return limited;
  usageStore.enterWith({ userId });

  const { ticker } = await params;
  const symbol = (ticker ?? "").trim().toUpperCase();
  if (!symbol) return NextResponse.json({ error: "Missing ticker." }, { status: 400 });

  // Serve a still-fresh cache instead of double-spending on racing clicks.
  const cached = parseCached(await checkCache(AGENT, { ticker: symbol }));
  if (cached) return NextResponse.json(cached);

  const profile = await getCompanyProfile(symbol).catch(() => null);
  const name = (profile as { name?: string } | null)?.name;

  const read = await getGrokSentiment(symbol, name);
  if (!read || read.degraded || read.confidence === 0) {
    // Honest failure — no posts found or the search degraded. Nothing cached,
    // nothing fabricated (Data Accuracy Rule).
    return NextResponse.json(
      { error: "X search found no usable signal for this ticker right now." },
      { status: 502 }
    );
  }

  const payload: XSentimentPayload = {
    ticker: symbol,
    score: Math.round((read.score + 1) * 50),
    confidence: read.confidence,
    foundPosts: read.foundPosts,
    detail: read.detail,
    updatedAt: new Date().toISOString(),
  };
  await saveCache(AGENT, { ticker: symbol }, JSON.stringify(payload));
  return NextResponse.json(payload);
}
