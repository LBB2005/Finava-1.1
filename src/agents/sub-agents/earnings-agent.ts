import { generate } from "@/lib/llm";
import { getEarnings, getEarningsCalendar, getRecommendationTrends } from "@/lib/finnhub";
import { getSkillsPrompt } from "@/agents/skills";

export async function runEarningsAgent(input: unknown): Promise<string> {
  const { tickers } = input as { tickers: string[] };

  const earningsData: Record<string, object> = {};
  const fromDate = new Date().toISOString().slice(0, 10);
  const toDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  await Promise.allSettled(
    tickers.map(async (ticker) => {
      try {
        const [eps, calendar, recs] = await Promise.all([
          getEarnings(ticker),
          getEarningsCalendar(fromDate, toDate, ticker),
          getRecommendationTrends(ticker),
        ]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const epsHistory = (eps ?? []).slice(0, 6).map((e: any) => ({
          period: e.period,
          actual: e.actual,
          estimate: e.estimate,
          surprise: e.surprisePercent ? `${e.surprisePercent.toFixed(1)}%` : "N/A",
        }));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nextEarnings = (calendar.earningsCalendar ?? []).find((e: any) => e.symbol === ticker);
         
        const latestRec = (recs ?? [])[0];

        earningsData[ticker] = {
          epsHistory,
          nextEarningsDate: nextEarnings?.date ?? "Not scheduled in next 90 days",
          nextEpsEstimate: nextEarnings?.epsEstimate ?? "N/A",
          analystRating: latestRec ? {
            strongBuy: latestRec.strongBuy,
            buy: latestRec.buy,
            hold: latestRec.hold,
            sell: latestRec.sell,
            strongSell: latestRec.strongSell,
          } : "No data",
        };
      } catch {
        earningsData[ticker] = { error: "Could not fetch earnings data" };
      }
    })
  );

  return generate({
    agent: "earnings",
    system: getSkillsPrompt("earnings"),
    maxTokens: 1500,
    prompt: `Analyze earnings history, upcoming catalysts, and analyst sentiment for ${tickers.join(", ")}.\n\n${JSON.stringify(earningsData, null, 2)}\n\nProvide: EPS trends, beat/miss history, upcoming earnings dates, analyst consensus, and earnings-based investment thesis for each ticker.`,
  });
}
