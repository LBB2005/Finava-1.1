import { getAggregates } from "@/lib/polygon";
import { getAlpacaBars, hasAlpacaData } from "@/lib/alpaca";

const BASE = "https://finnhub.io/api/v1";
const KEY = process.env.FINNHUB_API_KEY;
const FETCH_TIMEOUT_MS = 10_000;

async function fhFetch(path: string, revalidate = 30) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${BASE}${path}${sep}token=${KEY}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    next: { revalidate },
  });
  if (!res.ok) throw new Error(`Finnhub ${res.status}: ${path}`);
  return res.json();
}

export interface TickerSnapshot {
  ticker: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  // ISO timestamp of the underlying market quote (Finnhub's `t`), so the UI can
  // show how fresh the price is rather than implying it's real-time. Quotes are
  // cached up to 30s (revalidate), so "now" would overstate freshness.
  asOf: string;
}

// Real-time quote for a single ticker.
// Finnhub returns all-zero fields for unknown symbols (and null on some errors).
// Throw in that case so getSnapshots drops the ticker instead of surfacing $0 as a
// real price — a fabricated zero is worse than a missing row in a finance app.
export async function getQuote(ticker: string): Promise<TickerSnapshot> {
  const d = await fhFetch(`/quote?symbol=${ticker}`);
  const price = d.c;
  if (typeof price !== "number" || price <= 0) {
    throw new Error(`No quote available for ${ticker}`);
  }
  return {
    ticker,
    price,
    change: d.d ?? 0,
    changePct: d.dp ?? 0,
    volume: 0,
    high: d.h ?? 0,
    low: d.l ?? 0,
    open: d.o ?? 0,
    prevClose: d.pc ?? 0,
    asOf: typeof d.t === "number" && d.t > 0
      ? new Date(d.t * 1000).toISOString()
      : new Date().toISOString(),
  };
}

// Batch quotes for multiple tickers
export async function getSnapshots(tickers: string[]): Promise<TickerSnapshot[]> {
  if (!tickers.length) return [];
  const results = await Promise.allSettled(tickers.map(getQuote));
  return results
    .filter((r): r is PromiseFulfilledResult<TickerSnapshot> => r.status === "fulfilled")
    .map((r) => r.value);
}

// Finnhub candle response shape, also produced by the Polygon fallback below.
export interface CandleResponse {
  s: "ok" | "no_data";
  c: number[];
  o: number[];
  h: number[];
  l: number[];
  v: number[];
  t: number[]; // Unix seconds
}

// Map a Finnhub resolution to a Polygon (multiplier, timespan) pair.
function resolutionToPolygon(resolution: string): { multiplier: number; timespan: string } {
  switch (resolution) {
    case "D": return { multiplier: 1, timespan: "day" };
    case "W": return { multiplier: 1, timespan: "week" };
    case "M": return { multiplier: 1, timespan: "month" };
    default: {
      const n = parseInt(resolution, 10);
      return Number.isFinite(n) && n > 0
        ? { multiplier: n, timespan: "minute" }
        : { multiplier: 1, timespan: "day" };
    }
  }
}

// Fetch OHLC from Polygon aggregates and reshape into the Finnhub candle format.
async function getCandlesFromPolygon(
  ticker: string,
  resolution: string,
  fromTs: number,
  toTs: number
): Promise<CandleResponse> {
  const { multiplier, timespan } = resolutionToPolygon(resolution);
  const from = new Date(fromTs * 1000).toISOString().slice(0, 10);
  const to = new Date(toTs * 1000).toISOString().slice(0, 10);
  const data = await getAggregates(ticker, multiplier, timespan, from, to) as {
    results?: { o: number; h: number; l: number; c: number; v: number; t: number }[];
  };
  const results = data.results ?? [];
  if (results.length === 0) {
    return { s: "no_data", c: [], o: [], h: [], l: [], v: [], t: [] };
  }
  return {
    s: "ok",
    c: results.map((r) => r.c),
    o: results.map((r) => r.o),
    h: results.map((r) => r.h),
    l: results.map((r) => r.l),
    v: results.map((r) => r.v),
    t: results.map((r) => Math.floor(r.t / 1000)), // Polygon ms → Finnhub seconds
  };
}

