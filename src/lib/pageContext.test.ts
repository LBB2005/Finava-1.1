import { describe, it, expect } from "vitest";
import {
  buildStockSnapshot,
  buildWatchlistSnapshot,
  buildResearchSnapshot,
  buildPortfolioSnapshot,
  pageContextPrompt,
  pageContextRouteHint,
  PageContextSchema,
} from "./pageContext";
import type { StockBundle } from "./stockData";

function bundle(overrides: Partial<StockBundle> = {}): StockBundle {
  return {
    ticker: "AAPL",
    profile: { name: "Apple Inc.", exchange: "NASDAQ", industry: "Technology", logo: null, weburl: null, marketCap: 3_400_000, currency: "USD" },
    quote: { ticker: "AAPL", price: 228.5, change: 2.7, changePct: 1.2, volume: 1, high: 1, low: 1, open: 1, prevClose: 1, asOf: "2026-07-11T20:00:00Z" },
    keyStats: { marketCap: 3_400_000, peTTM: 34.1, high52: 237, low52: 164, beta: 1.2, dividendYield: 0.45, epsTTM: 6.7 },
    candles: null,
    candleRange: "1Y",
    analysts: { strongBuy: 12, buy: 8, hold: 5, sell: 1, strongSell: 0, period: "2026-07", targetMean: 250, targetHigh: 300, targetLow: 200 },
    fundamentals: {
      revenue: [{ year: 2024, value: 391_000_000_000 }],
      netIncome: [{ year: 2024, value: 97_000_000_000 }],
      operatingIncome: [], rAndD: [], operatingCashFlow: [], totalDebt: [], cash: [],
    },
    insider: null,
    news: null,
    sentiment: null,
    ...overrides,
  };
}

describe("buildStockSnapshot", () => {
  it("summarizes the core fields into a compact snapshot", () => {
    const s = buildStockSnapshot(bundle());
    expect(s).toContain("AAPL — Apple Inc.");
    expect(s).toContain("NASDAQ");
    expect(s).toContain("Price $228.50 (+1.20%)");
    expect(s).toContain("Mkt cap $3.40T"); // 3,400,000 millions → $3.40T
    expect(s).toContain("P/E 34.10");
    expect(s).toContain("52w $164.00–$237.00");
    expect(s).toContain("consensus Buy (20 buy / 5 hold / 1 sell)");
    expect(s).toContain("mean PT $250.00");
    expect(s).toContain("FY2024 revenue $391.00B");
    expect(s).toContain("net margin 24.8%");
  });

  it("omits (never fabricates) fields whose source is null", () => {
    const s = buildStockSnapshot(bundle({ quote: null, analysts: null, fundamentals: null, keyStats: null }));
    expect(s).toContain("AAPL — Apple Inc.");
    expect(s).not.toContain("Price");
    expect(s).not.toContain("P/E");
    expect(s).not.toContain("Analysts");
    expect(s).not.toContain("revenue");
    // Falls back to the profile market cap when keyStats is gone.
    expect(s).toContain("Mkt cap $3.40T");
  });

  it("labels a sell-heavy spread as Sell", () => {
    const s = buildStockSnapshot(bundle({ analysts: { strongBuy: 0, buy: 1, hold: 2, sell: 4, strongSell: 3, period: null, targetMean: null, targetHigh: null, targetLow: null } }));
    expect(s).toContain("consensus Sell");
  });
});

describe("buildWatchlistSnapshot", () => {
  it("lists the name and tickers, capping long lists", () => {
    expect(buildWatchlistSnapshot("Tech Bets", ["AAPL", "MSFT", "NVDA"]))
      .toBe('Watchlist "Tech Bets" — 3 names: AAPL, MSFT, NVDA');
    const many = Array.from({ length: 45 }, (_, i) => `T${i}`);
    const s = buildWatchlistSnapshot("Big", many);
    expect(s).toContain("45 names");
    expect(s).toContain("+5 more");
  });
  it("handles an empty list", () => {
    expect(buildWatchlistSnapshot("Empty", [])).toContain("empty");
  });
});

describe("buildResearchSnapshot", () => {
  it("names the lens, horizon, and top-ranked stocks", () => {
    const s = buildResearchSnapshot("screen", "month", [
      { ticker: "AAPL", grade: "A", score: 92.4 },
      { ticker: "MSFT", grade: "A-", score: 89.1 },
    ]);
    expect(s).toContain("SCREEN lens · month horizon");
    expect(s).toContain("AAPL (A, 92)");
    expect(s).toContain("MSFT (A-, 89)");
  });
});

describe("buildPortfolioSnapshot", () => {
  it("summarizes totals and largest positions", () => {
    const s = buildPortfolioSnapshot({
      totalValue: 61_742, totalGainPct: 52.1, positions: 11, cash: 5000,
      top: [{ ticker: "AAPL", weightPct: 18.2, gainLossPct: 66 }, { ticker: "NVDA", weightPct: 15, gainLossPct: 91.8 }],
    });
    expect(s).toContain("11 positions");
    expect(s).toContain("+52.1% all-time");
    expect(s).toContain("$5.0K cash");
    expect(s).toContain("AAPL 18% (+66.0%)");
  });
});

describe("pageContextPrompt", () => {
  it("anchors a stock page to the ticker and embeds the snapshot", () => {
    const block = pageContextPrompt({ kind: "stock", ticker: "AAPL", snapshot: "AAPL — Apple Inc." });
    expect(block).toContain("the AAPL stock page");
    expect(block).toContain("resolve vague references");
    expect(block).toContain("AAPL — Apple Inc.");
  });
  it("frames watchlist / research / portfolio pages", () => {
    expect(pageContextPrompt({ kind: "watchlist", label: "Tech Bets", snapshot: "…" })).toContain('their "Tech Bets" watchlist');
    expect(pageContextPrompt({ kind: "research", label: "SCREEN lens", snapshot: "…" })).toContain("the Research page (SCREEN lens)");
    expect(pageContextPrompt({ kind: "portfolio", label: "Portfolio", snapshot: "…" })).toContain("their Portfolio page");
  });
});

describe("pageContextRouteHint", () => {
  it("gives the router a per-kind subject hint", () => {
    expect(pageContextRouteHint({ kind: "stock", ticker: "AAPL", snapshot: "" })).toContain('route to "agent" for AAPL');
    expect(pageContextRouteHint({ kind: "watchlist", label: "Tech Bets", snapshot: "" })).toContain('"Tech Bets" watchlist');
    expect(pageContextRouteHint({ kind: "portfolio", snapshot: "" })).toContain("Portfolio page");
    expect(pageContextRouteHint({ kind: "research", label: "SCREEN lens", snapshot: "" })).toContain("Research page");
  });
});

describe("PageContextSchema", () => {
  it("accepts all four kinds and rejects an over-long snapshot / unknown kind", () => {
    expect(PageContextSchema.safeParse({ kind: "stock", ticker: "AAPL", snapshot: "x" }).success).toBe(true);
    expect(PageContextSchema.safeParse({ kind: "research", label: "SCREEN lens", snapshot: "x" }).success).toBe(true);
    expect(PageContextSchema.safeParse({ kind: "watchlist", label: "Tech", snapshot: "x" }).success).toBe(true);
    expect(PageContextSchema.safeParse({ kind: "portfolio", snapshot: "x" }).success).toBe(true);
    expect(PageContextSchema.safeParse({ kind: "stock", ticker: "AAPL", snapshot: "x".repeat(4001) }).success).toBe(false);
    expect(PageContextSchema.safeParse({ kind: "sector", snapshot: "x" }).success).toBe(false);
  });
});
