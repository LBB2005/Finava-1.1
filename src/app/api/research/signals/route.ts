// Research · Signals lens — narrate cross-sectional events.
//
// The client derives REAL events from the live factor universe (lib/signals.ts)
// and POSTs the top ~12. One Flash-Lite agent narrates the whole batch in a
// single call (cheap, one round-trip) into readable feed items. The events are
// facts; the AI only writes the headline + take.

import { generate } from "@/lib/llm";
import { requireAuth } from "@/lib/requireAuth";
import {
  SIGNAL_CATEGORY_LABEL,
  type SignalEvent,
  type SignalFeedItem,
  type SignalCategory,
} from "@/lib/researchAI";

export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_CATEGORIES = new Set<SignalCategory>(
  Object.keys(SIGNAL_CATEGORY_LABEL) as SignalCategory[]
);

function parseJson(raw: string): Record<string, unknown> | null {
  const fenced = raw.replace(/```(?:json)?/gi, "");
  const match = fenced.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function leanSentiment(lean: number): SignalFeedItem["sentiment"] {
  if (lean >= 0.25) return "bullish";
  if (lean <= -0.25) return "bearish";
  return "neutral";
}

export async function POST(req: Request) {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json({ error: "AI service not configured (OPENROUTER_API_KEY missing)." }, { status: 503 });
  }

  let events: SignalEvent[] = [];
  try {
    const body = (await req.json()) as { events?: SignalEvent[] };
    events = Array.isArray(body.events) ? body.events.slice(0, 14) : [];
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (events.length === 0) return Response.json({ feed: [] });

  const lines = events
    .map(
      (e, i) =>
        `${i + 1}. ${e.ticker} (${e.name}, ${e.sector}) — ${SIGNAL_CATEGORY_LABEL[e.category]}: ${e.fact}`
    )
    .join("\n");

  const prompt = `You are Lucra's markets desk writing a live signals feed. Each numbered item below is a REAL, data-derived event across the S&P 500. Write a punchy headline and a 1-2 sentence take for each, in order. This is research color, not advice — don't invent facts beyond what's given.

${lines}

Respond with ONLY this JSON (no markdown):
{ "items": [ { "n": <item number>, "headline": "<≤9 words>", "take": "<1-2 sentences>" } ] }`;

  let raw: string;
  try {
    raw = await generate({ agent: "signalsNarrate", maxTokens: 1400, prompt });
  } catch (err) {
    console.error("[research/signals]", err);
    return Response.json({ error: "The signals feed could not be generated." }, { status: 502 });
  }

  const p = parseJson(raw);
  const narr = new Map<number, { headline: string; take: string }>();
  if (Array.isArray(p?.items)) {
    for (const it of p!.items) {
      const o = it as Record<string, unknown>;
      const n = typeof o.n === "number" ? o.n : NaN;
      if (!Number.isInteger(n)) continue;
      narr.set(n, {
        headline: typeof o.headline === "string" ? o.headline.trim() : "",
        take: typeof o.take === "string" ? o.take.trim() : "",
      });
    }
  }

  const feed: SignalFeedItem[] = events.map((e, i) => {
    const n = narr.get(i + 1);
    const category = VALID_CATEGORIES.has(e.category) ? e.category : "mover";
    return {
      ticker: e.ticker,
      category,
      headline: n?.headline || `${e.ticker} — ${SIGNAL_CATEGORY_LABEL[category]}`,
      take: n?.take || e.fact,
      sentiment: leanSentiment(e.lean),
    };
  });

  return Response.json({ feed });
}
