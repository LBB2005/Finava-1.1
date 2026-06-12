// Research · Themes lens — AI-generated baskets over the S&P 500.
//
// One Sonnet call proposes themes (name + thesis + constituent tickers); we
// validate every ticker against the real S&P 500 list and drop unknowns, so a
// hallucinated symbol never reaches the client. Cached in-process for a long TTL
// (themes are an editorial view, not a live feed) and de-duped across concurrent
// cold requests, mirroring /api/research/factors.

import { generate } from "@/lib/llm";
import { SP500 } from "@/lib/sp500";
import { requireAuth } from "@/lib/requireAuth";
import { rateLimitGuard } from "@/lib/rateLimit";
import type { Theme } from "@/lib/researchAI";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ThemesPayload {
  themes: Theme[];
  asOf: string;
}

const TTL_MS = 6 * 60 * 60 * 1000; // 6h — editorial, refreshes a few times a day
let cache: { at: number; data: ThemesPayload } | null = null;
let inflight: Promise<ThemesPayload> | null = null;

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

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "theme";

async function compute(): Promise<ThemesPayload> {
  const valid = new Map(SP500.map((c) => [c.ticker.toUpperCase(), c]));
  // A compact ticker list keeps the prompt grounded in the real universe.
  const universeList = SP500.map((c) => c.ticker).join(", ");

  const prompt = `You are Finava's market strategist. Group S&P 500 stocks into 6 distinct, investable THEMES that an investor would actually explore today (e.g. "AI Infrastructure", "Rate-Cut Winners", "Quality Compounders", "Reshoring & Industrials", "GLP-1 / Obesity", "Cash-Rich Defensives"). Make them genuinely different from each other.

ONLY use tickers from this S&P 500 universe:
${universeList}

For each theme give 5–8 of the best-fitting tickers from that list.

Respond with ONLY this JSON (no markdown):
{ "themes": [ { "name": "<theme name>", "thesis": "<1-2 sentence rationale>", "tickers": ["TICK", "..."] } ] }`;

  const raw = await generate({ agent: "themesGenerate", maxTokens: 1600, prompt });
  const p = parseJson(raw);
  const arr = Array.isArray(p?.themes) ? p!.themes : [];

  const themes: Theme[] = [];
  const usedKeys = new Set<string>();
  for (const t of arr) {
    const o = t as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    const thesis = typeof o.thesis === "string" ? o.thesis.trim() : "";
    if (!name) continue;
    const tickers = (Array.isArray(o.tickers) ? o.tickers : [])
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.toUpperCase())
      .filter((x) => valid.has(x));
    // Drop duplicates within a theme, keep order.
    const unique = Array.from(new Set(tickers));
    if (unique.length < 3) continue; // too thin after validation
    let key = slug(name);
    while (usedKeys.has(key)) key += "-x";
    usedKeys.add(key);
    themes.push({ key, name, thesis, tickers: unique.slice(0, 8) });
  }

  if (themes.length === 0) throw new Error("no valid themes produced");
  return { themes, asOf: new Date().toISOString() };
}

async function load(): Promise<ThemesPayload> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  if (!inflight) {
    inflight = compute()
      .then((data) => {
        cache = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export async function GET(req: Request) {
  // Authenticated, like the other research lenses — this fires a Sonnet call, so
  // it must not be open to the internet. A per-client rate limit caps cold-path
  // abuse even though warm results are served from the shared in-process cache.
  const { error } = await requireAuth();
  if (error) return error;
  const limited = rateLimitGuard(req, "research-themes", { capacity: 5, refillPerSec: 0.1 });
  if (limited) return limited;

  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json({ error: "AI service not configured (OPENROUTER_API_KEY missing)." }, { status: 503 });
  }
  try {
    const data = await load();
    return Response.json(data);
  } catch (err) {
    console.error("[research/themes]", err);
    return Response.json({ error: "Failed to generate themes." }, { status: 502 });
  }
}
