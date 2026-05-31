import { generate } from "@/lib/llm";
import { getCandles, getSnapshots } from "@/lib/finnhub";
import { getSkillsPrompt } from "@/agents/skills";

export async function runRiskAgent(input: unknown): Promise<string> {
  const { tickers, focus } = input as { tickers: string[]; focus?: string };

  const toTs = Math.floor(Date.now() / 1000);
  const fromTs = toTs - 252 * 24 * 60 * 60;

  let riskData = "";

  if (process.env.FINNHUB_API_KEY && tickers.length > 0) {
    try {
      const [snapshots, spyCandles] = await Promise.all([
        getSnapshots(tickers),
        getCandles("SPY", "D", fromTs, toTs),
      ]);

      const spyCloses: number[] = spyCandles?.c ?? [];
      const spyReturns = spyCloses.slice(1).map((c, i) => (c - spyCloses[i]) / spyCloses[i]);
      const spyMean = spyReturns.reduce((a, b) => a + b, 0) / spyReturns.length;
      const spyVar = spyReturns.reduce((a, b) => a + (b - spyMean) ** 2, 0) / spyReturns.length;

      const tickerMetrics: Record<string, object> = {};

      await Promise.allSettled(
        tickers.map(async (ticker) => {
          try {
            const candles = await getCandles(ticker, "D", fromTs, toTs);
            const closes: number[] = candles?.c ?? [];
            const returns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]);
            const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
            const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
            const vol = (Math.sqrt(variance * 252) * 100).toFixed(1);

            const minLen = Math.min(returns.length, spyReturns.length);
            const cov = returns.slice(-minLen).reduce((a, x, i) =>
              a + (x - mean) * (spyReturns[i + spyReturns.length - minLen] - spyMean), 0
            );
            const beta = spyVar > 0 ? (cov / (minLen * spyVar)).toFixed(2) : "N/A";

            const snap = snapshots.find((s) => s.ticker === ticker);
            tickerMetrics[ticker] = {
              annualizedVolatility: `${vol}%`,
              beta,
              currentPrice: snap?.price ?? "N/A",
              dailyChange: snap ? `${snap.changePct.toFixed(2)}%` : "N/A",
            };
          } catch {
            tickerMetrics[ticker] = { error: "Could not compute" };
          }
        })
      );

      riskData = JSON.stringify(tickerMetrics, null, 2);
    } catch {
      riskData = "Could not fetch market data.";
    }
  }

  const focusNote = focus ? `\nFocus on: ${focus}` : "";

  const text = await generate({
    agent: "risk",
    system: getSkillsPrompt("risk"),
    maxTokens: 10000,
    reasoning: 8000,
    cache: true,
    prompt: `Analyze the risk profile of this portfolio (tickers: ${tickers.join(", ")}).${focusNote}

Risk metrics:
${riskData}

Provide:
1. Overall portfolio risk assessment
2. Concentration risks and overweight positions
3. Beta analysis (market sensitivity)
4. Volatility comparison across holdings
5. Specific risk concerns and position-sizing recommendations`,
  });

  return text || "Risk analysis unavailable.";
}
