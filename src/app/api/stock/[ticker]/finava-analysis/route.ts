// Finava Analysis — multi-agent, streaming. The FINAVA tab POSTs here on click.
//
// Five signal agents (fundamentals, momentum, sentiment, analyst, insider) run in
// parallel; each is enqueued onto the SSE stream the instant it resolves, so the
// UI fills its signal bars in progressively. Once all five land, a synthesis agent
// (Sonnet) weighs them into an overall score, fair value, written verdict and
// catalyst/risk lists, emitted as a final `verdict` event.
//
// Failure-isolated: a signal agent that errors or returns junk degrades to a
// neutral 50 card rather than killing the stream. Synthesis failure emits an
// `error` event the client turns into a retry.

import { generate } from "@/lib/llm";
import { requireAuth } from "@/lib/requireAuth";
import { checkUsageLimit, usageStore } from "@/lib/usage";
import { userRateLimit } from "@/lib/rateLimit";
import { getStockBundle } from "@/lib/stockData";
import {
  getCikByTicker,
  getCompanyFacts,
  extractFinancialMetrics,
  extractFundamentalTimeSeries,
} from "@/lib/edgar";
import { getBasicFinancials } from "@/lib/finnhub";
import {
  suggestedWaccFromBeta,
  defaultFairValue,
  type DcfInputs,
} from "@/lib/dcf";
import {
  SIGNAL_LABELS,
  stanceFromScore,
  verdictLabel,
  type FinavaSignal,
  type FinavaVerdict,
  type SignalKey,
  type FinavaEvent,
} from "@/lib/finava";
import { fenceExternal, EXTERNAL_DATA_RULE } from "@/lib/externalContent";

export const runtime = "nodejs";
export const maxDuration = 60;

const JSON_RULES =
  'Respond with ONLY a JSON object, no prose, no markdown fence: {"score": <0-100 integer, 50=neutral>, "headline": "<≤8 words>", "detail": "<1-2 sentences, specific to the numbers given>"}. Higher score = more bullish.';

function fmt(n: number | null | undefined, d = 1): string {
  return typeof n === "number" && Number.isFinite(n)
    ? n.toLocaleString("en-US", { maximumFractionDigits: d })
    : "n/a";
}
function bn(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? `$${(n / 1e9).toFixed(1)}B` : "n/a";
}

/** Pull the first JSON object out of a model response, tolerating code fences. */
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

function toSignal(key: SignalKey, parsed: Record<string, unknown> | null): FinavaSignal {
  const rawScore = typeof parsed?.score === "number" ? parsed.score : 50;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  const headline =
    typeof parsed?.headline === "string" && parsed.headline.trim()
      ? parsed.headline.trim()
      : "No clear read";
  const detail =
    typeof parsed?.detail === "string" && parsed.detail.trim()
      ? parsed.detail.trim()
      : "Insufficient data for a confident signal.";
  return { key, label: SIGNAL_LABELS[key], score, stance: stanceFromScore(score), headline, detail };
}

