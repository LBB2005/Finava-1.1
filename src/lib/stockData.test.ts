import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  getCompanyProfile: vi.fn(),
  getQuote: vi.fn(),
  getBasicFinancials: vi.fn(),
  getCandles: vi.fn(),
  getRecommendationTrends: vi.fn(),
  getPriceTarget: vi.fn(),
  getInsiderTransactions: vi.fn(),
  getCompanyNews: vi.fn(),
  getCikByTicker: vi.fn(),
  getCompanyFacts: vi.fn(),
  extractFundamentalTimeSeries: vi.fn(),
}));

vi.mock("@/lib/finnhub", () => ({
  getCompanyProfile: deps.getCompanyProfile,
  getQuote: deps.getQuote,
  getBasicFinancials: deps.getBasicFinancials,
  getCandles: deps.getCandles,
  getRecommendationTrends: deps.getRecommendationTrends,
  getPriceTarget: deps.getPriceTarget,
  getInsiderTransactions: deps.getInsiderTransactions,
  getCompanyNews: deps.getCompanyNews,
}));

vi.mock("@/lib/edgar", () => ({
  getCikByTicker: deps.getCikByTicker,
  getCompanyFacts: deps.getCompanyFacts,
  extractFundamentalTimeSeries: deps.extractFundamentalTimeSeries,
}));

