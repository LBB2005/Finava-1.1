import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const generate = vi.fn(async () => "GRAHAM ANALYSIS");
vi.mock("@/lib/llm", () => ({ generate: (o: unknown) => generate(o) }));
vi.mock("@/agents/skills", () => ({ getSkillsPrompt: () => "skill prompt" }));

const getBasicFinancials = vi.fn();
const getQuote = vi.fn();
vi.mock("@/lib/finnhub", () => ({
  getBasicFinancials: (...a: unknown[]) => getBasicFinancials(...a),
  getQuote: (...a: unknown[]) => getQuote(...a),
}));

const getFinancials = vi.fn();
vi.mock("@/lib/polygon", () => ({ getFinancials: (...a: unknown[]) => getFinancials(...a) }));

const lastPrompt = () => generate.mock.calls.at(-1)![0] as { prompt: string; agent: string };

beforeEach(() => {
  generate.mockClear().mockResolvedValue("GRAHAM ANALYSIS");
  getBasicFinancials.mockReset().mockResolvedValue(null);
  getQuote.mockReset().mockResolvedValue({ price: null });
  getFinancials.mockReset().mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

describe("runGrahamAgent", () => {
  it("emits null fields when all data sources are empty", async () => {
    const { runGrahamAgent } = await import("./graham-agent");
    const out = await runGrahamAgent({ ticker: "AAPL" });
    expect(out).toBe("GRAHAM ANALYSIS");
    expect(lastPrompt().agent).toBe("graham");
    const p = lastPrompt().prompt;
    expect(p).toContain("AAPL");
    expect(p).toContain('"currentPrice": null');
    expect(p).toContain('"peRatio": null');
  });

  it("feeds pre-computed Finnhub metrics and Polygon financials to the model", async () => {
    getBasicFinancials.mockResolvedValue({
      metric: {
        peBasicExclExtraTTM: 12.3,
        pbQuarterly: 1.4,
        epsAnnual: 6.4,
        bookValuePerShareAnnual: 40,
        totalDebt_totalEquityAnnual: 0.4,
        currentRatioAnnual: 2.5,
      },
    });
    getQuote.mockResolvedValue({ price: 150 });
    getFinancials.mockResolvedValue({
      results: [
        {
          financials: {
            income_statement: { diluted_earnings_per_share: { value: 6.4 } },
            balance_sheet: {
              equity: { value: 2_000_000_000 },
              liabilities: { value: 1_000_000_000 },
              current_assets: { value: 900_000_000 },
              current_liabilities: { value: 360_000_000 },
              long_term_debt: { value: 500_000_000 },
            },
          },
        },
      ],
    });
    const { runGrahamAgent } = await import("./graham-agent");
    const out = await runGrahamAgent({ ticker: "AAPL" });
    expect(out).toBe("GRAHAM ANALYSIS");
    const p = lastPrompt().prompt;
    expect(p).toContain("AAPL");
    expect(p).toContain("12.3"); // peRatio
    expect(p).toContain('"currentPrice": 150');
    expect(p).toContain("Graham Number"); // criteria still described
  });

  it("survives data-source failures via settled fallbacks", async () => {
    getBasicFinancials.mockRejectedValue(new Error("rate limited"));
    getFinancials.mockRejectedValue(new Error("polygon down"));
    getQuote.mockRejectedValue(new Error("quote down"));
    const { runGrahamAgent } = await import("./graham-agent");
    const out = await runGrahamAgent({ ticker: "AAPL" });
    expect(out).toBe("GRAHAM ANALYSIS");
    expect(lastPrompt().prompt).toContain('"currentPrice": null');
  });

  it("returns a safe fallback string when the model yields nothing", async () => {
    generate.mockResolvedValue("");
    const { runGrahamAgent } = await import("./graham-agent");
    expect(await runGrahamAgent({ ticker: "AAPL" })).toBe("Graham screen data unavailable.");
  });
});
