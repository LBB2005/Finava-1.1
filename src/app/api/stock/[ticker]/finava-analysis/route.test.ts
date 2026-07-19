import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const deps = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  userRateLimit: vi.fn(),
  checkUsageLimit: vi.fn(),
  usageEnterWith: vi.fn(),
  generate: vi.fn(),
  getStockBundle: vi.fn(),
  getCikByTicker: vi.fn(),
  getCompanyFacts: vi.fn(),
  extractFinancialMetrics: vi.fn(),
  extractFundamentalTimeSeries: vi.fn(),
  getBasicFinancials: vi.fn(),
  suggestedWaccFromBeta: vi.fn(),
  defaultFairValue: vi.fn(),
}));

vi.mock("@/lib/requireAuth", () => ({ requireAuth: deps.requireAuth }));
vi.mock("@/lib/rateLimit", () => ({ userRateLimit: deps.userRateLimit }));
vi.mock("@/lib/usage", () => ({
  checkUsageLimit: deps.checkUsageLimit,
  makeRunContext: (u: string) => ({ userId: u }),
  usageStore: { enterWith: deps.usageEnterWith },
}));
vi.mock("@/lib/llm", () => ({
  AGENT_MODELS: {
    fundamentals: "fund-model",
    technical: "tech-model",
    sentiment: "sent-model",
    analyst: "analyst-model",
    insider: "insider-model",
    finavaSynthesis: "synth-model",
  },
  generate: deps.generate,
}));
vi.mock("@/lib/stockData", () => ({ getStockBundle: deps.getStockBundle }));
vi.mock("@/lib/edgar", () => ({
  getCikByTicker: deps.getCikByTicker,
  getCompanyFacts: deps.getCompanyFacts,
  extractFinancialMetrics: deps.extractFinancialMetrics,
  extractFundamentalTimeSeries: deps.extractFundamentalTimeSeries,
}));
vi.mock("@/lib/finnhub", () => ({ getBasicFinancials: deps.getBasicFinancials }));
vi.mock("@/lib/dcf", () => ({
  suggestedWaccFromBeta: deps.suggestedWaccFromBeta,
  defaultFairValue: deps.defaultFairValue,
}));

import { POST } from "./route";

function ctx(ticker: string) {
  return { params: Promise.resolve({ ticker }) };
}

async function sse(res: Response) {
  return res.text();
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENROUTER_API_KEY = "or_key";
  deps.requireAuth.mockResolvedValue({ userId: "user_123" });
  deps.userRateLimit.mockReturnValue(null);
  deps.checkUsageLimit.mockResolvedValue(null);
  deps.getStockBundle.mockResolvedValue({
    ticker: "AAPL",
    profile: { name: "Apple Inc.", currency: "USD" },
    quote: { price: 200, changePct: 1.25 },
    keyStats: { high52: 240, low52: 160, beta: 1.2, peTTM: 30 },
    analysts: {
      strongBuy: 10,
      buy: 15,
      hold: 5,
      sell: 1,
      strongSell: 0,
      period: "2026-06-01",
      targetMean: 225,
      targetLow: 180,
      targetHigh: 260,
    },
    fundamentals: {
      revenue: [{ year: 2023, value: 380_000_000_000 }, { year: 2024, value: 400_000_000_000 }],
      netIncome: [{ year: 2024, value: 95_000_000_000 }],
      operatingCashFlow: [{ year: 2024, value: 110_000_000_000 }],
      totalDebt: [{ year: 2024, value: 80_000_000_000 }],
    },
    news: [{ headline: "Apple beats expectations" }],
    insider: [{ direction: "buy", shares: 1000, transactionDate: "2026-06-01", filingDate: "2026-06-02" }],
  });
  deps.getCikByTicker.mockResolvedValue("0000320193");
  deps.getCompanyFacts.mockResolvedValue({ facts: {} });
  deps.extractFinancialMetrics.mockReturnValue({
    operatingCashFlow: 120_000_000_000,
    capex: 10_000_000_000,
    sharesOutstanding: 15_000_000_000,
    totalDebt: 100_000_000_000,
    cash: 30_000_000_000,
  });
  deps.extractFundamentalTimeSeries.mockReturnValue({
    revenue: [{ year: 2022, value: 300 }, { year: 2024, value: 363 }],
  });
  deps.getBasicFinancials.mockResolvedValue({ metric: { beta: 1.2 } });
  deps.suggestedWaccFromBeta.mockReturnValue(0.095);
  deps.defaultFairValue.mockReturnValue(215);
  deps.generate.mockImplementation(async ({ agent }) => {
    if (agent === "finavaSynthesis") {
      return JSON.stringify({
        score: 82.2,
        fairValue: 230,
        confidence: "High",
        take: "AAPL has strong fundamentals with moderate valuation risk.",
        catalysts: ["Services growth", "Buybacks"],
        risks: ["Multiple compression", ""],
      });
    }
    return JSON.stringify({
      score: 77,
      headline: `${agent} constructive`,
      detail: "The signal is supported by the provided numbers.",
    });
  });
});

