"use client";
import { useState, useEffect } from "react";
import useSWR, { mutate } from "swr";

import type {
  HFData, TickerMarkov, Regime,
  Strategy, Order, Fill, WatchItem, BotLogEntry,
} from "@/components/hedge-fund/types";
import {
  HFDualPane,
  type DualTab, type V10Account, type V10Composite, type V10Index, type V10Bot,
} from "@/components/hedge-fund/HFDualPane";
import { authFetch } from "@/lib/authFetch";
import { clampPct, normalizeRegime, dominantRegime, type MarkovData } from "@/lib/markov";
import type { AlpacaAccount } from "@/app/api/alpaca/account/route";
import type { BotResponse } from "@/app/api/bot/route";
import type { TickerSnapshot } from "@/lib/finnhub";

// ── API fetchers ────────────────────────────────────────────────────────────

type MarkovResponse = {
  results: Record<string, MarkovData>;
  errors: Record<string, string>;
  generatedAt: string;
};

async function fetchMarkov(url: string): Promise<MarkovResponse> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch Markov data");
  return res.json();
}
async function fetchAlpaca(url: string): Promise<AlpacaAccount> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Alpaca fetch failed");
  return res.json();
}
async function fetchStrategies(url: string): Promise<Strategy[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch strategies");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}
async function fetchOrders(url: string): Promise<Order[]> {
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}
async function fetchFills(url: string): Promise<Fill[]> {
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}
async function fetchQuotes(url: string): Promise<TickerSnapshot[]> {
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}
async function fetchBot(url: string): Promise<BotResponse> {
  const res = await fetch(url);
  return res.json();
}

// ── Ticker display names ──────────────────────────────────────────────────────

const TICKER_NAMES: Record<string, string> = {
  SPY: "S&P 500 ETF", QQQ: "Nasdaq 100 ETF", DIA: "Dow Jones ETF", IWM: "Russell 2000 ETF",
  NVDA: "NVIDIA", AAPL: "Apple", MSFT: "Microsoft", GOOGL: "Alphabet", META: "Meta Platforms",
  TSLA: "Tesla", AMZN: "Amazon", AMD: "Advanced Micro Devices", SMCI: "Super Micro Computer",
  PLTR: "Palantir", COIN: "Coinbase", CRWD: "CrowdStrike", JPM: "JPMorgan Chase", VIX: "CBOE VIX",
};

const INDEX_TICKERS = ["SPY", "QQQ", "DIA"] as const;
const INDEX_NAMES: Record<string, string> = { SPY: "S&P 500", QQQ: "Nasdaq 100", DIA: "Dow Jones" };

// ── Demo fallbacks (used when live brokers/bot aren't connected) ───────────────

const DEMO_ACCOUNT: V10Account = {
  nav: 104287.42, dayPnL: 1167.38, dayPnLPct: 1.13,
  cash: 34219.07, buyingPower: 68438.14, trades: 7,
  history: [
    100000, 100210, 99840, 100120, 100412, 100780, 100620, 101040, 101380, 101220,
    101940, 102310, 102008, 102530, 102810, 103120, 103408, 103120, 103510, 103240,
    103670, 103120, 103480, 103820, 103580, 103940, 104120, 104287,
  ],
};

const DEMO_BOT: V10Bot = {
  running: true, uptime: "4h 12m", todayTrades: 7, todayPnL: 412.55,
  cashAllocated: 36000, lastHeartbeat: "14:32:04 ET",
};

const DEMO_LOG: BotLogEntry[] = [
  { ts: "14:32:04", lvl: "INFO", msg: "Heartbeat OK · 2 strategies armed · 0 errors" },
  { ts: "14:18:42", lvl: "ORDER", msg: "BUY 12 SPY @ 527.94 (ORB-15 SPY)" },
  { ts: "14:18:38", lvl: "SIGNAL", msg: "ORB-15 SPY: breakout above 527.81 (range 525.62–527.81)" },
  { ts: "14:02:11", lvl: "RISK", msg: "Position concentration check: SPY 19.2% NAV — within limits" },
  { ts: "13:54:08", lvl: "ORDER", msg: "SELL 6 QQQ @ 459.81 (Regime tilt QQQ — trim)" },
  { ts: "13:54:01", lvl: "SIGNAL", msg: "Regime tilt QQQ: bias flipped Bull→Sideways, trim 25%" },
  { ts: "11:12:33", lvl: "ORDER", msg: "BUY 4 NVDA @ 1144.32 (Regime tilt QQQ — beta add)" },
  { ts: "10:42:09", lvl: "ORDER", msg: "BUY 18 QQQ @ 461.20 (Regime tilt QQQ — initiation)" },
  { ts: "09:48:21", lvl: "ORDER", msg: "SELL 50 SH @ 12.41 (Regime tilt QQQ — unhedge)" },
  { ts: "09:35:00", lvl: "INFO", msg: "Market open · regime poll SPY=Sideways QQQ=Bear DIA=Bull" },
  { ts: "09:34:58", lvl: "INFO", msg: "Bot started · 2 strategies armed · checkpoint loaded" },
];

const DEMO_WATCHLIST: WatchItem[] = [
  { ticker: "SPY", name: "S&P 500 ETF", px: 528.41, dayPct: 0.34, bid: 528.40, ask: 528.42, signal: "Sideways" },
  { ticker: "QQQ", name: "Nasdaq 100 ETF", px: 458.92, dayPct: -0.41, bid: 458.91, ask: 458.93, signal: "Bear" },
  { ticker: "NVDA", name: "NVIDIA", px: 1148.70, dayPct: 2.15, bid: 1148.6, ask: 1148.8, signal: "Bull" },
  { ticker: "AAPL", name: "Apple", px: 192.84, dayPct: 0.18, bid: 192.83, ask: 192.85, signal: "Sideways" },
  { ticker: "MSFT", name: "Microsoft", px: 428.12, dayPct: -0.22, bid: 428.10, ask: 428.14, signal: "Sideways" },
  { ticker: "VIX", name: "CBOE VIX", px: 13.84, dayPct: -2.84, bid: 13.82, ask: 13.86, signal: "Bull" },
];

const DEMO_ORDERS: Order[] = [
  { id: "ord-9182", side: "BUY", ticker: "AAPL", qty: 25, type: "LMT", px: 192.40, tif: "DAY", filled: 0, status: "Working" },
  { id: "ord-9180", side: "SELL", ticker: "NVDA", qty: 4, type: "STP-LMT", px: 1142.00, tif: "DAY", filled: 0, status: "Working" },
  { id: "ord-9176", side: "BUY", ticker: "MSFT", qty: 10, type: "LMT", px: 428.50, tif: "GTC", filled: 3, status: "Partial" },
];

// ── Markov helpers ────────────────────────────────────────────────────────────

function buildMarkovSection(apiData: MarkovResponse, tickerKeys: string[]): HFData["markov"] {
  const tickers: TickerMarkov[] = tickerKeys
    .map((t) => {
      const d = apiData.results[t];
      if (!d) return null;
      return {
        ticker: t, label: INDEX_NAMES[t] ?? t, bias: d.currentBias as Regime,
        rows: d.rows, dateRange: d.dateRange, stationary: d.stationary,
        persistence: d.persistence, transitionMatrix: d.transitionMatrix,
        hmm: d.hmm ?? { Bull: 0, Sideways: 0, Bear: 0 },
        backtest: d.backtest, allocationRec: d.allocationRec,
      } satisfies TickerMarkov;
    })
    .filter((t): t is TickerMarkov => t !== null);

  const n = tickers.length || 1;
  // Average each regime probability across tickers, then normalize to 100% so the
  // composite read can never display impossible figures (e.g. >100% Bull + Bear).
  const norm = normalizeRegime(
    tickers.reduce((s, t) => s + t.stationary.Bear, 0) / n,
    tickers.reduce((s, t) => s + t.stationary.Sideways, 0) / n,
    tickers.reduce((s, t) => s + t.stationary.Bull, 0) / n,
  );
  const avgSharpe = tickers.reduce((s, t) => s + t.backtest.sharpe, 0) / n;
  const equityPct = clampPct(Math.round(tickers.reduce((s, t) => s + t.allocationRec.equityPct, 0) / n));
  // Bias is the dominant normalized regime, so the headline pill always matches the bars.
  const bias = dominantRegime(norm) as Regime;

  return {
    generatedAt: apiData.generatedAt,
    composite: { bias, avgBull: norm.bull, avgSideways: norm.sideways, avgBear: norm.bear, avgSharpe, equityPct },
    tickers,
  };
}

function markovSignal(ticker: string, markov: HFData["markov"]): Regime {
  return markov.tickers.find((t) => t.ticker === ticker)?.bias ?? markov.composite.bias;
}

const VALID_TABS: DualTab[] = ["dashboard", "strategies", "trading", "activity"];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HedgeFundPage() {
  const [tab, setTab] = useState<DualTab>("dashboard");

  // window.location is client-only; reading the initial tab from the URL in an
  // effect (not render) is the hydration-safe way to seed it without an SSR mismatch.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("tab") as DualTab | null;
    // legacy aliases from the previous layout
    const alias: Record<string, DualTab> = { overview: "dashboard", bot: "activity" };
    const resolved = p ? (alias[p] ?? p) : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (resolved && VALID_TABS.includes(resolved)) setTab(resolved);
  }, []);

  function handleTab(t: DualTab) {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState({}, "", url.toString());
  }

  // ── Data sources ──
  const { data: markovApiData } = useSWR<MarkovResponse>(
    "/api/markov?tickers=SPY,QQQ,DIA&years=5", fetchMarkov,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );
  const { data: alpacaData } = useSWR<AlpacaAccount>(
    "/api/alpaca/account", fetchAlpaca,
    { refreshInterval: 30_000, revalidateOnFocus: true },
  );
  const { data: strategiesData } = useSWR<Strategy[]>(
    "/api/strategies", fetchStrategies,
    { revalidateOnFocus: false, dedupingInterval: 5_000 },
  );
  const { data: ordersData } = useSWR<Order[]>(
    "/api/alpaca/orders", fetchOrders,
    { refreshInterval: 10_000, revalidateOnFocus: true },
  );
  const { data: fillsData } = useSWR<Fill[]>(
    "/api/alpaca/activities", fetchFills,
    { refreshInterval: 30_000, revalidateOnFocus: true },
  );
  const { data: botResp } = useSWR<BotResponse>(
    "/api/bot", fetchBot,
    { refreshInterval: 5_000, revalidateOnFocus: false },
  );

  const alpaca = alpacaData?.live ? alpacaData : null;
  const strategies = strategiesData ?? [];
  const botLive = botResp?.live ? botResp.data : null;
  const isLive = !!alpaca;

  // Quotes for index tiles + active strategy tickers (drives watchlist + tape).
  const activeTickers = [...new Set(strategies.filter((s) => s.active).flatMap((s) => s.tickers))];
  const quoteTickers = [...new Set([...INDEX_TICKERS, ...activeTickers])];
  const { data: quotesData } = useSWR<TickerSnapshot[]>(
    `/api/quotes?tickers=${quoteTickers.join(",")}`, fetchQuotes,
    { refreshInterval: 30_000, revalidateOnFocus: false },
  );

  const quoteMap = new Map((quotesData ?? []).map((q) => [q.ticker, q]));

  // ── Markov composite + indices ──
  const markovSection = markovApiData
    ? buildMarkovSection(markovApiData, ["SPY", "QQQ", "DIA"])
    : {
        generatedAt: new Date().toISOString(),
        composite: { bias: "Sideways" as Regime, avgBull: 41.2, avgSideways: 36.3, avgBear: 22.5, avgSharpe: 0.74, equityPct: 68 },
        tickers: [] as TickerMarkov[],
      };

  const composite: V10Composite = markovSection.composite;

  const indices: V10Index[] = INDEX_TICKERS.map((t) => {
    const m = markovSection.tickers.find((x) => x.ticker === t);
    const q = quoteMap.get(t);
    // Normalize each index's regime mix so its bar sums to 100% and its pill
    // (dominant regime) always matches the largest segment.
    const reg = m
      ? normalizeRegime(m.stationary.Bear, m.stationary.Sideways, m.stationary.Bull)
      : { bull: composite.avgBull, sideways: composite.avgSideways, bear: composite.avgBear };
    return {
      ticker: t,
      name: INDEX_NAMES[t] ?? t,
      bias: (m ? dominantRegime(reg) : composite.bias) as Regime,
      bull: reg.bull,
      sideways: reg.sideways,
      bear: reg.bear,
      sharpe: m?.backtest.sharpe ?? composite.avgSharpe,
      equity: clampPct(m?.allocationRec.equityPct ?? composite.equityPct),
      px: q?.price ?? 0,
      dayPct: q?.changePct ?? 0,
    };
  });

  // ── Watchlist (live quotes) ──
  const liveWatchlist: WatchItem[] = (quotesData ?? []).map((q) => ({
    ticker: q.ticker,
    name: TICKER_NAMES[q.ticker] ?? q.ticker,
    px: q.price,
    dayPct: q.changePct,
    bid: +(q.price * 0.9999).toFixed(2),
    ask: +(q.price * 1.0001).toFixed(2),
    signal: markovSignal(q.ticker, markovSection),
  }));
  const watchlist = liveWatchlist.length > 0 ? liveWatchlist : DEMO_WATCHLIST;

  // ── Account / bot / orders / fills (live with demo fallback) ──
  const account: V10Account = alpaca
    ? {
        nav: alpaca.equity,
        dayPnL: alpaca.dayPl,
        dayPnLPct: alpaca.dayPlPct,
        cash: alpaca.cash,
        buyingPower: alpaca.buyingPower,
        trades: alpaca.dayTradeCount,
        history: alpaca.history.map((h) => h.equity),
      }
    : DEMO_ACCOUNT;

  const bot: V10Bot = botLive
    ? {
        running: botLive.status === "Running",
        uptime: botLive.uptime,
        todayTrades: botLive.todayTrades,
        todayPnL: botLive.todayPnL,
        cashAllocated: botLive.cashAllocated,
        lastHeartbeat: botLive.lastHeartbeat,
      }
    : DEMO_BOT;

  const log = botLive ? botLive.log : DEMO_LOG;
  const openOrders = (ordersData?.length ?? 0) > 0 ? ordersData! : (isLive ? [] : DEMO_ORDERS);
  const fills = fillsData ?? [];

  const asOf = markovSection.generatedAt
    ? new Date(markovSection.generatedAt).toLocaleString("en-US", {
        weekday: "short", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "—";

  async function handleToggleStrategy(id: string) {
    const s = strategies.find((x) => x.id === id);
    if (!s) return;
    await authFetch(`/api/strategies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !s.active }),
    });
    await mutate("/api/strategies");
  }

  return (
    <div className="hf-shell">
      <HFDualPane
        tab={tab}
        onTab={handleTab}
        isLive={isLive}
        asOf={asOf}
        account={account}
        composite={composite}
        indices={indices}
        bot={bot}
        log={log}
        strategies={strategies}
        watchlist={watchlist}
        openOrders={openOrders}
        fills={fills}
        onToggleStrategy={handleToggleStrategy}
      />
    </div>
  );
}
