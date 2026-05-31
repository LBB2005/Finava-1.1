import { generate } from "@/lib/llm";
import { getRecommendationTrends, getPriceTarget, getQuote } from "@/lib/finnhub";
import { getSkillsPrompt } from "@/agents/skills";

interface AnalystInput {
  tickers: string[];
}

interface RecTrend {
  strongBuy?: number;
  buy?: number;
  hold?: number;
  sell?: number;
  strongSell?: number;
  period?: string;
}

interface PriceTarget {
  targetHigh?: number;
  targetLow?: number;
  targetMean?: number;
  targetMedian?: number;
  numberOfAnalysts?: number;
  lastUpdated?: string;
}

export async function runAnalystAgent(input: unknown): Promise<string> {
  const { tickers } = input as AnalystInput;

  const results = await Promise.allSettled(
    tickers.map(async (ticker) => {
      const [recRes, ptRes, quoteRes] = await Promise.allSettled([
        getRecommendationTrends(ticker),
        getPriceTarget(ticker),
        getQuote(ticker),
      ]);

      const rec: RecTrend | null =
        recRes.status === "fulfilled"
          ? (recRes.value as RecTrend[] | undefined)?.[0] ?? null
          : null;
      const pt: PriceTarget | null =
        ptRes.status === "fulfilled" ? (ptRes.value as PriceTarget | null) : null;
      const currentPrice =
        quoteRes.status === "fulfilled" ? quoteRes.value?.price ?? null : null;

      return {
        ticker,
        currentPrice,
        // Finnhub recommendation trend (most recent period)
        strongBuy: rec?.strongBuy ?? null,
        buy: rec?.buy ?? null,
        hold: rec?.hold ?? null,
        sell: rec?.sell ?? null,
        strongSell: rec?.strongSell ?? null,
        period: rec?.period ?? null,
        // Finnhub price target
        targetHigh: pt?.targetHigh ?? null,
        targetLow: pt?.targetLow ?? null,
        targetMean: pt?.targetMean ?? null,
        targetMedian: pt?.targetMedian ?? null,
        numberOfAnalysts: pt?.numberOfAnalysts ?? null,
        lastUpdated: pt?.lastUpdated ?? null,
      };
    })
  );

  const data = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));

  const text = await generate({
    agent: "analyst",
    system: getSkillsPrompt("analyst"),
    maxTokens: 2000,
    prompt: `You are a financial analyst summarizing Wall Street consensus for the following tickers.

Raw analyst data:
\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`

For each ticker, compute and present:
1. **Consensus Rating**: Derive from strongBuy/buy/hold/sell/strongSell counts. Express as a weighted score and map to: Strong Buy / Buy / Hold / Sell / Strong Sell.
   Formula: score = (strongBuy×2 + buy×1 + hold×0 + sell×−1 + strongSell×−2) / totalAnalysts
2. **Analyst Count**: Total number of analysts covering the stock.
3. **Avg Price Target**: Use targetMean.
4. **Target Range**: Low – High.
5. **Upside %**: (targetMean − currentPrice) / currentPrice × 100. Flag if > 30% as potentially aggressive.
6. **Rating Distribution**: brief "10 Buy / 5 Hold / 2 Sell" summary.

**Output format:**
1. A markdown table: | Ticker | Rating | Analysts | Avg Target | Range | Upside % |
2. For each ticker with > 20% divergence between targetHigh and targetLow: add a ⚠️ note explaining the wide spread.
3. A 2-3 sentence synthesized takeaway: what does Wall Street think overall about this basket of stocks?

Use "N/A" for missing data. If only one ticker is requested, skip the synthesis and give a 3-sentence single-stock analyst summary instead.`,
  });

  return text || "Analyst consensus data unavailable.";
}