describe("POST /api/stock/[ticker]/finava-analysis", () => {
  it("short-circuits auth, rate-limit, usage, ticker, config, and missing stock checks", async () => {
    deps.requireAuth.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await POST(new Request("http://test.local"), ctx("AAPL"))).status).toBe(401);

    deps.requireAuth.mockResolvedValueOnce({ userId: "user_123" });
    deps.userRateLimit.mockReturnValueOnce(NextResponse.json({ error: "slow" }, { status: 429 }));
    expect((await POST(new Request("http://test.local"), ctx("AAPL"))).status).toBe(429);

    deps.userRateLimit.mockReturnValueOnce(null);
    deps.checkUsageLimit.mockResolvedValueOnce(NextResponse.json({ error: "quota" }, { status: 429 }));
    expect((await POST(new Request("http://test.local"), ctx("AAPL"))).status).toBe(429);

    expect((await POST(new Request("http://test.local"), ctx("   "))).status).toBe(400);

    delete process.env.OPENROUTER_API_KEY;
    expect((await POST(new Request("http://test.local"), ctx("AAPL"))).status).toBe(503);

    process.env.OPENROUTER_API_KEY = "or_key";
    deps.getStockBundle.mockResolvedValueOnce({ quote: null, profile: null });
    expect((await POST(new Request("http://test.local"), ctx("NOPE"))).status).toBe(404);
  });

  it("streams five signal cards and a synthesized verdict with DCF comparison", async () => {
    const res = await POST(new Request("http://test.local"), ctx("aapl"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    expect(deps.usageEnterWith).toHaveBeenCalledWith({ userId: "user_123" });
    expect(deps.defaultFairValue).toHaveBeenCalledWith(expect.objectContaining({
      baseFcf: 110_000_000_000,
      sharesOutstanding: 15_000_000_000,
      netDebt: 70_000_000_000,
      suggestedWacc: 0.095,
      currentPrice: 200,
    }));

    const body = await sse(res);
    expect(body.match(/"type":"signal"/g)).toHaveLength(5);
    expect(body).toContain('"key":"fundamentals"');
    expect(body).toContain('"key":"momentum"');
    expect(body).toContain('"key":"sentiment"');
    expect(body).toContain('"key":"analyst"');
    expect(body).toContain('"key":"insider"');
    expect(body).toContain('"type":"verdict"');
    expect(body).toContain('"score":82');
    expect(body).toContain('"fairValue":230');
    expect(body).toContain('"upsidePct":15');
    expect(body).toContain('"comparison":{"finava":230,"street":225,"dcf":215}');
  });

  it("degrades failed signal agents to neutral and emits an error on synthesis failure", async () => {
    deps.getCikByTicker.mockRejectedValueOnce(new Error("SEC down"));
    deps.generate.mockImplementation(async ({ agent }) => {
      if (agent === "technical") throw new Error("technical down");
      if (agent === "finavaSynthesis") return "not json";
      return JSON.stringify({ score: 120, headline: "", detail: "" });
    });

    const res = await POST(new Request("http://test.local"), ctx("AAPL"));
    const body = await sse(res);

    expect(body.match(/"type":"signal"/g)).toHaveLength(5);
    expect(body).toContain('"headline":"Signal unavailable"');
    expect(body).toContain('"score":100');
    expect(body).toContain('"type":"error","message":"Failed to synthesise the verdict."');
  });
});
