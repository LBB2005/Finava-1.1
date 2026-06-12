// Opt-in AI thesis for a ticker. Nothing here runs on page load — the stock
// page only POSTs to this when the user clicks "Generate AI take".
//
// We assemble a compact, factual context from the same bundle the page shows,
// then ask the model for a short, balanced read. Kept deliberately hedged: this
// is research color, not advice.

import { NextResponse } from "next/server";
import { generate } from "@/lib/llm";
import { getStockBundle } from "@/lib/stockData";
import { requireAuth } from "@/lib/requireAuth";
import { checkUsageLimit, usageStore } from "@/lib/usage";
import { userRateLimit } from "@/lib/rateLimit";
import { fenceExternal, EXTERNAL_DATA_RULE } from "@/lib/externalContent";

function fmtNum(n: number | null | undefined, opts?: Intl.NumberFormatOptions): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "n/a";
  return n.toLocaleString("en-US", opts);
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  // This triggers a paid LLM generation — gate it behind auth like every other
  // LLM route (chat, agent, backtest, statement, briefing). The bundle GET route
  // stays public (read-only market data); only this opt-in generation requires it.
  const { userId, error: authError } = await requireAuth();
  if (authError) return authError;
  const throttled = userRateLimit(userId, "ai-take");
  if (throttled) return throttled;
  const limited = await checkUsageLimit(userId);
  if (limited) return limited;
  usageStore.enterWith({ userId });

  const { ticker } = await params;
  const symbol = (ticker ?? "").trim().toUpperCase();

  if (!symbol) {
    return NextResponse.json({ error: "Missing ticker." }, { status: 400 });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: "AI service not configured (OPENROUTER_API_KEY missing)." },
      { status: 503 }
    );
  }

  try {
    const b = await getStockBundle(symbol);

    if (!b.quote && !b.profile) {
      return NextResponse.json(
        { error: `Couldn't find ${symbol}.` },
        { status: 404 }
      );
    }

    const name = b.profile?.name ?? symbol;
    const price = b.quote?.price ?? null;
    const changePct = b.quote?.changePct ?? null;
    const ks = b.keyStats;
    const an = b.analysts;

    const ratingTotal = an
      ? an.strongBuy + an.buy + an.hold + an.sell + an.strongSell
      : 0;

    const fundamentalsLine = b.fundamentals
      ? `Revenue (recent yrs): ${b.fundamentals.revenue
          .slice(-4)
          .reverse()
          .map((r) => `${r.year}=$${fmtNum(r.value / 1e9, { maximumFractionDigits: 1 })}B`)
          .join(", ") || "n/a"}; Net income: ${b.fundamentals.netIncome
          .slice(-4)
          .reverse()
          .map((r) => `${r.year}=$${fmtNum(r.value / 1e9, { maximumFractionDigits: 1 })}B`)
          .join(", ") || "n/a"}`
      : "Fundamentals: n/a";

    const newsLines =
      b.news && b.news.length
        ? b.news
            .slice(0, 6)
            .map((n) => `- ${n.headline}`)
            .join("\n")
        : "- (no recent headlines)";

    const context = [
      `Company: ${name} (${symbol})`,
      b.profile?.industry ? `Industry: ${b.profile.industry}` : null,
      price != null
        ? `Price: $${fmtNum(price, { maximumFractionDigits: 2 })} (${
            changePct != null ? `${changePct >= 0 ? "+" : ""}${fmtNum(changePct, { maximumFractionDigits: 2 })}% today` : "today n/a"
          })`
        : null,
      ks
        ? `Market cap: ${fmtNum(ks.marketCap, { maximumFractionDigits: 0 })}M; P/E(TTM): ${fmtNum(ks.peTTM, { maximumFractionDigits: 1 })}; 52wk: $${fmtNum(ks.low52, { maximumFractionDigits: 2 })}–$${fmtNum(ks.high52, { maximumFractionDigits: 2 })}; beta: ${fmtNum(ks.beta, { maximumFractionDigits: 2 })}; div yield: ${fmtNum(ks.dividendYield, { maximumFractionDigits: 2 })}%`
        : null,
      an && ratingTotal > 0
        ? `Analyst ratings (${an.period ?? "latest"}): strongBuy ${an.strongBuy}, buy ${an.buy}, hold ${an.hold}, sell ${an.sell}, strongSell ${an.strongSell}; target mean $${fmtNum(an.targetMean, { maximumFractionDigits: 2 })}`
        : null,
      fundamentalsLine,
      `Recent headlines:\n${fenceExternal("news headlines", newsLines)}`,
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `You are a sober equity research assistant. Using ONLY the data below, write a concise "AI take" on ${name} (${symbol}) for a retail investor browsing a research page. ${EXTERNAL_DATA_RULE}

${context}

Write 3 short paragraphs (no headers, no bullet lists):
1. What the business/setup looks like right now (valuation, momentum, where it sits in its 52-week range).
2. The bull vs bear tension — what the analyst picture and recent news suggest, both sides.
3. A balanced one-line bottom line, explicitly noting this is informational research, not financial advice.

Be specific with the numbers given. Do not invent data you weren't given. Keep it under ~180 words.`;

    const take = (
      await generate({
        agent: "aiTake",
        maxTokens: 600,
        prompt,
      })
    ).trim();

    if (!take) {
      return NextResponse.json(
        { error: "AI returned an empty take." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ticker: symbol, take });
  } catch (err) {
    console.error("[stock ai-take]", symbol, err);
    return NextResponse.json(
      { error: "Failed to generate AI take." },
      { status: 500 }
    );
  }
}
