import { generate } from "@/lib/llm";
import { perplexitySearch } from "@/lib/perplexity";
import { getSkillsPrompt } from "@/agents/skills";
import { getCompanyNews } from "@/lib/finnhub";

export async function runNewsAgent(input: unknown): Promise<string> {
  const { tickers, days = 7 } = input as { tickers: string[]; days?: number };

  const toDate = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Fetch news from Finnhub for each ticker + enrich with Perplexity
  const newsItems: string[] = [];

  await Promise.allSettled(
    tickers.slice(0, 5).map(async (ticker) => {
      try {
        const articles = await getCompanyNews(ticker, fromDate, toDate);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const headlines = (articles ?? []).slice(0, 8).map((a: any) =>
          `[${ticker}] ${a.headline} (${new Date(a.datetime * 1000).toISOString().slice(0, 10)})`
        );
        if (headlines.length) newsItems.push(...headlines);
      } catch { /* skip */ }
    })
  );

  // Enrich with Perplexity web search for additional context
  let perplexityContext = "";
  if (process.env.PERPLEXITY_API_KEY) {
    try {
      perplexityContext = await perplexitySearch(
        `Recent news, analyst opinions, and key developments for ${tickers.join(", ")} in the past ${days} days. Focus on material events affecting stock price.`
      );
    } catch { /* skip */ }
  }

  const rawNews = newsItems.length
    ? newsItems.join("\n")
    : `No Finnhub news found for ${tickers.join(", ")}.`;

  return generate({
    agent: "news",
    system: getSkillsPrompt("news"),
    maxTokens: 1500,
    prompt: `Summarize recent news and sentiment for ${tickers.join(", ")} (last ${days} days).

Finnhub headlines:
${rawNews}

${perplexityContext ? `Web research:\n${perplexityContext}` : ""}

Provide: key themes, overall sentiment (bullish/bearish/neutral per ticker), and any material events.`,
  });
}
