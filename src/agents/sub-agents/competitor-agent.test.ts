import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const generate = vi.fn(async (_o?: unknown) => "COMPETITOR ANALYSIS");
vi.mock("@/lib/llm", () => ({ generate: (o: unknown) => generate(o) }));
vi.mock("@/agents/skills", () => ({ getSkillsPrompt: () => "skill prompt" }));

const getBasicFinancials = vi.fn();
const getSnapshots = vi.fn();
const getPeers = vi.fn();
vi.mock("@/lib/finnhub", () => ({
  getBasicFinancials: (...a: unknown[]) => getBasicFinancials(...a),
  getSnapshots: (...a: unknown[]) => getSnapshots(...a),
  getPeers: (...a: unknown[]) => getPeers(...a),
}));

const lastPrompt = () => generate.mock.calls.at(-1)![0] as { prompt: string; agent: string };

beforeEach(() => {
  generate.mockClear().mockResolvedValue("COMPETITOR ANALYSIS");
  getBasicFinancials.mockReset().mockResolvedValue({ metric: {} });
  getSnapshots.mockReset().mockResolvedValue([]);
  getPeers.mockReset().mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());

describe("runCompetitorAgent", () => {
  it("skips data fetching when no Finnhub key is set", async () => {
    vi.stubEnv("FINNHUB_API_KEY", "");
    const { runCompetitorAgent } = await import("./competitor-agent");
    const out = await runCompetitorAgent({ ticker: "AAPL", peers: ["MSFT"] });
    expect(out).toBe("COMPETITOR ANALYSIS");
    expect(lastPrompt().agent).toBe("competitor");
    expect(lastPrompt().prompt).toContain("AAPL");
    expect(lastPrompt().prompt).toContain("MSFT");
    expect(getBasicFinancials).not.toHaveBeenCalled();
    expect(getSnapshots).not.toHaveBeenCalled();
  });

  it("builds a comparison block from realistic financials and snapshots", async () => {
    vi.stubEnv("FINNHUB_API_KEY", "key");
    getSnapshots.mockResolvedValue([
      { ticker: "AAPL", price: 180, changePct: 1.23 },
      { ticker: "MSFT", price: 400, changePct: -0.5 },
    ]);
    getBasicFinancials.mockResolvedValue({
      metric: {
        peBasicExclExtraTTM: 28.5,
        pbAnnual: 12.1,
        evEbitdaAnnual: 22.3,
        grossMarginTTM: 44.2,
        netProfitMarginTTM: 25.3,
        revenueGrowth5Y: 11.4,
        roeTTM: 150.1,
        "totalDebt/totalEquityAnnual": 1.5,
      },
    });
    const { runCompetitorAgent } = await import("./competitor-agent");
    const out = await runCompetitorAgent({ ticker: "AAPL", peers: ["MSFT"] });
    expect(out).toBe("COMPETITOR ANALYSIS");
    const p = lastPrompt().prompt;
    expect(p).toContain("AAPL");
    expect(p).toContain("28.5");
    expect(p).toContain("44.2%"); // grossMargin formatted
    expect(p).toContain("1.23%"); // change1D formatted
  });

  it("marks a ticker 'Data unavailable' when its financials fetch throws", async () => {
    vi.stubEnv("FINNHUB_API_KEY", "key");
    getSnapshots.mockResolvedValue([{ ticker: "AAPL", price: 180, changePct: 1 }]);
    getBasicFinancials.mockRejectedValue(new Error("rate limited"));
    const { runCompetitorAgent } = await import("./competitor-agent");
    const out = await runCompetitorAgent({ ticker: "AAPL", peers: [] });
    expect(out).toBe("COMPETITOR ANALYSIS");
    expect(lastPrompt().prompt).toContain("Data unavailable");
  });

  it("returns a safe fallback string when the model yields nothing", async () => {
    vi.stubEnv("FINNHUB_API_KEY", "");
    generate.mockResolvedValue("");
    const { runCompetitorAgent } = await import("./competitor-agent");
    expect(await runCompetitorAgent({ ticker: "AAPL", peers: ["MSFT"] })).toBe(
      "Competitor analysis unavailable."
    );
  });
});
