// Aggregated per-ticker data for the stock research page (/stock/[ticker]).
//
// Everything here runs server-side and uses app-level API keys (the same
// pattern as /api/quotes), so it works regardless of the signed-in user — the
// dev auth bypass included. Each sub-fetch is failure-isolated: if one source
// errors, its field comes back `null` and the page degrades panel-by-panel
// rather than failing whole.
//
// Phase 1 scope. The `sentiment` field is a lightweight placeholder derived
// from news headlines; Phase 3 replaces it with the multi-source LLM engine
// (Reddit + news + StockTwits + X) behind the same shape.

import {
  getQuote,
  getCompanyProfile,
  getBasicFinancials,
  getRecommendationTrends,
  getPriceTarget,
  getInsiderTransactions,
  getCompanyNews,
  getCandles,
  type TickerSnapshot,
  type CandleResponse,
} from "@/lib/finnhub";
import {
  getCikByTicker,
  getCompanyFacts,
  extractFundamentalTimeSeries,
  type FundamentalTimeSeries,
} from "@/lib/edgar";

// ── Public types ───────────────────────────────────────────────────────────

export interface StockProfile {
  name: string | null;
  exchange: string | null;
  industry: string | null;
  logo: string | null;
  weburl: string | null;
  marketCap: number | null; // millions USD (Finnhub's unit)
  currency: string | null;
}

export interface KeyStats {
  marketCap: number | null; // millions USD
  peTTM: number | null;
  high52: number | null;
  low52: number | null;
  beta: number | null;
  dividendYield: number | null; // percent
  epsTTM: number | null;
}

export interface AnalystRatings {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  period: string | null;
  targetMean: number | null;
  targetHigh: number | null;
  targetLow: number | null;
}

export interface InsiderTrade {
  name: string;
  shares: number; // signed change
  direction: "buy" | "sell";
  filingDate: string;
  transactionDate: string;
}

export interface NewsItem {
  headline: string;
  source: string;
  url: string;
  datetime: number; // unix seconds
  summary: string;
  image: string; // article thumbnail URL ("" when the provider omits one)
}

export type SentimentLabel = "positive" | "neutral" | "negative";

export interface SentimentRead {
  // 0–100, where 50 is neutral. Shaped to match the future multi-source engine.
  score: number;
  label: SentimentLabel;
  sampleSize: number;
  basis: string; // human-readable source description
  placeholder: boolean; // true until Phase 3 upgrades it
}

export interface StockBundle {
  ticker: string;
  profile: StockProfile | null;
  quote: TickerSnapshot | null;
  keyStats: KeyStats | null;
  candles: CandleResponse | null;
  candleRange: ChartRange;
  analysts: AnalystRatings | null;
  fundamentals: FundamentalTimeSeries | null;
  insider: InsiderTrade[] | null;
  news: NewsItem[] | null;
  sentiment: SentimentRead | null;
}

// ── Chart range helpers ──────────────────────────────────────────────────────

export type ChartRange = "1D" | "1W" | "1M" | "3M" | "1Y" | "5Y";

export const CHART_RANGES: ChartRange[] = ["1D", "1W", "1M", "3M", "1Y", "5Y"];

const DAY = 86_400;

// Map a UI range to a Finnhub candle resolution + time window (unix seconds).
export function rangeToCandleParams(range: ChartRange): {
  resolution: string;
  from: number;
  to: number;
} {
  const to = Math.floor(Date.now() / 1000);
  switch (range) {
    case "1D":
      return { resolution: "5", from: to - 2 * DAY, to }; // 2d window covers weekends/holidays
    case "1W":
      return { resolution: "30", from: to - 8 * DAY, to };
    case "1M":
      return { resolution: "D", from: to - 33 * DAY, to };
    case "3M":
      return { resolution: "D", from: to - 95 * DAY, to };
    case "1Y":
      return { resolution: "D", from: to - 370 * DAY, to };
    case "5Y":
      return { resolution: "W", from: to - 5 * 366 * DAY, to };
  }
}

export function isChartRange(value: string | null | undefined): value is ChartRange {
  return !!value && (CHART_RANGES as string[]).includes(value);
}

// ── Field extractors (defensive: vendor shapes vary) ─────────────────────────

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function extractProfile(raw: unknown): StockProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  // Finnhub returns {} for unknown symbols.
  if (!p.name && !p.ticker && !p.exchange) return null;
  return {
    name: (p.name as string) ?? null,
    exchange: (p.exchange as string) ?? null,
    industry: (p.finnhubIndustry as string) ?? null,
    logo: (p.logo as string) ?? null,
    weburl: (p.weburl as string) ?? null,
    marketCap: num(p.marketCapitalization),
    currency: (p.currency as string) ?? null,
  };
}

