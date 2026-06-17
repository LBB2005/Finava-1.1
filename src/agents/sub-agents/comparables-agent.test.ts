import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const generate = vi.fn(async () => "COMPARABLES ANALYSIS");
vi.mock("@/lib/llm", () => ({ generate: (o: unknown) => generate(o) }));
vi.mock("@/agents/skills", () => ({ getSkillsPrompt: () => "skill prompt" }));

const getBasicFinancials = vi.fn();
const getQuote = vi.fn();
const getPeers = vi.fn();
vi.mock("@/lib/finnhub", () => ({
  getBasicFinancials: (...a: unknown[]) => getBasicFinancials(...a),
  getQuote: (...a: unknown[]) => getQuote(...a),
  getPeers: (...a: unknown[]) => getPeers(...a),
}));

const getFinancials = vi.fn();
vi.mock("@/lib/polygon", () => ({ getFinancials: (...a: unknown[]) => getFinancials(...a) }));

const lastPrompt = () => generate.mock.calls.at(-1)![0] as { prompt: string; agent: string };

beforeEach(() => {
  generate.mockClear().mockResolvedValue("COMPARABLES ANALYSIS");
  getBasicFinancials.mockReset().mockResolvedValue(null);
  getQuote.mockReset().mockResolvedValue({ price: null });
  getPeers.mockReset().mockResolvedValue([]);
  getFinancials.mockReset().mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

describe("runComparablesAgent", () => {
  it("resolves peers and reports 'none found' when peer lookup yields nothing", async () => {
    getPeers.mockResolvedValue([]);
    const { runComparablesAgent } = await import("./comparables-agent");
    const out = await runComparablesAgent({ ticker: "AAPL" });
    expect(out).toBe("COMPARABLES ANALYSIS");
    expect(lastPrompt().agent).toBe("comparables");
    expect(lastPrompt().prompt).toContain("AAPL");
    expect(lastPrompt().prompt).toContain("none found");
  });

  it("computes multiples from realistic data and feeds them to the model", async () => {
    getPeers.mockResolvedValue(["MSFT", "AAPL", "GOOGL"]);
    getBasicFinancials.mockResolvedValue({
      metric: {
        peTTM: 28.5,
        pbQuarterly: 12.1,
        psTTM: 7.4,
        evEbitdaTTM: 22.3,
        evRevenueTTM: 7.8,
        epsTTM: 6.4,
        bookValuePerShareAnnual: 4.2,
        pfcfShareTTM: 25,
      },
    });
    getQuote.mockResolvedValue({ price: 180 });
    getFinancials.mockResolvedValue({
      results: [
        {
          financials: {
            income_statement: {
              revenues: { value: 5_000_000_000 },
              operating_income_loss: { value: 1_200_000_000 },
              net_income_loss: { value: 900_000_000 },
              diluted_earnings_per_share: { value: 6.4 },
              depreciation_and_amortization: { value: 300_000_000 },
            },
            balance_sheet: {
              equity: { value: 2_000_000_000 },
              liabilities: { value: 1_000_000_000 },
              current_liabilities: { value: 400_000_000 },
              cash_and_equivalents_at_carrying_value: { value: 500_000_000 },
            },
            cash_flow_statement: {
              net_cash_flow_from_operating_activities: { value: 1_100_000_000 },
              capital_expenditure: { value: 200_000_000 },
            },
          },
        },
      ],
    });
    const { runComparablesAgent } = await import("./comparables-agent");
    const out = await runComparablesAgent({ ticker: "AAPL" });
    expect(out).toBe("COMPARABLES ANALYSIS");
    const p = lastPrompt().prompt;
    expect(p).toContain("AAPL");
    expect(p).toContain("MSFT");
    // fcfYieldPct = 100 / pfcfShareTTM = 4 → present in the serialized data
    expect(p).toContain("peRatio");
    expect(p).toContain("28.5");
  });

  it("uses supplied peers and survives data-source failures", async () => {
    getBasicFinancials.mockRejectedValue(new Error("rate limited"));
    getFinancials.mockRejectedValue(new Error("polygon down"));
    getQuote.mockRejectedValue(new Error("quote down"));
    const { runComparablesAgent } = await import("./comparables-agent");
    const out = await runComparablesAgent({ ticker: "AAPL", peers: ["MSFT"] });
    expect(out).toBe("COMPARABLES ANALYSIS");
    expect(getPeers).not.toHaveBeenCalled(); // peers supplied → no lookup
    const p = lastPrompt().prompt;
    expect(p).toContain("MSFT");
    // failed fetches → null metrics/financials, still synthesizes
    expect(p).toContain('"currentPrice": null');
  });

  it("returns a safe fallback string when the model yields nothing", async () => {
    generate.mockResolvedValue("");
    const { runComparablesAgent } = await import("./comparables-agent");
    expect(await runComparablesAgent({ ticker: "AAPL" })).toBe("Comparables data unavailable.");
  });
});
