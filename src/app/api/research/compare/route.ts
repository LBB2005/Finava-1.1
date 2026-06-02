// Research · Compare lens — head-to-head verdict.
//
// The client already holds the scored factor universe, so it POSTs the 2–5
// selected stocks (factor sub-scores + live market data) and we ask one Sonnet
// agent to judge them. Non-streaming JSON: fast enough at ≤5 names, and the UI
// shows a single loading state. Failure-isolated like the other AI routes.

import { generate } from "@/lib/llm";
import { requireAuth } from "@/lib/requireAuth";
import { FACTORS } from "@/lib/research";
import type { CompareStock, CompareVerdict, ComparePerStock } from "@/lib/researchAI";

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

function fmtCap(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "n/a";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}

function describe(s: CompareStock): string {
  const factors = FACTORS.map((f) => `${f.label} ${s.f[f.key]}`).join(", ");
  const pe = s.pe != null && s.pe > 0 ? s.pe.toFixed(1) : "n/a";
  return `${s.ticker} (${s.name}, ${s.sector}): price $${s.price.toFixed(2)} (${s.chg >= 0 ? "+" : ""}${s.chg.toFixed(2)}% today), P/E ${pe}, market cap ${fmtCap(s.marketCap)}. Factor scores 0–100 (sector-relative): ${factors}.`;
}

export async function POST(req: Request) {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json({ error: "AI service not configured (OPENROUTER_API_KEY missing)." }, { status: 503 });
  }

  let stocks: CompareStock[] = [];
  try {
    const body = (await req.json()) as { stocks?: CompareStock[] };
    stocks = Array.isArray(body.stocks) ? body.stocks.slice(0, 5) : [];
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (stocks.length < 2) {
    return Response.json({ error: "Pick at least two stocks to compare." }, { status: 400 });
  }

  const tickers = stocks.map((s) => s.ticker);
  const prompt = `You are Lucra's lead equity analyst comparing these ${stocks.length} stocks head-to-head for a retail investor. This is research color, not advice.

${stocks.map(describe).join("\n\n")}

Judge them against each other on the merits of the factor scores and market data above. Pick the single strongest overall pick (or leave "winner" as "" only if it is a genuine toss-up). Be specific and reference the numbers.

Respond with ONLY this JSON (no markdown):
{
  "winner": "<ticker from ${tickers.join("/")} or empty string>",
  "summary": "<2-3 sentence head-to-head verdict>",
  "perStock": [
    { "ticker": "<ticker>", "oneLiner": "<one sentence characterising it>", "bullCase": "<one sentence>", "bearCase": "<one sentence>" }
  ]
}
Include one perStock entry for every ticker.`;

  let raw: string;
  try {
    raw = await generate({ agent: "compareVerdict", maxTokens: 1100, prompt });
  } catch (err) {
    console.error("[research/compare]", err);
    return Response.json({ error: "The comparison could not be generated. Try again." }, { status: 502 });
  }

  const p = parseJson(raw);
  if (!p) {
    return Response.json({ error: "The comparison returned an unreadable result. Try again." }, { status: 502 });
  }

  const valid = new Set(tickers);
  const winner = typeof p.winner === "string" && valid.has(p.winner) ? p.winner : "";
  const perStockRaw = Array.isArray(p.perStock) ? p.perStock : [];
  const byTicker = new Map<string, ComparePerStock>();
  for (const e of perStockRaw) {
    const o = e as Record<string, unknown>;
    const t = typeof o.ticker === "string" ? o.ticker.toUpperCase() : "";
    if (!valid.has(t) || byTicker.has(t)) continue;
    byTicker.set(t, {
      ticker: t,
      oneLiner: typeof o.oneLiner === "string" ? o.oneLiner.trim() : "",
      bullCase: typeof o.bullCase === "string" ? o.bullCase.trim() : "",
      bearCase: typeof o.bearCase === "string" ? o.bearCase.trim() : "",
    });
  }
  // Ensure every requested ticker has an entry (fill blanks rather than drop).
  const perStock: ComparePerStock[] = tickers.map(
    (t) => byTicker.get(t) ?? { ticker: t, oneLiner: "", bullCase: "", bearCase: "" }
  );

  const verdict: CompareVerdict = {
    winner,
    summary: typeof p.summary === "string" ? p.summary.trim() : "",
    perStock,
  };
  return Response.json({ verdict });
}
