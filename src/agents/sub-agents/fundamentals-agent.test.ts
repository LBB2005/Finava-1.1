import { describe, it, expect, vi, beforeEach } from "vitest";

const generate = vi.fn(async (_o?: unknown) => "TREND ANALYSIS");
vi.mock("@/lib/llm", () => ({ generate: (o: unknown) => generate(o) }));
vi.mock("@/agents/skills", () => ({ getSkillsPrompt: () => "skill prompt" }));

const getCikByTicker = vi.fn();
const getCompanyFacts = vi.fn();
const extractFundamentalTimeSeries = vi.fn();
vi.mock("@/lib/edgar", () => ({
  getCikByTicker: (...a: unknown[]) => getCikByTicker(...a),
  getCompanyFacts: (...a: unknown[]) => getCompanyFacts(...a),
  extractFundamentalTimeSeries: (...a: unknown[]) => extractFundamentalTimeSeries(...a),
}));

const getFinancialsReported = vi.fn();
const getBasicFinancials = vi.fn();
vi.mock("@/lib/finnhub", () => ({
  getFinancialsReported: (...a: unknown[]) => getFinancialsReported(...a),
  getBasicFinancials: (...a: unknown[]) => getBasicFinancials(...a),
}));

const emptySeries = () => ({
  revenue: [], netIncome: [], operatingIncome: [], rAndD: [],
  operatingCashFlow: [], totalDebt: [], cash: [],
});

beforeEach(() => {
  generate.mockClear().mockResolvedValue("TREND ANALYSIS");
  getCikByTicker.mockReset().mockResolvedValue(null);
  getCompanyFacts.mockReset().mockResolvedValue({});
  extractFundamentalTimeSeries.mockReset();
  getFinancialsReported.mockReset().mockResolvedValue({ data: [] });
  getBasicFinancials.mockReset().mockResolvedValue({ metric: {} });
});

describe("runFundamentalsAgent", () => {
  it("builds an EDGAR multi-year series, charts, and a model analysis", async () => {
    getCikByTicker.mockResolvedValue("0000320193");
    extractFundamentalTimeSeries.mockReturnValue({
      ...emptySeries(),
      revenue: [
        { year: 2022, value: 80_000_000_000 },
        { year: 2023, value: 95_000_000_000 },
        { year: 2024, value: 110_000_000_000 },
      ],
      netIncome: [
        { year: 2022, value: 20_000_000_000 },
        { year: 2023, value: 25_000_000_000 },
      ],
    });
    const { runFundamentalsAgent } = await import("./fundamentals-agent");
    const out = await runFundamentalsAgent({ ticker: "AAPL" });

    // Chart blocks are prepended, then the model's prose.
    expect(out).toContain("```chart");
    expect(out).toContain("TREND ANALYSIS");
    const prompt = (generate.mock.calls.at(-1)![0] as { prompt: string }).prompt;
    expect(prompt).toContain("AAPL");
    expect(prompt).toContain("Revenue (3 years from EDGAR)");
  });

  it("returns an explicit no-data message when every source is empty", async () => {
    getCikByTicker.mockResolvedValue(null); // no EDGAR
    getFinancialsReported.mockResolvedValue({ data: [] });
    getBasicFinancials.mockResolvedValue({ metric: {} });
    const { runFundamentalsAgent } = await import("./fundamentals-agent");
    const out = await runFundamentalsAgent({ ticker: "ZZZZ" });
    expect(out).toContain("Unable to retrieve multi-year fundamental data for ZZZZ");
    expect(generate).not.toHaveBeenCalled();
  });

  it("falls back to Finnhub revenue when EDGAR has none", async () => {
    getCikByTicker.mockResolvedValue(null);
    getFinancialsReported.mockResolvedValue({
      data: [
        { period: "annual", year: 2024, report: { ic: [{ concept: "RevenueFromContract", value: 5_000_000_000 }] } },
      ],
    });
    const { runFundamentalsAgent } = await import("./fundamentals-agent");
    await runFundamentalsAgent({ ticker: "BBB" });
    const prompt = (generate.mock.calls.at(-1)![0] as { prompt: string }).prompt;
    expect(prompt).toContain("Revenue (Finnhub fallback)");
  });
});
