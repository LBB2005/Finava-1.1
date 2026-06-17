import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const generate = vi.fn(async () => "EARNINGS ANALYSIS");
vi.mock("@/lib/llm", () => ({ generate: (o: unknown) => generate(o) }));
vi.mock("@/agents/skills", () => ({ getSkillsPrompt: () => "skill prompt" }));

const getEarnings = vi.fn();
const getEarningsCalendar = vi.fn();
const getRecommendationTrends = vi.fn();
vi.mock("@/lib/finnhub", () => ({
  getEarnings: (...a: unknown[]) => getEarnings(...a),
  getEarningsCalendar: (...a: unknown[]) => getEarningsCalendar(...a),
  getRecommendationTrends: (...a: unknown[]) => getRecommendationTrends(...a),
}));

const lastPrompt = () => generate.mock.calls.at(-1)![0] as { prompt: string; agent: string };

beforeEach(() => {
  generate.mockClear().mockResolvedValue("EARNINGS ANALYSIS");
  getEarnings.mockReset().mockResolvedValue([]);
  getEarningsCalendar.mockReset().mockResolvedValue({ earningsCalendar: [] });
  getRecommendationTrends.mockReset().mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());

describe("runEarningsAgent", () => {
  it("handles empty data with 'Not scheduled' / 'No data' fallbacks", async () => {
    const { runEarningsAgent } = await import("./earnings-agent");
    const out = await runEarningsAgent({ tickers: ["AAPL"] });
    expect(out).toBe("EARNINGS ANALYSIS");
    expect(lastPrompt().agent).toBe("earnings");
    const p = lastPrompt().prompt;
    expect(p).toContain("AAPL");
    expect(p).toContain("Not scheduled in next 90 days");
    expect(p).toContain("No data");
  });

  it("folds EPS history, next earnings, and analyst ratings into the prompt", async () => {
    getEarnings.mockResolvedValue([
      { period: "2026-03-31", actual: 1.6, estimate: 1.5, surprisePercent: 6.67 },
      { period: "2025-12-31", actual: 2.1, estimate: 2.0, surprisePercent: 5.0 },
    ]);
    getEarningsCalendar.mockResolvedValue({
      earningsCalendar: [{ symbol: "AAPL", date: "2026-07-25", epsEstimate: 1.7 }],
    });
    getRecommendationTrends.mockResolvedValue([
      { strongBuy: 10, buy: 12, hold: 5, sell: 1, strongSell: 0 },
    ]);
    const { runEarningsAgent } = await import("./earnings-agent");
    const out = await runEarningsAgent({ tickers: ["AAPL"] });
    expect(out).toBe("EARNINGS ANALYSIS");
    const p = lastPrompt().prompt;
    expect(p).toContain("AAPL");
    expect(p).toContain("2026-07-25"); // next earnings date
    expect(p).toContain("6.7%"); // surprise formatted
    expect(p).toContain("strongBuy");
  });

  it("marks a ticker with an error when its data fetch throws", async () => {
    getEarnings.mockRejectedValue(new Error("rate limited"));
    const { runEarningsAgent } = await import("./earnings-agent");
    const out = await runEarningsAgent({ tickers: ["AAPL"] });
    expect(out).toBe("EARNINGS ANALYSIS");
    expect(lastPrompt().prompt).toContain("Could not fetch earnings data");
  });

  it("returns the model output (possibly empty) without a hardcoded fallback", async () => {
    generate.mockResolvedValue("");
    const { runEarningsAgent } = await import("./earnings-agent");
    // earnings-agent returns the model result directly (no || fallback)
    expect(await runEarningsAgent({ tickers: ["AAPL"] })).toBe("");
    expect(generate).toHaveBeenCalled();
  });
});