function extractKeyStats(raw: unknown): KeyStats | null {
  if (!raw || typeof raw !== "object") return null;
  const m = (raw as { metric?: Record<string, unknown> }).metric;
  if (!m) return null;
  return {
    marketCap: num(m.marketCapitalization),
    peTTM: num(m.peTTM) ?? num(m.peBasicExclExtraTTM),
    high52: num(m["52WeekHigh"]),
    low52: num(m["52WeekLow"]),
    beta: num(m.beta),
    dividendYield:
      num(m.dividendYieldIndicatedAnnual) ?? num(m.currentDividendYieldTTM),
    epsTTM: num(m.epsTTM) ?? num(m.epsBasicExclExtraItemsTTM),
  };
}

function extractAnalysts(trends: unknown, target: unknown): AnalystRatings | null {
  const arr = Array.isArray(trends) ? (trends as Record<string, unknown>[]) : [];
  const latest = arr[0]; // Finnhub returns newest-first
  const t = (target && typeof target === "object" ? target : {}) as Record<string, unknown>;
  if (!latest && !t.targetMean) return null;
  return {
    strongBuy: (num(latest?.strongBuy) ?? 0) as number,
    buy: (num(latest?.buy) ?? 0) as number,
    hold: (num(latest?.hold) ?? 0) as number,
    sell: (num(latest?.sell) ?? 0) as number,
    strongSell: (num(latest?.strongSell) ?? 0) as number,
    period: (latest?.period as string) ?? null,
    targetMean: num(t.targetMean),
    targetHigh: num(t.targetHigh),
    targetLow: num(t.targetLow),
  };
}

function extractInsider(raw: unknown): InsiderTrade[] | null {
  const data = (raw as { data?: unknown[] })?.data;
  if (!Array.isArray(data) || data.length === 0) return null;
  const trades = data
    .map((d) => {
      const r = d as Record<string, unknown>;
      const change = num(r.change) ?? 0;
      // SEC Form 4 transaction code. Only "P" (open-market purchase) and "S"
      // (open-market sale) are genuine buy/sell signals; "A"/"M"/"G"/"F" etc.
      // are grants, option exercises, gifts and tax dispositions, which would
      // otherwise masquerade as bullish insider "buys". When the code is
      // absent, fall back to the share-change sign.
      const code =
        typeof r.transactionCode === "string" ? r.transactionCode.toUpperCase() : "";
      const direction: "buy" | "sell" | null =
        code === "P" ? "buy"
        : code === "S" ? "sell"
        : code ? null
        : change >= 0 ? "buy" : "sell";
      return {
        name: (r.name as string) ?? "Insider",
        shares: change,
        direction,
        filingDate: (r.filingDate as string) ?? "",
        transactionDate: (r.transactionDate as string) ?? "",
      };
    })
    .filter((t): t is InsiderTrade => t.direction !== null && t.shares !== 0)
    .slice(0, 12);
  return trades.length ? trades : null;
}

function extractNews(raw: unknown): NewsItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return (raw as Record<string, unknown>[])
    .filter((n) => n.headline && n.url)
    .slice(0, 12)
    .map((n) => ({
      headline: (n.headline as string) ?? "",
      source: (n.source as string) ?? "",
      url: (n.url as string) ?? "",
      datetime: (num(n.datetime) ?? 0) as number,
      summary: (n.summary as string) ?? "",
      image: typeof n.image === "string" ? n.image : "",
    }));
}

// ── Placeholder sentiment (Phase 3 replaces) ─────────────────────────────────

const POSITIVE_WORDS = [
  "surge", "soar", "jump", "rally", "beat", "beats", "record", "high", "growth",
  "upgrade", "bullish", "strong", "gain", "gains", "rises", "rise", "boost",
  "outperform", "buy", "soars", "wins", "profit", "tops", "raises", "optimistic",
];
const NEGATIVE_WORDS = [
  "plunge", "drop", "fall", "falls", "slump", "miss", "misses", "low", "cut",
  "downgrade", "bearish", "weak", "loss", "losses", "decline", "sinks", "sink",
  "warning", "lawsuit", "probe", "sell", "tumble", "slips", "concerns", "fears",
];

// Naive headline scorer. Honest about being a placeholder via the `placeholder`
// flag and `basis` text so the UI can label it accordingly.
export function placeholderSentiment(news: NewsItem[] | null): SentimentRead | null {
  if (!news || news.length === 0) return null;
  let pos = 0;
  let neg = 0;
  for (const item of news) {
    // Whole-word matching via a token Set. Substring matching (text.includes)
    // false-positives badly: "against"→gain, "below"/"slowdown"→low,
    // "highlights"→high, "commission"→miss, "laptops"→tops.
    const tokens = new Set(
      `${item.headline} ${item.summary}`.toLowerCase().split(/[^a-z]+/)
    );
    for (const w of POSITIVE_WORDS) if (tokens.has(w)) pos++;
    for (const w of NEGATIVE_WORDS) if (tokens.has(w)) neg++;
  }
  const total = pos + neg;
  // 50 neutral baseline; nudge toward the dominant polarity.
  const score = total === 0 ? 50 : Math.round((pos / total) * 100);
  const label: SentimentLabel = score >= 60 ? "positive" : score <= 40 ? "negative" : "neutral";
  return {
    score,
    label,
    sampleSize: news.length,
    basis: "recent news headlines",
    placeholder: true,
  };
}

