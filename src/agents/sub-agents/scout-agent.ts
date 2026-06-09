// Discovery scout — scans the FULL ~503-name factor universe and fit-ranks it to
// the user's query. Unlike the Themes lens (which feeds the LLM only tickers and
// leans on its pretrained priors → famous mega-caps), the scout feeds the LLM the
// REAL computed factor scores + sector + price + market cap + P/E for every name,
// and instructs it to rank by data fit, not fame. That grounding is what stops
// "what should I buy?" from always returning NVDA/MSFT.
//
// Returns the model-facing tool-result STRING (so the CEO loop can hand it back to
// the model) and emits the structured discovery events itself (scout_complete /
// deep_shortlist / discover_clarify).

import { generate } from "@/lib/llm";
import { getFactorUniverse } from "@/lib/factorUniverse";
import { ranked, type RankedStock } from "@/lib/research";
import { coerceFilter, applyScreen, type ScreenFilter } from "@/lib/screen";
import type { AgentEvent } from "@/types/chat";
import type { DiscoverTier, ScoutPick } from "@/lib/scoutTypes";

type EventEmitter = (event: AgentEvent) => void;

interface ScoutInput {
  query?: string;
  tier?: DiscoverTier;
  sector?: string;
  limit?: number;
}

const QUICK_N = 5;
const DEEP_N = 20;

// ── Vague-query gate ─────────────────────────────────────────────────────────
// The user opted for "ask one clarifying question" on truly open-ended asks. We
// only clarify when the query carries NO usable signal — better to under-clarify
// than nag. Any sector, style, valuation, size, or numeric cue means "proceed".
const SIGNAL = new RegExp(
  [
    // styles / factors
    "value|growth|momentum|quality|cheap|expensive|undervalued|overvalued|dividend|income|yield|defensive|aggressive|turnaround|beaten|oversold|overbought|breakout|compounder|moat|safe|risky|speculative|contrarian",
    // size
    "small[- ]?cap|mid[- ]?cap|large[- ]?cap|mega[- ]?cap|small|microcap",
    // sectors / industries
    "energy|tech|technolog|health|healthcare|pharma|biotech|financ|bank|industrial|consumer|staple|discretion|utilit|material|real estate|reit|communicat|semiconductor|chip|software|ai|airline|retail|auto|oil|gas|insur|media|telecom",
    // valuation / numeric cues
    "p/?e|pe ratio|under|over|below|above|less than|more than|cap|\\$|%|earnings|revenue|margin|fcf|debt",
  ].join("|"),
  "i"
);

function needsClarify(query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  if (SIGNAL.test(q)) return false;
  // No signal: clarify only if it's short/generic (a long descriptive ask without
  // our keywords is probably still specific — let the LLM handle it).
  return q.split(/\s+/).length <= 6;
}

const CLARIFY_CHIPS = [
  "Growth & momentum",
  "Value & income",
  "Quality compounders",
  "A specific sector",
];

// ── JSON extraction (mirrors the research routes) ────────────────────────────
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

function fmtCap(cap?: number | null): string {
  if (cap == null || !Number.isFinite(cap)) return "—";
  if (cap >= 1e12) return `${(cap / 1e12).toFixed(1)}T`;
  if (cap >= 1e9) return `${(cap / 1e9).toFixed(0)}B`;
  if (cap >= 1e6) return `${(cap / 1e6).toFixed(0)}M`;
  return `${cap}`;
}

/** Extract only the HARD (deterministic) constraints from a parsed screen filter;
 *  factor bands are left for the LLM to judge as fit, so we don't pre-prune the
 *  universe on soft style cues ("growth") — only on real limits (sector, $, P/E). */
