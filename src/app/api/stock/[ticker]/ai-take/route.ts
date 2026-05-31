// Opt-in AI thesis for a ticker. Nothing here runs on page load — the stock
// page only POSTs to this when the user clicks "Generate AI take".
//
// We assemble a compact, factual context from the same bundle the page shows,
// then ask the model for a short, balanced read. Kept deliberately hedged: this
// is research color, not advice.

import { NextResponse } from "next/server";
import { anthropic, MODEL } from "@/lib/anthropic";
import { getStockBundle } from "@/lib/stockData";

function fmtNum(n: number | null | undefined, opts?: Intl.NumberFormatOptions): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "n/a";
  return n.toLocaleString("en-US", opts);
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const symbol = (ticker ?? "").trim().toUpperCase();

  if (!symbol) {
    return NextResponse.json({ error: "Missing ticker." }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI service not configured (ANTHROPIC_API_KEY missing)." },
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
      `Recent headlines:\n${newsLines}`,
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `You are a sober equity research assistant. Using ONLY the data below, write a concise "AI take" on ${name} (${symbol}) for a retail investor browsing a research page.

${context}

Write 3 short paragraphs (no headers, no bullet lists):
1. What the business/setup looks like right now (valuation, momentum, where it sits in its 52-week range).
2. The bull vs bear tension — what the analyst picture and recent news suggest, both sides.
3. A balanced one-line bottom line, explicitly noting this is informational research, not financial advice.

Be specific with the numbers given. Do not invent data you weren't given. Keep it under ~180 words.`;

    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });

    const take =
      resp.content.find((blk) => blk.type === "text")?.text?.trim() ?? "";

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
