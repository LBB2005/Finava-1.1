import { generate } from "@/lib/llm";
import { getCandles } from "@/lib/finnhub";
import { getSkillsPrompt } from "@/agents/skills";

function calcSMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calcEMA(closes: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) { ema.push(closes[0]); continue; }
    ema.push(closes[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function calcRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  const gains = changes.map((c) => (c > 0 ? c : 0));
  const losses = changes.map((c) => (c < 0 ? -c : 0));
  const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
  const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function calcMACD(closes: number[]) {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signal = calcEMA(macdLine, 9);
  return {
    macd: +(macdLine.at(-1) ?? 0).toFixed(3),
    signal: +(signal.at(-1) ?? 0).toFixed(3),
    histogram: +((macdLine.at(-1) ?? 0) - (signal.at(-1) ?? 0)).toFixed(3),
  };
}

export async function runTechnicalAgent(input: unknown): Promise<string> {
  const { tickers, indicators = ["rsi", "macd", "sma20", "sma50"] } = input as {
    tickers: string[];
    indicators?: string[];
  };

  const toTs = Math.floor(Date.now() / 1000);
  const fromTs = toTs - 365 * 24 * 60 * 60;

  const results: Record<string, Record<string, unknown>> = {};

  await Promise.allSettled(
    tickers.map(async (ticker) => {
      try {
        const data = await getCandles(ticker, "D", fromTs, toTs);
        if (!data.c || data.s !== "ok") {
          results[ticker] = { error: "No candle data" };
          return;
        }
        const closes: number[] = data.c;

        const r: Record<string, unknown> = { currentPrice: closes.at(-1) };
        if (indicators.includes("rsi")) r.rsi = calcRSI(closes)?.toFixed(1);
        if (indicators.includes("macd")) r.macd = calcMACD(closes);
        if (indicators.includes("sma20")) r.sma20 = calcSMA(closes, 20)?.toFixed(2);
        if (indicators.includes("sma50")) r.sma50 = calcSMA(closes, 50)?.toFixed(2);
        if (indicators.includes("sma200")) r.sma200 = calcSMA(closes, 200)?.toFixed(2);

        // Price vs SMAs
        const price = closes.at(-1) ?? 0;
        const sma50 = calcSMA(closes, 50);
        const sma200 = calcSMA(closes, 200);
        if (sma50 && sma200) {
          r.trend = price > sma50 && price > sma200 ? "Bullish (above 50 & 200 SMA)" :
                    price < sma50 && price < sma200 ? "Bearish (below 50 & 200 SMA)" :
                    "Mixed";
        }

        results[ticker] = r;
      } catch {
        results[ticker] = { error: "Could not fetch data" };
      }
    })
  );

  // ── Data quality audit ────────────────────────────────────────────────────
  const failedTickers = tickers.filter((t) => (results[t] as { error?: string })?.error);
  const successTickers = tickers.filter((t) => !(results[t] as { error?: string })?.error);
  const allFailed = failedTickers.length === tickers.length;

  // If every ticker failed, return a hard no-data signal — don't let Claude guess
  if (allFailed) {
    return [
      "⚠️ DATA UNAVAILABLE — TECHNICAL ANALYSIS BLOCKED",
      "",
      `No live price data could be retrieved for: ${tickers.join(", ")}`,
      "This is likely a Finnhub API quota or connectivity issue.",
      "",
      "CONSEQUENCE: Current prices, RSI, MACD, and moving averages are all unknown.",
      "Any position-sizing, trim/hold calls, or cost-basis comparisons that depend on",
      "current price MUST be withheld until live data is available.",
      "",
      `Tickers with no data: ${failedTickers.join(", ")}`,
    ].join("\n");
  }

  // Build data-quality header to force Claude to caveat missing tickers
  const dataQualityNote = failedTickers.length > 0
    ? `\n\n⚠️ DATA QUALITY WARNING: The following tickers returned NO live price data and must be explicitly marked as "No data — signal unavailable" with NO technical signal assigned: ${failedTickers.join(", ")}. Do NOT infer or estimate signals for these tickers. Only analyze: ${successTickers.join(", ")}.`
    : "";

  return generate({
    agent: "technical",
    system: getSkillsPrompt("technical"),
    maxTokens: 1500,
    prompt: `Interpret technical indicators for ${tickers.join(", ")}. For each ticker give a bullish/bearish/neutral signal, note overbought/oversold conditions, and flag any key technical levels or crossovers.${dataQualityNote}

CRITICAL RULE: If a ticker's data shows { "error": ... }, you MUST write "⚠️ No data available — technical signal withheld" for that ticker. Never assign a signal without actual indicator values.

${JSON.stringify(results, null, 2)}`,
  });
}
