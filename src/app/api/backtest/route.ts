import { NextResponse } from "next/server";
import { generate } from "@/lib/llm";
import { getCandles } from "@/lib/finnhub";
import { requireAuth } from "@/lib/requireAuth";
import { checkUsageLimit, usageStore } from "@/lib/usage";
import { db } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const maxDuration = 120;

export interface BacktestConfig {
  tickers: string[];
  strategy: "buy_hold" | "equal_weight" | "momentum";
  startDate: string;
  endDate: string;
  benchmark: "SPY" | "QQQ";
  rebalancePeriod: number;
}

export interface BacktestSeries {
  date: string;
  portfolio: number;
  benchmark: number;
}

export interface BacktestResult {
  config: BacktestConfig;
  series: BacktestSeries[];
  sharpe: number;
  maxDrawdown: number;
  cagr: number;
  winRate: number;
  summary: string;
}

export async function POST(req: Request) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  const limited = await checkUsageLimit(userId);
  if (limited) return limited;
  usageStore.enterWith({ userId });

  const body = await req.json() as { query?: string; portfolioTickers?: string[] };
  const { query, portfolioTickers } = body;

  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "Query required" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const twoYearsAgo = new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10);

  // ── Step 1: Parse NL → BacktestConfig with Haiku ────────────────────────
  let config: BacktestConfig;
  try {
    const raw = await generate({
      agent: "backtestParse",
      maxTokens: 300,
      prompt: `Parse this backtesting request into a JSON config. Today is ${today}.

User query: "${query}"
Portfolio tickers available: ${portfolioTickers?.length ? portfolioTickers.join(", ") : "none"}

Return ONLY valid JSON, no other text:
{
  "tickers": ["AAPL", "MSFT"],
  "strategy": "equal_weight",
  "startDate": "${twoYearsAgo}",
  "endDate": "${today}",
  "benchmark": "SPY",
  "rebalancePeriod": 20
}

Rules:
- tickers: extract from query; if user says "my holdings" use portfolio tickers; max 8
- strategy: "buy_hold" (static), "equal_weight" (rebalanced), or "momentum" (top performers)
- startDate: parse year references (e.g. "from 2022" → "2022-01-01"), default is ${twoYearsAgo}
- endDate: default today (${today})
- benchmark: "SPY" unless user mentions QQQ/Nasdaq
- rebalancePeriod: 1=daily, 5=weekly, 20=monthly (default 20)`,
    });

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in parse response");
    const parsed = JSON.parse(match[0]) as Partial<BacktestConfig>;

    config = {
      tickers: (Array.isArray(parsed.tickers) ? parsed.tickers : []).map((t) => String(t).toUpperCase()).slice(0, 8),
      strategy: ["buy_hold", "equal_weight", "momentum"].includes(parsed.strategy ?? "")
        ? parsed.strategy as BacktestConfig["strategy"]
        : "equal_weight",
      startDate: parsed.startDate || twoYearsAgo,
      endDate: parsed.endDate || today,
      benchmark: parsed.benchmark === "QQQ" ? "QQQ" : "SPY",
      rebalancePeriod: Number(parsed.rebalancePeriod) > 0 ? Number(parsed.rebalancePeriod) : 20,
    };

    if (config.tickers.length === 0) {
      return NextResponse.json({ error: "No tickers found in query. Try: 'backtest AAPL MSFT from 2022'" }, { status: 400 });
    }
  } catch (err) {
    console.error("[backtest] parse error:", err);
    return NextResponse.json({ error: "Could not parse backtest query" }, { status: 400 });
  }

  // ── Step 2: Fetch daily candles for tickers + benchmark ──────────────────
  const allTickers = [...new Set([...config.tickers, config.benchmark])];
  const fromTs = Math.floor(new Date(config.startDate).getTime() / 1000);
  const toTs = Math.floor(new Date(config.endDate).getTime() / 1000);

  const candleMap = new Map<string, { dates: number[]; closes: number[] }>();

  await Promise.allSettled(
    allTickers.map(async (ticker) => {
      try {
        const data = await getCandles(ticker, "D", fromTs, toTs) as {
          s: string; t: number[]; c: number[];
        };
        if (data.s === "ok" && Array.isArray(data.t) && data.t.length > 1) {
          candleMap.set(ticker, { dates: data.t, closes: data.c });
        }
      } catch { /* skip unfetchable tickers */ }
    })
  );

  const availableTickers = config.tickers.filter((t) => candleMap.has(t));
  if (availableTickers.length === 0) {
    return NextResponse.json({ error: "Could not fetch price data for any requested ticker. Check your ticker symbols." }, { status: 422 });
  }
  if (!candleMap.has(config.benchmark)) {
    return NextResponse.json({ error: `Could not fetch benchmark (${config.benchmark}) data.` }, { status: 422 });
  }

  // ── Step 3: Run backtest engine ──────────────────────────────────────────
  const result = computeBacktest({ ...config, tickers: availableTickers }, candleMap);

  // ── Step 4: Generate summary with Haiku ──────────────────────────────────
  let summary = "";
  try {
    summary = await generate({
      agent: "backtestSummary",
      maxTokens: 120,
      prompt: `Write a 2-sentence backtest summary. Tickers: ${availableTickers.join(", ")}. Strategy: ${config.strategy}. Period: ${config.startDate} to ${config.endDate}. Portfolio CAGR: ${result.cagr}%. Sharpe: ${result.sharpe}. MaxDD: ${result.maxDrawdown}%. Win rate: ${result.winRate}%. Benchmark: ${config.benchmark}. Be direct and specific. No disclaimers.`,
    });
  } catch { /* summary is best-effort */ }

  const finalResult: BacktestResult = { ...result, summary };

  // ── Step 5: Persist ───────────────────────────────────────────────────────
  await db.collection("users").doc(userId).collection("backtests").add({
    userId,
    query,
    config: JSON.stringify(config),
    result: JSON.stringify(finalResult),
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json(finalResult);
}

// ── Backtest engine ─────────────────────────────────────────────────────────

function computeBacktest(
  config: BacktestConfig,
  candleMap: Map<string, { dates: number[]; closes: number[] }>
): Omit<BacktestResult, "summary"> {
  // Build per-ticker daily price maps (date string → close)
  const pricesByTicker: Record<string, Record<string, number>> = {};
  for (const ticker of [...config.tickers, config.benchmark]) {
    const data = candleMap.get(ticker);
    if (!data) continue;
    pricesByTicker[ticker] = {};
    for (let i = 0; i < data.dates.length; i++) {
      const ds = new Date(data.dates[i] * 1000).toISOString().slice(0, 10);
      pricesByTicker[ticker][ds] = data.closes[i];
    }
  }

  // Anchor every series to a common calendar: the dates present in EVERY ticker
  // (benchmark included). Combining returns by array index would desync tickers
  // that trade on different days (listing gaps, halts, missing bars) — day N of
  // one ticker could be a different calendar date than day N of another. By
  // computing returns over a single shared, sorted date list we guarantee index
  // i means the same date for all series.
  const seriesTickers = [...config.tickers, config.benchmark];
  let commonDates: string[] = Object.keys(pricesByTicker[config.benchmark] ?? {}).sort();
  for (const ticker of seriesTickers) {
    const prices = pricesByTicker[ticker] ?? {};
    commonDates = commonDates.filter((d) => prices[d] != null);
  }

  const dailyRetsByTicker: Record<string, number[]> = {};
  for (const ticker of seriesTickers) {
    const prices = pricesByTicker[ticker] ?? {};
    const rets: number[] = [];
    for (let i = 1; i < commonDates.length; i++) {
      const prev = prices[commonDates[i - 1]];
      const curr = prices[commonDates[i]];
      rets.push(prev > 0 ? (curr - prev) / prev : 0);
    }
    dailyRetsByTicker[ticker] = rets;
  }

  const benchRets = dailyRetsByTicker[config.benchmark] ?? [];
  // Every series now shares this length; the return at index i is the move from
  // commonDates[i] to commonDates[i+1].
  const nDays = Math.max(0, commonDates.length - 1);

  // Compute portfolio daily returns
  const portRets: number[] = [];

  if (config.strategy === "momentum") {
    const lookback = Math.min(config.rebalancePeriod, 20);
    let weights: Record<string, number> = {};
    config.tickers.forEach((t) => { weights[t] = 1 / config.tickers.length; });

    for (let i = 0; i < nDays; i++) {
      if (i % config.rebalancePeriod === 0 && i >= lookback) {
        const scores = config.tickers.map((t) => {
          const rets = dailyRetsByTicker[t] ?? [];
          const trailing = rets.slice(Math.max(0, i - lookback), i);
          const cumRet = trailing.reduce((acc, r) => acc * (1 + r), 1) - 1;
          return { ticker: t, score: cumRet };
        });
        scores.sort((a, b) => b.score - a.score);
        const topN = Math.max(1, Math.ceil(config.tickers.length * 0.5));
        const topTickers = new Set(scores.slice(0, topN).map((s) => s.ticker));
        weights = {};
        config.tickers.forEach((t) => {
          weights[t] = topTickers.has(t) ? 1 / topN : 0;
        });
      }
      const dayRet = config.tickers.reduce(
        (sum, t) => sum + (weights[t] ?? 0) * (dailyRetsByTicker[t]?.[i] ?? 0),
        0
      );
      portRets.push(dayRet);
    }
  } else {
    // buy_hold / equal_weight: simple average of daily returns
    for (let i = 0; i < nDays; i++) {
      const avg = config.tickers.reduce(
        (sum, t) => sum + (dailyRetsByTicker[t]?.[i] ?? 0),
        0
      ) / config.tickers.length;
      portRets.push(avg);
    }
  }

  // Build cumulative return series (downsample to ≤200 points)
  const seriesDates = commonDates.slice(1, nDays + 1);
  const rawSeries: BacktestSeries[] = [];
  let cumPort = 1;
  let cumBench = 1;
  for (let i = 0; i < nDays; i++) {
    cumPort *= 1 + portRets[i];
    cumBench *= 1 + (benchRets[i] ?? 0);
    rawSeries.push({
      date: seriesDates[i] ?? "",
      portfolio: +((cumPort - 1) * 100).toFixed(2),
      benchmark: +((cumBench - 1) * 100).toFixed(2),
    });
  }

  const MAX_POINTS = 200;
  const step = Math.ceil(rawSeries.length / MAX_POINTS);
  const series = rawSeries.filter((_, i) => i % step === 0 || i === rawSeries.length - 1);

  // ── Statistics ─────────────────────────────────────────────────────────
  const annFactor = 252;
  const mean = portRets.reduce((a, b) => a + b, 0) / (portRets.length || 1);
  const variance = portRets.reduce((a, b) => a + (b - mean) ** 2, 0) / (portRets.length || 1);
  const stdDev = Math.sqrt(variance);
  const sharpe = stdDev > 0 ? +((mean / stdDev) * Math.sqrt(annFactor)).toFixed(2) : 0;

  const years = (portRets.length || 1) / annFactor;
  const cagr = years > 0 ? +(((cumPort ** (1 / years)) - 1) * 100).toFixed(2) : 0;

  let peak = 1;
  let maxDD = 0;
  let runningCum = 1;
  for (const r of portRets) {
    runningCum *= 1 + r;
    if (runningCum > peak) peak = runningCum;
    const dd = peak > 0 ? (peak - runningCum) / peak : 0;
    if (dd > maxDD) maxDD = dd;
  }
  const maxDrawdown = +(-maxDD * 100).toFixed(2);

  const winRate = +(portRets.filter((r) => r > 0).length / (portRets.length || 1) * 100).toFixed(1);

  return {
    config: { ...config },
    series,
    sharpe,
    maxDrawdown,
    cagr,
    winRate,
  };
}
