import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  getCikByTicker: vi.fn(),
  getCompanyFacts: vi.fn(),
  extractFinancialMetrics: vi.fn(),
  extractFundamentalTimeSeries: vi.fn(),
  getQuote: vi.fn(),
  getCompanyProfile: vi.fn(),
  getBasicFinancials: vi.fn(),
  suggestedWaccFromBeta: vi.fn(),
}));

vi.mock("@/lib/edgar", () => ({
  getCikByTicker: deps.getCikByTicker,
  getCompanyFacts: deps.getCompanyFacts,
  extractFinancialMetrics: deps.extractFinancialMetrics,
  extractFundamentalTimeSeries: deps.extractFundamentalTimeSeries,
}));

vi.mock("@/lib/finnhub", () => ({
  getQuote: deps.getQuote,
  getCompanyProfile: deps.getCompanyProfile,
  getBasicFinancials: deps.getBasicFinancials,
}));

vi.mock("@/lib/dcf", () => ({
  suggestedWaccFromBeta: deps.suggestedWaccFromBeta,
}));

import { GET } from "./route";

function requestFor(ticker: string) {
  return new Request(`http://test.local/api/stock/${ticker}/dcf`);
}

function ctx(ticker: string) {
  return { params: Promise.resolve({ ticker }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  deps.getCikByTicker.mockResolvedValue("0000320193");
  deps.getCompanyFacts.mockResolvedValue({ facts: "fixture" });
  deps.extractFinancialMetrics.mockReturnValue({
    operatingCashFlow: 120_000_000_000,
    capex: 10_000_000_000,
    totalDebt: 110_000_000_000,
    cash: 30_000_000_000,
    sharesOutstanding: 15_000_000_000,
  });
  deps.extractFundamentalTimeSeries.mockReturnValue({
    revenue: [
      { year: 2021, value: 100 },
      { year: 2022, value: 121 },
    ],
  });
  deps.getQuote.mockResolvedValue({ price: 200 });
  deps.getCompanyProfile.mockResolvedValue({ currency: "USD" });
  deps.getBasicFinancials.mockResolvedValue({
    metric: { marketCapitalization: 3_000_000, beta: 1.2 },
  });
  deps.suggestedWaccFromBeta.mockReturnValue(0.095);
});

describe("GET /api/stock/[ticker]/dcf", () => {
  it("returns 400 for a blank ticker", async () => {
    const res = await GET(requestFor("%20"), ctx("   "));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Missing ticker." });
    expect(deps.getCikByTicker).not.toHaveBeenCalled();
  });

  it("returns 404 when the ticker has no SEC CIK", async () => {
    deps.getCikByTicker.mockResolvedValueOnce(null);

    const res = await GET(requestFor("spy"), ctx("spy"));

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "DCF is unavailable for SPY (no SEC filings).",
    });
  });

  it("normalizes DCF inputs from EDGAR and market data", async () => {
    const res = await GET(requestFor("aapl"), ctx("aapl"));

    expect(res.status).toBe(200);
    expect(deps.getCikByTicker).toHaveBeenCalledWith("AAPL");
    expect(deps.getCompanyFacts).toHaveBeenCalledWith("0000320193");
    await expect(res.json()).resolves.toEqual({
      ticker: "AAPL",
      inputs: {
        baseFcf: 110_000_000_000,
        fcfIsProxy: false,
        sharesOutstanding: 15_000_000_000,
        netDebt: 80_000_000_000,
        historicalGrowth: expect.closeTo(0.21, 8),
        suggestedWacc: 0.095,
        currentPrice: 200,
        currency: "USD",
      },
    });
  });

  it("uses operating cash flow as a flagged FCF proxy and derives shares from market cap", async () => {
    deps.extractFinancialMetrics.mockReturnValueOnce({
      operatingCashFlow: 50_000_000_000,
      capex: null,
      totalDebt: null,
      cash: null,
      sharesOutstanding: null,
    });
    deps.extractFundamentalTimeSeries.mockReturnValueOnce({ revenue: [] });
    deps.getQuote.mockResolvedValueOnce({ price: 100 });
    deps.getBasicFinancials.mockResolvedValueOnce({
      metric: { marketCapitalization: 250_000, beta: null },
    });

    const res = await GET(requestFor("msft"), ctx("msft"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ticker: "MSFT",
      inputs: {
        baseFcf: 50_000_000_000,
        fcfIsProxy: true,
        sharesOutstanding: 2_500_000_000,
        netDebt: 0,
        historicalGrowth: null,
      },
    });
  });

  it("returns 404 when cash-flow data is absent", async () => {
    deps.extractFinancialMetrics.mockReturnValueOnce({
      operatingCashFlow: null,
      capex: null,
      totalDebt: 1,
      cash: 1,
      sharesOutstanding: 1,
    });

    const res = await GET(requestFor("cashless"), ctx("cashless"));

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "DCF is unavailable for CASHLESS (no cash-flow data).",
    });
  });

  it("returns 500 when the data pipeline throws", async () => {
    deps.getCompanyFacts.mockRejectedValueOnce(new Error("SEC unavailable"));

    const res = await GET(requestFor("aapl"), ctx("aapl"));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Failed to build DCF inputs.",
    });
  });
});
