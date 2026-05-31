/**
 * Sentiment Agent v2
 * Uses Perplexity's sonar-pro model as a multi-platform search proxy.
 * No Reddit OAuth or X API keys required — Perplexity indexes Reddit, news,
 * X/Twitter public posts, and more in real time.
 *
 * If STOCKTWITS_ACCESS_TOKEN is set, also fetches live StockTwits stream
 * for a quantitative bullish/bearish signal to complement Perplexity's search.
 */

import { generate } from "@/lib/llm";
import { getSkillsPrompt } from "@/agents/skills";

const PERPLEXITY_API = "https://api.perplexity.ai/chat/completions";

interface StockTwitsMessage {
  body?: string;
  entities?: { sentiment?: { basic?: string } };
}

async function fetchStockTwitsSentiment(ticker: string) {
  const token = process.env.STOCKTWITS_ACCESS_TOKEN;
  const headers: Record<string, string> = { "User-Agent": "Lucra App" };
  if (token) headers["Authorization"] = `OAuth ${token}`;

  try {
    const res = await fetch(
      `https://api.stocktwits.com/api/2/streams/symbol/${ticker}.json`,
      { headers }
    );
    if (!res.ok) return null;
    const data = await res.json();

    const messages = ((data.messages ?? []) as StockTwitsMessage[]).slice(0, 25);
    const bullish = messages.filter((m) => m.entities?.sentiment?.basic === "Bullish").length;
    const bearish = messages.filter((m) => m.entities?.sentiment?.basic === "Bearish").length;
    const neutral = messages.length - bullish - bearish;
    const total = messages.length;

    return {
      total,
      bullish,
      bearish,
      neutral,
      bullishPct: total ? Math.round((bullish / total) * 100) : 0,
      bearishPct: total ? Math.round((bearish / total) * 100) : 0,
      topMessages: messages
        .slice(0, 5)
        .map((m) => m.body?.slice(0, 120))
        .filter((b): b is string => !!b),
    };
  } catch {
    return null;
  }
}

async function fetchPerplexitySentiment(tickers: string[]): Promise<string> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return "Perplexity API key not configured.";

  const tickerList = tickers.join(", ");

  const userPrompt = `Search Reddit (r/wallstreetbets, r/stocks, r/investing, r/SecurityAnalysis), X/Twitter, financial news, and any other public forums for current social sentiment about these stocks: ${tickerList}.

For EACH ticker, find and report:
1. Top Reddit posts or threads (last 48 hours) — titles, upvotes if visible, subreddit
2. Notable X/Twitter posts or trending discussions
3. News headlines driving discussion
4. Overall tone: strongly bullish / bullish / neutral / bearish / strongly bearish
5. Any meme stock activity, short squeeze talk, or unusual retail interest
6. Key themes or narratives being discussed (earnings anticipation, product news, macro fears, AI hype, etc.)

Format your response with a clear section for each ticker.`;

  try {
    const res = await fetch(PERPLEXITY_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          {
            role: "system",
            content:
              "You are a financial sentiment analyst. Search for real, current social media and forum posts. Be specific — cite actual post titles and communities. Do not invent quotes or sentiment.",
          },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 1500,
        temperature: 0.1,
        search_recency_filter: "day",
        return_citations: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`Perplexity ${res.status}: ${await res.text().catch(() => res.statusText)}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    const citations: string[] = data.citations ?? [];
    const citationBlock =
      citations.length > 0
        ? `\n\nSources:\n${citations.slice(0, 6).map((c, i) => `[${i + 1}] ${c}`).join("\n")}`
        : "";

    return content + citationBlock;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    console.error("[sentiment-agent] Perplexity error:", msg);
    return `Perplexity search unavailable: ${msg}`;
  }
}

export async function runSentimentAgent(input: unknown): Promise<string> {
  const { tickers } = input as { tickers: string[] };

  // Run Perplexity search + StockTwits in parallel
  const [perplexityResult, ...stocktwitsResults] = await Promise.all([
    fetchPerplexitySentiment(tickers),
    ...tickers.map(fetchStockTwitsSentiment),
  ]);

  // Build StockTwits section if any data came back
  const stocktwitsSection: string[] = [];
  tickers.forEach((ticker, i) => {
    const st = stocktwitsResults[i];
    if (st) {
      stocktwitsSection.push(
        `${ticker}: ${st.bullishPct}% bullish / ${st.bearishPct}% bearish (${st.total} recent messages)\n` +
          `Top messages: ${st.topMessages.map((m: string) => `"${m}"`).join(" | ")}`
      );
    }
  });

  const combinedInput = [
    `## Social Media Search (Reddit, X/Twitter, News — last 48h)\n\n${perplexityResult}`,
    stocktwitsSection.length > 0
      ? `## StockTwits Live Stream\n\n${stocktwitsSection.join("\n\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  // Ask the model to synthesize
  return generate({
    agent: "sentiment",
    system: getSkillsPrompt("sentiment"),
    maxTokens: 1400,
    prompt: `You are a social sentiment analyst. Synthesize the following multi-platform sentiment data for ${tickers.join(", ")} into a clear, actionable report.

${combinedInput}

Write a structured report covering:
1. **Overall Sentiment Score** for each ticker: Strongly Bullish (4) / Bullish (3) / Neutral (2) / Bearish (1) / Strongly Bearish (0) — with a one-line rationale
2. **Retail Interest Level**: High / Medium / Low (based on volume of discussion)
3. **Key Narratives**: What story is driving the discussion? (AI hype, earnings, product launch, macro fear, short squeeze, etc.)
4. **Notable Posts/Quotes**: The most impactful things people are saying
5. **Contrarian Signals**: Extremely bullish social sentiment can be a sell signal (euphoria top); extremely bearish can signal capitulation
6. **Divergence Alert**: Does social sentiment align with or contradict the fundamental picture?

Be specific with names, numbers, and sources from the data provided.`,
  });
}