function hardConstraints(filter: ScreenFilter, sector?: string): ScreenFilter | null {
  const hard: ScreenFilter = {};
  if (filter.sectors?.length) hard.sectors = filter.sectors;
  if (sector) hard.sectors = [...(hard.sectors ?? []), sector];
  if (filter.maxPe != null) hard.maxPe = filter.maxPe;
  if (filter.minPe != null) hard.minPe = filter.minPe;
  if (filter.maxPrice != null) hard.maxPrice = filter.maxPrice;
  if (filter.minPrice != null) hard.minPrice = filter.minPrice;
  if (filter.minMarketCap != null) hard.minMarketCap = filter.minMarketCap;
  if (filter.maxMarketCap != null) hard.maxMarketCap = filter.maxMarketCap;
  if (filter.minChg != null) hard.minChg = filter.minChg;
  if (filter.maxChg != null) hard.maxChg = filter.maxChg;
  return Object.keys(hard).length ? hard : null;
}

export async function runScoutAgent(input: unknown, emit: EventEmitter): Promise<string> {
  const { query = "", tier = "quick", sector, limit }: ScoutInput =
    (input as ScoutInput) ?? {};
  const n = Math.max(1, Math.min(40, limit ?? (tier === "deep" ? DEEP_N : QUICK_N)));

  // 1) Vague-query gate.
  if (needsClarify(query)) {
    emit({
      type: "discover_clarify",
      question: "Happy to dig in — what kind of names are you after?",
      chips: CLARIFY_CHIPS,
    });
    return "You asked the user a clarifying question (quick-reply chips are shown). Reply with ONE short, friendly sentence inviting them to pick a direction, then STOP — do not call any tools.";
  }

  // 2) Score the whole universe (shared 15-min memo).
  const universe = await getFactorUniverse();
  const yearRanked = ranked("year", universe.stocks); // score/grade per name
  const byTicker = new Map<string, RankedStock>(yearRanked.map((s) => [s.ticker, s]));

  // 3) Optional deterministic hard filter (sector / $ / P/E / move). Soft style
  //    cues are left to the LLM. screenParse also gives a nice interpretation line.
  let pool: RankedStock[] = yearRanked;
  let interpretation = `Scanning all ${universe.coverage.total} S&P 500 names for "${query}".`;
  try {
    const raw = await generate({
      agent: "screenParse",
      maxTokens: 500,
      prompt: `Translate this stock request into a ScreenFilter JSON (omit fields you don't need). Only include hard limits the user EXPLICITLY stated: sectors, maxPe/minPe, maxPrice/minPrice (per-share $, e.g. "under $50" → maxPrice: 50), min/maxMarketCap (absolute USD), min/maxChg. Do NOT invent numeric limits.\n\nRequest: "${query}"\n\nRespond with ONLY: { "filter": <ScreenFilter>, "interpretation": "<one sentence>" }`,
    });
    const p = parseJson(raw);
    if (p) {
      if (typeof p.interpretation === "string" && p.interpretation.trim()) {
        interpretation = p.interpretation.trim();
      }
      const hard = hardConstraints(coerceFilter(p.filter), sector);
      if (hard) {
        const survivors = applyScreen(universe.stocks, { ...hard, limit: 200 });
        if (survivors.length >= n) pool = survivors;
      }
    }
  } catch {
    // Screen parse is best-effort — fall back to the full universe.
  }

  // 4) Build a compact, data-grounded table and fit-rank it in ONE LLM call.
  const table = pool
    .map(
      (s) =>
        `${s.ticker}|${s.name}|${s.sector}|$${Math.round(s.price)}|${fmtCap(s.marketCap)}|${
          s.pe != null && s.pe > 0 ? s.pe.toFixed(0) : "—"
        }|${s.f.mom},${s.f.growth},${s.f.quality},${s.f.analyst},${s.f.value},${s.f.health}`
    )
    .join("\n");

  const prompt = `You are Finava's discovery scout. From the universe below, pick and RANK the ${n} stocks that BEST fit the user's request.

Request: "${query}"

Each row is: TICKER|Name|Sector|Price|MktCap|P/E|mom,growth,quality,analyst,value,health
Factor scores are 0–100, sector-relative, higher = better — INCLUDING value (high value score = cheaper).

Rules:
- Rank ONLY on the supplied data + the request. Do NOT favour a company because it is famous or large. Mega-caps should appear only when they genuinely fit.
- Honour explicit constraints in the request (sector, price, valuation, size).
- Pick EXACTLY ${n} distinct tickers, only from this list.

Universe:
${table}

Output ONLY the JSON below — no preamble, no markdown, no trailing commentary:
{ "picks": [ { "ticker": "TICK", "reason": "<≤12 words on why it fits>" }, ... ] }`;

  let picks: ScoutPick[] = [];
  try {
    // Generous cap: deep returns 20 picks with reasons; truncation breaks the JSON.
    const raw = await generate({ agent: "scoutSelect", maxTokens: 4000, prompt });
    const p = parseJson(raw);
    const arr = Array.isArray(p?.picks) ? p!.picks : [];
    const seen = new Set<string>();
    for (const item of arr) {
      const o = item as Record<string, unknown>;
      const t = typeof o.ticker === "string" ? o.ticker.toUpperCase().trim() : "";
      const stock = byTicker.get(t);
      if (!stock || seen.has(t)) continue; // validate against the real universe
      seen.add(t);
      picks.push({
        ticker: stock.ticker,
        name: stock.name,
        sector: stock.sector,
        score: stock.score,
        grade: stock.grade,
        fitRank: picks.length + 1,
        f: stock.f,
        reason: typeof o.reason === "string" ? o.reason.trim() : "",
        marketCap: stock.marketCap,
        pe: stock.pe,
        price: stock.price,
      });
      if (picks.length >= n) break;
    }
  } catch {
    picks = [];
  }

  // Fallback: if the LLM produced nothing usable, take the top of the pool so the
  // funnel never dead-ends (rare — empty completions throw upstream).
  if (picks.length === 0) {
    picks = pool.slice(0, n).map((s, i) => ({
      ticker: s.ticker,
      name: s.name,
      sector: s.sector,
      score: s.score,
      grade: s.grade,
      fitRank: i + 1,
      f: s.f,
      reason: "Top factor fit for your request.",
      marketCap: s.marketCap,
      pe: s.pe,
      price: s.price,
    }));
  }

  // 5) Emit the structured event + return the model-facing instruction string.
  if (tier === "deep") {
    emit({ type: "deep_shortlist", query, interpretation, picks });
    const tickerList = picks.map((p) => p.ticker).join(", ");
    return `Shortlist of ${picks.length} names emitted to the client, which will now run the full analyst crew on them in waves and rank them. The shortlist is: ${tickerList}. Write ONE sentence telling the user you're deep-diving these ${picks.length} names — you may name 2–3 tickers but ONLY from that shortlist (NEVER a ticker that isn't in it). Then STOP — do not call any tools.`;
  }

  emit({ type: "scout_complete", tier: "quick", query, interpretation, picks });
  const lines = picks
    .map(
      (p) =>
        `${p.fitRank}. ${p.ticker} (${p.name}, ${p.sector}) — Finava Score ${p.score} (${p.grade}); fit: ${p.reason}`
    )
    .join("\n");
  return `Scout scanned the whole S&P 500 and selected EXACTLY these ${picks.length} names for "${query}" (${interpretation}):
${lines}

Write a concise, engaging recommendation covering EXACTLY these ${picks.length} tickers and NO OTHERS. Hard rules:
- Do NOT mention, recommend, rank, or chart any ticker that is not in the list above — not even famous names (NVDA, MSFT, META, etc.). These picks ARE the answer; do not substitute your own ideas.
- Do NOT reference the user's portfolio, holdings, or available cash.
Reference each by its ticker, explain the fit in 1–2 lines, and call out the single best idea. Include one \`\`\`chart\`\`\` bar chart titled "Finava Score" of THESE names' scores. Keep it tight; do not call any tools.`;
}
