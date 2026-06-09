// Research · Screen lens — three AI jobs behind one POST, switched by `mode`:
//   parse      { query }            → { filter, interpretation }   (Haiku)
//   commentary { query, stocks }    → { commentary, standout, watchout } (Flash)
//   suggest    { summary }          → { screens: [...] }           (Flash)
//
// Filtering itself is pure + client-side (lib/screen.ts applyScreen); the model
// only translates language ↔ structure and writes color. Failure-isolated.

import { generate } from "@/lib/llm";
import { requireAuth } from "@/lib/requireAuth";
import { checkUsageLimit, usageStore } from "@/lib/usage";
import { FACTORS } from "@/lib/research";
import { coerceFilter } from "@/lib/screen";
import type { ScreenCommentary, SuggestedScreen } from "@/lib/researchAI";

export const runtime = "nodejs";
export const maxDuration = 60;

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

const FACTOR_GLOSSARY = FACTORS.map((f) => `${f.key} = ${f.full}`).join(", ");

const FILTER_SCHEMA = `The ScreenFilter JSON shape (omit any field you don't need):
{
  "factors": { "<factorKey>": { "min": <0-100>, "max": <0-100> } },   // factor sub-scores, sector-relative
  "sectors": ["<GICS sector name>"],
  "maxPe": <number>, "minPe": <number>,
  "minMarketCap": <USD absolute, e.g. 1e10 for $10B>, "maxMarketCap": <USD>,
  "minChg": <today % move>, "maxChg": <today % move>,
  "sort": { "key": "<factorKey|score|chg|marketCap>", "dir": "asc|desc" },
  "limit": <max names, default 40>
}
Factor keys: ${FACTOR_GLOSSARY}. "Cheap/value" → value.min high. "Strong momentum" → mom.min high. "Quality/profitable" → quality.min high. "Low debt/healthy" → health.min high. Higher sub-score is always better, including value (high value score = cheaper).`;

async function handleParse(query: string) {
  const prompt = `Translate this stock-screen request into a ScreenFilter JSON object.

Request: "${query}"

${FILTER_SCHEMA}

Respond with ONLY this JSON (no markdown):
{ "filter": <ScreenFilter>, "interpretation": "<one sentence restating the screen in plain English>" }`;
  const raw = await generate({ agent: "screenParse", maxTokens: 600, prompt });
  const p = parseJson(raw);
  if (!p) throw new Error("unparseable filter");
  const filter = coerceFilter(p.filter);
  const interpretation =
    typeof p.interpretation === "string" && p.interpretation.trim()
      ? p.interpretation.trim()
      : "Screening the S&P 500 on your criteria.";
  return Response.json({ filter, interpretation });
}

async function handleCommentary(query: string, stocks: unknown) {
  const list = Array.isArray(stocks) ? stocks.slice(0, 20) : [];
  const lines = list
    .map((s) => {
      const o = s as Record<string, unknown>;
      return `- ${o.ticker} (${o.name}, ${o.sector}): score ${o.score}`;
    })
    .join("\n");
  const prompt = `A user screened the S&P 500 with: "${query}". These names passed:\n${lines}\n\nWrite a short read on the resulting basket. This is research color, not advice.\n\nRespond with ONLY this JSON (no markdown):\n{ "commentary": "<2-3 sentences on what these names have in common>", "standout": "<the single most interesting name and why, one sentence>", "watchout": "<the main risk or caveat for this group, one sentence>" }`;
  const raw = await generate({ agent: "screenRead", maxTokens: 600, prompt });
  const p = parseJson(raw);
  const out: ScreenCommentary = {
    commentary: typeof p?.commentary === "string" ? p.commentary.trim() : "",
    standout: typeof p?.standout === "string" ? p.standout.trim() : "",
    watchout: typeof p?.watchout === "string" ? p.watchout.trim() : "",
  };
  return Response.json(out);
}

async function handleSuggest(summary: unknown) {
  const digest = typeof summary === "string" ? summary : JSON.stringify(summary ?? {});
  const prompt = `Here is a snapshot of the current S&P 500 tape:\n${digest}\n\nPropose 4 timely stock screens a user might want to run right now, grounded in this snapshot. Each needs a short chip label, a one-line rationale, and a natural-language query the screener can parse.\n\nRespond with ONLY this JSON (no markdown):\n{ "screens": [ { "label": "<≤4 words>", "rationale": "<one line>", "query": "<natural-language screen request>" } ] }`;
  const raw = await generate({ agent: "screenSuggest", maxTokens: 700, prompt });
  const p = parseJson(raw);
  const arr = Array.isArray(p?.screens) ? p!.screens : [];
  const screens: SuggestedScreen[] = arr
    .map((s: unknown) => {
      const o = s as Record<string, unknown>;
      return {
        label: typeof o.label === "string" ? o.label.trim() : "",
        rationale: typeof o.rationale === "string" ? o.rationale.trim() : "",
        query: typeof o.query === "string" ? o.query.trim() : "",
      };
    })
    .filter((s: SuggestedScreen) => s.label && s.query)
    .slice(0, 4);
  return Response.json({ screens });
}

export async function POST(req: Request) {
  const { userId, error: authError } = await requireAuth();
  if (authError) return authError;
  const limited = await checkUsageLimit(userId);
  if (limited) return limited;
  usageStore.enterWith({ userId });

  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json({ error: "AI service not configured (OPENROUTER_API_KEY missing)." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const mode = body.mode;
  try {
    if (mode === "parse") {
      const query = typeof body.query === "string" ? body.query.trim() : "";
      if (!query) return Response.json({ error: "Empty query." }, { status: 400 });
      return await handleParse(query);
    }
    if (mode === "commentary") {
      const query = typeof body.query === "string" ? body.query.trim() : "";
      return await handleCommentary(query, body.stocks);
    }
    if (mode === "suggest") {
      return await handleSuggest(body.summary);
    }
    return Response.json({ error: "Unknown mode." }, { status: 400 });
  } catch (err) {
    console.error("[research/screen]", mode, err);
    return Response.json({ error: "The screener AI failed. Try again." }, { status: 502 });
  }
}