function neutralSignal(key: SignalKey): FinavaSignal {
  return {
    key,
    label: SIGNAL_LABELS[key],
    score: 50,
    stance: "neutral",
    headline: "Signal unavailable",
    detail: "This signal could not be computed for this symbol.",
  };
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { userId, error: authError } = await requireAuth();
  if (authError) return authError;
  const throttled = userRateLimit(userId, "finava-analysis");
  if (throttled) return throttled;
  const limited = await checkUsageLimit(userId);
  if (limited) return limited;
  usageStore.enterWith({ userId });

  const { ticker } = await params;
  const symbol = (ticker ?? "").trim().toUpperCase();
  if (!symbol) {
    return new Response(JSON.stringify({ error: "Missing ticker." }), { status: 400 });
  }
  if (!process.env.OPENROUTER_API_KEY) {
    return new Response(
      JSON.stringify({ error: "AI service not configured (OPENROUTER_API_KEY missing)." }),
      { status: 503 }
    );
  }

  const bundle = await getStockBundle(symbol);
  if (!bundle.quote && !bundle.profile) {
    return new Response(JSON.stringify({ error: `Couldn't find ${symbol}.` }), { status: 404 });
  }

  const name = bundle.profile?.name ?? symbol;
  const price = bundle.quote?.price ?? null;
  const ks = bundle.keyStats;
  const an = bundle.analysts;
  const fund = bundle.fundamentals;

  // ── DCF fair value (best-effort, for the valuation comparison) ───────────────
  let dcfFair: number | null = null;
  try {
    const cik = await getCikByTicker(symbol);
    if (cik) {
      const [facts, basics] = await Promise.all([
        getCompanyFacts(cik),
        getBasicFinancials(symbol).catch(() => null),
      ]);
      const m = extractFinancialMetrics(facts);
      const series = extractFundamentalTimeSeries(facts, 6);
      const ocf = typeof m.operatingCashFlow === "number" ? m.operatingCashFlow : null;
      const capex = typeof m.capex === "number" ? m.capex : null;
      const baseFcf = ocf != null ? (capex != null ? ocf - capex : ocf) : null;
      const beta =
        (basics as { metric?: Record<string, unknown> } | null)?.metric?.beta;
      const rev = series.revenue;
      const cagr =
        rev.length >= 2 && rev[0].value > 0 && rev.at(-1)!.value > 0
          ? Math.pow(rev.at(-1)!.value / rev[0].value, 1 / (rev.length - 1)) - 1
          : null;
      const inputs: DcfInputs = {
        baseFcf,
        fcfIsProxy: capex == null,
        sharesOutstanding: typeof m.sharesOutstanding === "number" ? m.sharesOutstanding : null,
        netDebt:
          (typeof m.totalDebt === "number" ? m.totalDebt : 0) -
          (typeof m.cash === "number" ? m.cash : 0),
        historicalGrowth: cagr,
        suggestedWacc: suggestedWaccFromBeta(typeof beta === "number" ? beta : null),
        currentPrice: price,
        currency: bundle.profile?.currency ?? "USD",
      };
      dcfFair = defaultFairValue(inputs);
    }
  } catch {
    dcfFair = null;
  }

  // ── Per-signal context + agent wiring ────────────────────────────────────────
  const pos52 =
    ks?.high52 != null && ks?.low52 != null && price != null
      ? ((price - ks.low52) / (ks.high52 - ks.low52 || 1)) * 100
      : null;

  const fundCtx = fund
    ? `Revenue: ${fund.revenue.slice(-4).map((r) => `${r.year}=${bn(r.value)}`).join(", ") || "n/a"}. ` +
      `Net income: ${fund.netIncome.slice(-4).map((r) => `${r.year}=${bn(r.value)}`).join(", ") || "n/a"}. ` +
      `Operating cash flow: ${fund.operatingCashFlow.slice(-3).map((r) => `${r.year}=${bn(r.value)}`).join(", ") || "n/a"}. ` +
      `Total debt latest: ${bn(fund.totalDebt.at(-1)?.value)}.`
    : "No fundamental filings available.";

  const momCtx = `Price $${fmt(price, 2)} (${fmt(bundle.quote?.changePct, 2)}% today). ` +
    `52-week range $${fmt(ks?.low52, 2)}–$${fmt(ks?.high52, 2)}; currently at ${fmt(pos52, 0)}% of that range. ` +
    `Beta ${fmt(ks?.beta, 2)}. P/E(TTM) ${fmt(ks?.peTTM, 1)}.`;

  const newsCtx = bundle.news?.length
    ? bundle.news.slice(0, 8).map((n) => `- ${n.headline}`).join("\n")
    : "No recent headlines.";

  const ratingTotal = an
    ? an.strongBuy + an.buy + an.hold + an.sell + an.strongSell
    : 0;
  const analystCtx =
    an && ratingTotal > 0
      ? `Ratings (${an.period ?? "latest"}): strongBuy ${an.strongBuy}, buy ${an.buy}, hold ${an.hold}, sell ${an.sell}, strongSell ${an.strongSell}. ` +
        `Mean target $${fmt(an.targetMean, 2)} (range $${fmt(an.targetLow, 2)}–$${fmt(an.targetHigh, 2)}) vs price $${fmt(price, 2)}.`
      : "No analyst coverage available.";

  const insiderCtx = bundle.insider?.length
    ? bundle.insider
        .slice(0, 10)
        .map((t) => `${t.direction.toUpperCase()} ${Math.abs(t.shares).toLocaleString()} sh (${t.transactionDate || t.filingDate})`)
        .join("; ")
    : "No recent insider open-market transactions.";

  const SIGNALS: { key: SignalKey; agent: Parameters<typeof generate>[0]["agent"]; prompt: string }[] = [
    {
      key: "fundamentals",
      agent: "fundamentals",
      prompt: `Assess the FUNDAMENTALS of ${name} (${symbol}) for a bullish/bearish score. Consider revenue & earnings growth, margins, cash generation and leverage.\n\n${fundCtx}\n\n${JSON_RULES}`,
    },
    {
      key: "momentum",
      agent: "technical",
      prompt: `Assess price MOMENTUM / technical posture of ${name} (${symbol}).\n\n${momCtx}\n\n${JSON_RULES}`,
    },
    {
      key: "sentiment",
      agent: "sentiment",
      // Headlines are third-party text — fence them so they read as data, not instructions.
      prompt: `Assess news SENTIMENT for ${name} (${symbol}) from these recent headlines. ${EXTERNAL_DATA_RULE}\n\n${fenceExternal("news headlines", newsCtx)}\n\n${JSON_RULES}`,
    },
    {
      key: "analyst",
      agent: "analyst",
      prompt: `Assess the ANALYST picture for ${name} (${symbol}) — consensus rating skew and implied upside to mean target.\n\n${analystCtx}\n\n${JSON_RULES}`,
    },
    {
      key: "insider",
      agent: "insider",
      prompt: `Assess INSIDER FLOW for ${name} (${symbol}). Net open-market buying is bullish, heavy selling bearish, none is neutral (~50).\n\n${insiderCtx}\n\n${JSON_RULES}`,
    },
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: FinavaEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));

      // Fire all five; enqueue each as it resolves. Promise.allSettled collects
      // them for synthesis once every bar has filled.
      const settled = await Promise.allSettled(
        SIGNALS.map(async (s) => {
          try {
            const raw = await generate({ agent: s.agent, maxTokens: 600, prompt: s.prompt });
            const sig = toSignal(s.key, parseJson(raw));
            send({ type: "signal", signal: sig });
            return sig;
          } catch (err) {
            console.error("[finava signal]", symbol, s.key, err);
            const sig = neutralSignal(s.key);
            send({ type: "signal", signal: sig });
            return sig;
          }
        })
      );

      const signals: FinavaSignal[] = settled.map((r, i) =>
        r.status === "fulfilled" ? r.value : neutralSignal(SIGNALS[i].key)
      );

      // ── Synthesis ──────────────────────────────────────────────────────────
      try {
        const street = an?.targetMean ?? null;
        const signalLines = signals
          .map((s) => `- ${s.label}: ${s.score}/100 (${s.stance}) — ${s.headline}`)
          .join("\n");

        const synthPrompt = `You are Finava's lead equity analyst. Synthesise these five signal scores for ${name} (${symbol}) into one verdict for a retail investor. This is research color, not advice.

Current price: $${fmt(price, 2)}
Analyst mean target (Street): ${street != null ? `$${fmt(street, 2)}` : "n/a"}
DCF fair value (model): ${dcfFair != null ? `$${fmt(dcfFair, 2)}` : "n/a"}

Signals:
${signalLines}

Weigh the signals (fundamentals and analyst carry the most weight; momentum and sentiment are shorter-term; insider is a minor confirm). Produce your OWN fair value estimate informed by price, the Street target and the DCF.

Respond with ONLY this JSON (no markdown):
{
  "score": <0-100 overall, integer>,
  "fairValue": <number or null>,
  "confidence": "Low" | "Moderate" | "High",
  "take": "<2-3 sentence written verdict, specific>",
  "catalysts": ["<short>", "..."],
  "risks": ["<short>", "..."]
}`;

        const raw = await generate({
          agent: "finavaSynthesis",
          maxTokens: 900,
          prompt: synthPrompt,
        });
        const p = parseJson(raw);
        if (!p) throw new Error("synthesis returned unparseable JSON");

        const score = Math.max(
          0,
          Math.min(100, Math.round(typeof p.score === "number" ? p.score : avg(signals)))
        );
        const fairValue =
          typeof p.fairValue === "number" && Number.isFinite(p.fairValue) ? p.fairValue : null;
        const upsidePct =
          fairValue != null && price && price > 0 ? ((fairValue - price) / price) * 100 : null;
        const confidence =
          p.confidence === "High" || p.confidence === "Low" ? p.confidence : "Moderate";

        const verdict: FinavaVerdict = {
          score,
          stance: verdictLabel(score),
          confidence: confidence as FinavaVerdict["confidence"],
          fairValue,
          upsidePct,
          take:
            typeof p.take === "string" && p.take.trim()
              ? p.take.trim()
              : "A balanced setup — see the signal breakdown above. Informational research, not advice.",
          catalysts: toStrings(p.catalysts),
          risks: toStrings(p.risks),
          comparison: { finava: fairValue, street, dcf: dcfFair },
        };
        send({ type: "verdict", verdict });
      } catch (err) {
        console.error("[finava synthesis]", symbol, err);
        send({ type: "error", message: "Failed to synthesise the verdict." });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy/CDN buffering so the per-signal events flush immediately
      // on Vercel (matches the chat/agent SSE routes).
      "X-Accel-Buffering": "no",
    },
  });
}

function avg(signals: FinavaSignal[]): number {
  return signals.reduce((a, s) => a + s.score, 0) / (signals.length || 1);
}
function toStrings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim())
    .slice(0, 4);
}
