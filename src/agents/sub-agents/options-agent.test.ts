import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const generate = vi.fn(async (_o?: unknown) => "OPTIONS ANALYSIS");
vi.mock("@/lib/llm", () => ({ generate: (o: unknown) => generate(o) }));
vi.mock("@/agents/skills", () => ({ getSkillsPrompt: () => "skill prompt" }));

const getOptionsSnapshot = vi.fn();
vi.mock("@/lib/polygon", () => ({
  getOptionsSnapshot: (...a: unknown[]) => getOptionsSnapshot(...a),
}));

const lastPrompt = () => generate.mock.calls.at(-1)![0] as { prompt: string; agent: string };

beforeEach(() => {
  generate.mockClear().mockResolvedValue("OPTIONS ANALYSIS");
  getOptionsSnapshot.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("runOptionsAgent", () => {
  it("marks every ticker as 'No API key' when Polygon key is unset", async () => {
    vi.stubEnv("POLYGON_API_KEY", "");
    const { runOptionsAgent } = await import("./options-agent");
    const out = await runOptionsAgent({ tickers: ["AAPL", "MSFT"] });
    expect(out).toBe("OPTIONS ANALYSIS");
    expect(lastPrompt().agent).toBe("options");
    const p = lastPrompt().prompt;
    expect(p).toContain("AAPL, MSFT");
    expect(p).toContain("No API key");
    expect(getOptionsSnapshot).not.toHaveBeenCalled();
  });

  it("computes put/call ratios and unusual activity from the snapshot", async () => {
    vi.stubEnv("POLYGON_API_KEY", "key");
    getOptionsSnapshot.mockResolvedValue({
      results: [
        {
          details: { contract_type: "call", strike_price: 150, expiration_date: "2026-07-17" },
          open_interest: 1000,
          day: { volume: 500 },
          implied_volatility: 0.35,
        },
        {
          details: { contract_type: "put", strike_price: 140, expiration_date: "2026-07-17" },
          open_interest: 2000,
          day: { volume: 300 },
        },
      ],
    });
    const { runOptionsAgent } = await import("./options-agent");
    await runOptionsAgent({ tickers: ["AAPL"] });
    const p = lastPrompt().prompt;
    // putCallRatio = 2000/1000 = 2.00
    expect(p).toContain('"putCallRatio": "2.00"');
    expect(p).toContain('"totalCallOI": 1000');
    expect(p).toContain('"totalPutOI": 2000');
    expect(p).toContain('"iv": "35.0%"');
  });

  it("records an unavailable error when the snapshot fetch throws", async () => {
    vi.stubEnv("POLYGON_API_KEY", "key");
    getOptionsSnapshot.mockRejectedValue(new Error("paid tier"));
    const { runOptionsAgent } = await import("./options-agent");
    await runOptionsAgent({ tickers: ["AAPL"] });
    expect(lastPrompt().prompt).toContain("Options data unavailable");
    expect(generate).toHaveBeenCalled();
  });

  it("emits N/A put/call ratio when there is no call open interest", async () => {
    vi.stubEnv("POLYGON_API_KEY", "key");
    getOptionsSnapshot.mockResolvedValue({
      results: [
        {
          details: { contract_type: "put", strike_price: 140, expiration_date: "2026-07-17" },
          open_interest: 500,
          day: { volume: 100 },
        },
      ],
    });
    const { runOptionsAgent } = await import("./options-agent");
    await runOptionsAgent({ tickers: ["AAPL"] });
    expect(lastPrompt().prompt).toContain('"putCallRatio": "N/A"');
  });
});