// OHLCV candles for technical analysis.
// resolution: 1, 5, 15, 30, 60, D, W, M
//
// Finnhub's /stock/candle endpoint is premium-gated (returns 403 on free/standard
// plans) even though /quote still works. We therefore try Finnhub first and
// transparently fall back to Alpaca market data (primary) then Polygon aggregates,
// returning the same shape so every caller (technical agent, risk agent, backtest)
// keeps working regardless of plan.
export async function getCandles(
  ticker: string,
  resolution: string,
  fromTs: number,
  toTs: number
): Promise<CandleResponse> {
  if (KEY) {
    try {
      const data = await fhFetch(
        `/stock/candle?symbol=${ticker}&resolution=${resolution}&from=${fromTs}&to=${toTs}`
      ) as CandleResponse;
      if (data?.s === "ok" && Array.isArray(data.c) && data.c.length > 0) {
        return data;
      }
    } catch {
      /* fall through to Alpaca / Polygon */
    }
  }

  if (hasAlpacaData()) {
    try {
      const data = await getAlpacaBars(ticker, resolution, fromTs, toTs);
      if (data.s === "ok" && data.c.length > 0) return data;
    } catch {
      /* fall through to Polygon */
    }
  }

  if (process.env.POLYGON_API_KEY) {
    return getCandlesFromPolygon(ticker, resolution, fromTs, toTs);
  }

  // No working data source — surface as Finnhub-shaped "no data" so callers degrade gracefully.
  return { s: "no_data", c: [], o: [], h: [], l: [], v: [], t: [] };
}

// Company news
export async function getCompanyNews(ticker: string, fromDate: string, toDate: string) {
  return fhFetch(`/company-news?symbol=${ticker}&from=${fromDate}&to=${toDate}`);
}

// General market news
export async function getMarketNews(category: "general" | "forex" | "crypto" | "merger" = "general") {
  return fhFetch(`/news?category=${category}`);
}

// Reported financials (annual/quarterly)
export async function getFinancialsReported(ticker: string, freq: "annual" | "quarterly" = "annual") {
  return fhFetch(`/stock/financials-reported?symbol=${ticker}&freq=${freq}`);
}

// Basic financials metrics (P/E, EV/EBITDA, margins, avg volume, etc.).
// Cached for an hour — these barely move intraday, and the research leaderboard
// fetches them across the whole universe, so a short TTL would hammer the
// free-tier rate limit on every refresh.
export async function getBasicFinancials(ticker: string) {
  return fhFetch(`/stock/metric?symbol=${ticker}&metric=all`, 3600);
}

// Historical EPS surprises
export async function getEarnings(ticker: string) {
  return fhFetch(`/stock/earnings?symbol=${ticker}&limit=8`);
}

// Upcoming earnings calendar
export async function getEarningsCalendar(fromDate: string, toDate: string, ticker?: string) {
  const sym = ticker ? `&symbol=${ticker}` : "";
  return fhFetch(`/calendar/earnings?from=${fromDate}&to=${toDate}${sym}`);
}

// Insider transactions (Form 4)
export async function getInsiderTransactions(ticker: string) {
  return fhFetch(`/stock/insider-transactions?symbol=${ticker}`);
}

// Recommendation trends (analyst ratings).
// Cached 6h: ratings move on a quarterly cadence, and the research factor engine
// fetches these across the whole S&P 500. A long TTL lets successful calls
// persist and accumulate across refreshes instead of re-hitting the free-tier
// rate limit (60/min) every cycle, so analyst coverage converges to full.
export async function getRecommendationTrends(ticker: string) {
  return fhFetch(`/stock/recommendation?symbol=${ticker}`, 21600);
}

// Analyst price targets (also cached 6h — see getRecommendationTrends).
export async function getPriceTarget(ticker: string) {
  return fhFetch(`/stock/price-target?symbol=${ticker}`, 21600);
}

// Company profile
export async function getCompanyProfile(ticker: string) {
  return fhFetch(`/stock/profile2?symbol=${ticker}`);
}

// Peers
export async function getPeers(ticker: string) {
  return fhFetch(`/stock/peers?symbol=${ticker}`);
}

// Major sector ETFs for macro context
export async function getMarketSnapshot(): Promise<TickerSnapshot[]> {
  const etfs = ["SPY", "QQQ", "IWM", "XLK", "XLF", "XLV", "XLE", "XLY", "XLI", "XLP"];
  return getSnapshots(etfs);
}

// Median peer P/E and P/S for relative valuation. Fetches /peers then each peer's
// metric (6h-cached via getBasicFinancials). Returns nulls when peers are unavailable.
export async function getPeerMetrics(
  ticker: string
): Promise<{ peerPe: number | null; peerPs: number | null }> {
  let peers: string[] = [];
  try {
    const raw = await getPeers(ticker);
    peers = (Array.isArray(raw) ? raw : []).filter((p) => p && p !== ticker).slice(0, 8);
  } catch {
    return { peerPe: null, peerPs: null };
  }
  if (peers.length === 0) return { peerPe: null, peerPs: null };

  const metrics = await Promise.all(
    peers.map(async (p) => {
      try {
        const d = (await getBasicFinancials(p)) as { metric?: Record<string, number> };
        return { pe: d.metric?.peTTM ?? null, ps: d.metric?.psTTM ?? null };
      } catch {
        return { pe: null, ps: null };
      }
    })
  );
  const median = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null && x > 0).sort((a, b) => a - b);
    if (!v.length) return null;
    const mid = Math.floor(v.length / 2);
    return v.length % 2 === 1 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  };
  return { peerPe: median(metrics.map((m) => m.pe)), peerPs: median(metrics.map((m) => m.ps)) };
}