// ── Fundamentals via EDGAR (many tickers have no CIK: ETFs, foreign, etc.) ────

async function fetchFundamentals(ticker: string): Promise<FundamentalTimeSeries | null> {
  const cik = await getCikByTicker(ticker);
  if (!cik) return null;
  const facts = await getCompanyFacts(cik);
  const ts = extractFundamentalTimeSeries(facts, 5);
  // Treat an all-empty series as "no data".
  if (ts.revenue.length === 0 && ts.netIncome.length === 0) return null;
  return ts;
}

// ── Aggregators ──────────────────────────────────────────────────────────────

async function settled<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

/**
 * Run thunks with at most `limit` in flight. Each thunk's rejection is isolated
 * to a `null` in the output (index-aligned), so one rate-limited Finnhub call
 * can't blank the whole bundle. Used to keep the per-ticker fan-out under the
 * 60/min free-tier ceiling that was intermittently 429-ing the analyst feed.
 */
export async function runPooled<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<Array<T | null>> {
  const out = new Array<T | null>(tasks.length).fill(null);
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const idx = cursor++;
      try {
        out[idx] = await tasks[idx]();
      } catch {
        out[idx] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return out;
}

/**
 * Net insider flow as a signed magnitude in roughly [-1, 1].
 * netShares / sharesOutstanding is a minuscule number for real companies, so we
 * scale it by a sensitivity constant and clamp. The point is that *routine*
 * scheduled selling (a sliver of float) sits near 0 (neutral), while only an
 * unusually large net buy or sell pushes toward the extremes. Returns null when
 * there's nothing to judge — the caller then EXCLUDES the insider factor rather
 * than scoring a misleading 50.
 */
export function insiderNetFlow(
  trades: Array<{ shares: number }> | null,
  sharesOutstanding: number | null
): number | null {
  if (!trades || trades.length === 0) return null;
  const net = trades.reduce((a, t) => a + (Number.isFinite(t.shares) ? t.shares : 0), 0);
  if (net === 0) return 0;
  if (!sharesOutstanding || sharesOutstanding <= 0) {
    return Math.sign(net) * 0.1;
  }
  const SENSITIVITY = 800; // ~0.1% of float net ≈ 0.8 magnitude before clamp
  const raw = (net / sharesOutstanding) * SENSITIVITY;
  return Math.max(-1, Math.min(1, raw));
}

const DEFAULT_RANGE: ChartRange = "1M";

// News window: last ~30 days.
function newsWindow(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * DAY * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}

/** Assemble the full per-ticker bundle for first paint. */
export async function getStockBundle(rawTicker: string): Promise<StockBundle> {
  const ticker = rawTicker.toUpperCase();
  const { from, to } = newsWindow();
  const { resolution, from: cFrom, to: cTo } = rangeToCandleParams(DEFAULT_RANGE);

  // Finnhub free tier is 60/min and shared with the research scan; cap the
  // per-ticker Finnhub fan-out at 4 in flight so the analyst feed stops 429-ing.
  const [profileRaw, quote, statsRaw, candles, trendsRaw, targetRaw, insiderRaw, newsRaw] =
    await runPooled(
      [
        () => getCompanyProfile(ticker),
        () => getQuote(ticker),
        () => getBasicFinancials(ticker),
        () => getCandles(ticker, resolution, cFrom, cTo),
        () => getRecommendationTrends(ticker),
        () => getPriceTarget(ticker),
        () => getInsiderTransactions(ticker),
        () => getCompanyNews(ticker, from, to),
      ],
      4
    );
  const fundamentals = await settled(fetchFundamentals(ticker)); // EDGAR, separate host

  const news = extractNews(newsRaw);

  return {
    ticker,
    profile: extractProfile(profileRaw),
    quote,
    keyStats: extractKeyStats(statsRaw),
    candles: candles && candles.s === "ok" ? candles : null,
    candleRange: DEFAULT_RANGE,
    analysts: extractAnalysts(trendsRaw, targetRaw),
    fundamentals,
    insider: extractInsider(insiderRaw),
    news,
    sentiment: placeholderSentiment(news),
  };
}

/** Candles only, for timeframe switches on the chart. */
export async function getStockCandles(
  rawTicker: string,
  range: ChartRange
): Promise<CandleResponse | null> {
  const ticker = rawTicker.toUpperCase();
  const { resolution, from, to } = rangeToCandleParams(range);
  const candles = await settled(getCandles(ticker, resolution, from, to));
  return candles && candles.s === "ok" ? candles : null;
}