import {
  getStockBundle,
  getStockCandles,
  isChartRange,
  placeholderSentiment,
  rangeToCandleParams,
} from "./stockData";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-15T16:00:00.000Z"));
  vi.clearAllMocks();
  deps.getCompanyProfile.mockResolvedValue({
    name: "Apple Inc.",
    exchange: "NASDAQ",
    finnhubIndustry: "Technology",
    logo: "https://example.com/aapl.png",
    weburl: "https://apple.com",
    marketCapitalization: 3_000_000,
    currency: "USD",
  });
  deps.getQuote.mockResolvedValue({
    ticker: "AAPL",
    price: 200,
    change: 1,
    changePct: 0.5,
    volume: 0,
    high: 202,
    low: 198,
    open: 199,
    prevClose: 199,
    asOf: "2026-06-15T15:59:00.000Z",
  });
  deps.getBasicFinancials.mockResolvedValue({
    metric: {
      marketCapitalization: 3_000_000,
      peTTM: 31.2,
      "52WeekHigh": 230,
      "52WeekLow": 160,
      beta: 1.1,
      currentDividendYieldTTM: 0.55,
      epsTTM: 6.44,
    },
  });
  deps.getCandles.mockResolvedValue({
    s: "ok",
    c: [199, 200],
    o: [198, 199],
    h: [201, 202],
    l: [197, 198],
    v: [1000, 1200],
    t: [1, 2],
  });
  deps.getRecommendationTrends.mockResolvedValue([
    { period: "2026-06-01", strongBuy: 10, buy: 15, hold: 8, sell: 1, strongSell: 0 },
  ]);
  deps.getPriceTarget.mockResolvedValue({
    targetMean: 215,
    targetHigh: 250,
    targetLow: 180,
  });
  deps.getInsiderTransactions.mockResolvedValue({
    data: [
      {
        name: "Open Market Buyer",
        change: 100,
        transactionCode: "P",
        filingDate: "2026-06-01",
        transactionDate: "2026-05-30",
      },
      {
        name: "Grant Recipient",
        change: 500,
        transactionCode: "A",
        filingDate: "2026-06-02",
        transactionDate: "2026-06-01",
      },
      {
        name: "Seller",
        change: -50,
        transactionCode: "S",
        filingDate: "2026-06-03",
        transactionDate: "2026-06-02",
      },
    ],
  });
  deps.getCompanyNews.mockResolvedValue([
    {
      headline: "Apple shares rally after earnings beat",
      source: "Wire",
      url: "https://example.com/1",
      datetime: 1_812_000_000,
      summary: "Strong growth",
      image: "https://example.com/img.png",
    },
    { headline: "", url: "https://example.com/skip" },
  ]);
  deps.getCikByTicker.mockResolvedValue("0000320193");
  deps.getCompanyFacts.mockResolvedValue({ facts: {} });
  deps.extractFundamentalTimeSeries.mockReturnValue({
    revenue: [{ year: 2025, value: 100 }],
    netIncome: [{ year: 2025, value: 20 }],
    operatingIncome: [],
    rAndD: [],
    operatingCashFlow: [],
    totalDebt: [],
    cash: [],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("stockData helpers", () => {
  it("maps chart ranges to deterministic candle windows", () => {
    expect(rangeToCandleParams("1D")).toEqual({
      resolution: "5",
      from: 1781366400,
      to: 1781539200,
    });
    expect(rangeToCandleParams("5Y")).toMatchObject({ resolution: "W" });
    expect(isChartRange("3M")).toBe(true);
    expect(isChartRange("BAD")).toBe(false);
  });

  it("scores headline sentiment by whole tokens only", () => {
    expect(
      placeholderSentiment([
        {
          headline: "Shares rally after profit beat",
          summary: "growth wins",
          source: "Wire",
          url: "https://example.com",
          datetime: 1,
          image: "",
        },
        {
          headline: "Against slowdowns, highlights stay neutral",
          summary: "no token should accidentally count as a positive or negative word",
          source: "Wire",
          url: "https://example.com/2",
          datetime: 2,
          image: "",
        },
      ])
    ).toEqual({
      score: 100,
      label: "positive",
      sampleSize: 2,
      basis: "recent news headlines",
      placeholder: true,
    });
  });
});

describe("getStockBundle", () => {
  it("normalizes every upstream into the stock bundle shape", async () => {
    await expect(getStockBundle("aapl")).resolves.toMatchObject({
      ticker: "AAPL",
      profile: {
        name: "Apple Inc.",
        exchange: "NASDAQ",
        industry: "Technology",
        marketCap: 3_000_000,
        currency: "USD",
      },
      quote: { ticker: "AAPL", price: 200 },
      keyStats: {
        marketCap: 3_000_000,
        peTTM: 31.2,
        high52: 230,
        low52: 160,
        beta: 1.1,
        dividendYield: 0.55,
        epsTTM: 6.44,
      },
      candles: { s: "ok", c: [199, 200] },
      candleRange: "1M",
      analysts: {
        strongBuy: 10,
        buy: 15,
        hold: 8,
        sell: 1,
        strongSell: 0,
        period: "2026-06-01",
        targetMean: 215,
        targetHigh: 250,
        targetLow: 180,
      },
      fundamentals: { revenue: [{ year: 2025, value: 100 }] },
      insider: [
        expect.objectContaining({ name: "Open Market Buyer", direction: "buy" }),
        expect.objectContaining({ name: "Seller", direction: "sell" }),
      ],
      news: [expect.objectContaining({ headline: "Apple shares rally after earnings beat" })],
      sentiment: expect.objectContaining({ label: "positive", placeholder: true }),
    });

    expect(deps.getCompanyNews).toHaveBeenCalledWith("AAPL", "2026-05-16", "2026-06-15");
    expect(deps.getCandles).toHaveBeenCalledWith("AAPL", "D", 1778688000, 1781539200);
  });

  it("failure-isolates providers and returns null fields instead of throwing", async () => {
    deps.getCompanyProfile.mockRejectedValueOnce(new Error("profile down"));
    deps.getQuote.mockRejectedValueOnce(new Error("quote down"));
    deps.getBasicFinancials.mockResolvedValueOnce({});
    deps.getCandles.mockResolvedValueOnce({ s: "no_data", c: [], o: [], h: [], l: [], v: [], t: [] });
    deps.getRecommendationTrends.mockRejectedValueOnce(new Error("ratings down"));
    deps.getPriceTarget.mockRejectedValueOnce(new Error("target down"));
    deps.getInsiderTransactions.mockResolvedValueOnce({ data: [] });
    deps.getCompanyNews.mockResolvedValueOnce([]);
    deps.getCikByTicker.mockResolvedValueOnce(null);

    await expect(getStockBundle("spy")).resolves.toMatchObject({
      ticker: "SPY",
      profile: null,
      quote: null,
      keyStats: null,
      candles: null,
      analysts: null,
      fundamentals: null,
      insider: null,
      news: null,
      sentiment: null,
    });
  });
});

describe("getStockCandles", () => {
  it("returns ok candles for a requested range", async () => {
    await expect(getStockCandles("aapl", "1W")).resolves.toMatchObject({
      s: "ok",
      c: [199, 200],
    });

    expect(deps.getCandles).toHaveBeenCalledWith("AAPL", "30", 1780848000, 1781539200);
  });

  it("returns null when the candle source has no data", async () => {
    deps.getCandles.mockResolvedValueOnce({ s: "no_data", c: [], o: [], h: [], l: [], v: [], t: [] });

    await expect(getStockCandles("aapl", "1M")).resolves.toBeNull();
  });
});
