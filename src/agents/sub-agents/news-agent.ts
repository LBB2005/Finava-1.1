import { generate } from "@/lib/llm";
import { perplexitySearch } from "@/lib/perplexity";
import { getSkillsPrompt } from "@/agents/skills";
import { getCompanyNews } from "@/lib/finnhub";
import { fenceExternal, EXTERNAL_DATA_RULE } from "@/lib/externalContent";

export async function runNewsAgent(input: unknown): Promise<string> {
  const { tickers, days = 7 } = input as { tickers: string[]; days?: number };

  const toDate = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Fetch Finnhub headlines and the Perplexity web-search enrichment in
  // parallel — they're independent sources, so don't serialize them.
  const newsItems: string[] = [];
  const [, perplexityResult] = await Promise.all([
    Promise.allSettled(
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
    ),
    process.env.PERPLEXITY_API_KEY
      ? perplexitySearch(
          `Recent news, analyst opinions, and key developments for ${tickers.join(", ")} in the past ${days} days. Focus on material events affecting stock price.`
        ).catch(() => "")
      : Promise.resolve(""),
  ]);
  const perplexityContext = perplexityResult;

  // No data from either source: say so explicitly instead of asking the model
  // to narrate nothing — the CEO's data-quality rules treat this as unknown
  // rather than letting a narration model invent headlines.
  if (newsItems.length === 0 && !perplexityContext) {
    return `NEWS DATA UNAVAILABLE for ${tickers.join(", ")} (last ${days} days): Finnhub returned no articles and web research was unavailable. Treat news/sentiment for these tickers as unknown.`;
  }

  const rawNews = newsItems.length
    ? newsItems.join("\n")
    : `No Finnhub news found for ${tickers.join(", ")}.`;

  return generate({
    agent: "news",
    system: [getSkillsPrompt("news"), EXTERNAL_DATA_RULE].filter(Boolean).join("\n\n"),
    maxTokens: 1500,
    prompt: `Summarize recent news and sentiment for ${tickers.join(", ")} (last ${days} days).

${fenceExternal("finnhub headlines", rawNews)}

${perplexityContext ? fenceExternal("perplexity web research", perplexityContext) : ""}

Provide: key themes, overall sentiment (bullish/bearish/neutral per ticker), and any material events.`,
  });
}
