import { generate } from "@/lib/llm";
import { getOptionsSnapshot } from "@/lib/polygon";
import { getSkillsPrompt } from "@/agents/skills";

interface OptionContract {
  details?: { contract_type?: string; strike_price?: number; expiration_date?: string };
  open_interest?: number;
  day?: { volume?: number };
  implied_volatility?: number;
}

export async function runOptionsAgent(input: unknown): Promise<string> {
  const { tickers } = input as { tickers: string[] };

  const optionsData: Record<string, object> = {};

  if (process.env.POLYGON_API_KEY) {
    await Promise.allSettled(
      tickers.map(async (ticker) => {
        try {
          const data = await getOptionsSnapshot(ticker);

          const contracts = (data.results ?? []) as OptionContract[];
          const calls = contracts.filter((c) => c.details?.contract_type === "call");
          const puts = contracts.filter((c) => c.details?.contract_type === "put");

          const totalCallOI = calls.reduce((s, c) => s + (c.open_interest ?? 0), 0);
          const totalPutOI = puts.reduce((s, c) => s + (c.open_interest ?? 0), 0);

          // Find unusual activity (high volume contracts)
          const unusualCalls = calls
            .sort((a, b) => (b.day?.volume ?? 0) - (a.day?.volume ?? 0))
            .slice(0, 3)
            .map((c) => ({
              strike: c.details?.strike_price,
              expiry: c.details?.expiration_date,
              volume: c.day?.volume,
              oi: c.open_interest,
              iv: c.implied_volatility ? `${(c.implied_volatility * 100).toFixed(1)}%` : "N/A",
            }));

          const unusualPuts = puts
            .sort((a, b) => (b.day?.volume ?? 0) - (a.day?.volume ?? 0))
            .slice(0, 3)
            .map((c) => ({
              strike: c.details?.strike_price,
              expiry: c.details?.expiration_date,
              volume: c.day?.volume,
              oi: c.open_interest,
              iv: c.implied_volatility ? `${(c.implied_volatility * 100).toFixed(1)}%` : "N/A",
            }));

          optionsData[ticker] = {
            putCallRatio: totalCallOI > 0 ? (totalPutOI / totalCallOI).toFixed(2) : "N/A",
            totalCallOI,
            totalPutOI,
            topCallsByVolume: unusualCalls,
            topPutsByVolume: unusualPuts,
          };
        } catch {
          optionsData[ticker] = { error: "Options data unavailable (may require Polygon paid tier)" };
        }
      })
    );
  } else {
    Object.assign(optionsData, Object.fromEntries(tickers.map((t) => [t, { error: "No API key" }])));
  }

  return generate({
    agent: "options",
    system: getSkillsPrompt("options"),
    maxTokens: 1500,
    prompt: `Analyze options flow for ${tickers.join(", ")}.

Options data:
${JSON.stringify(optionsData, null, 2)}

Provide:
1. Put/call ratio interpretation for each ticker (bullish/bearish bias)
2. Any unusual options activity worth noting (large positions, high IV)
3. What the options market is pricing in (expected moves, hedging activity)
4. Overall options sentiment: institutions hedging, speculative bets, or quiet
5. Key strikes and expirations to watch

Note that options flow reflects derivatives activity, not direct stock positions.`,
  });
}
