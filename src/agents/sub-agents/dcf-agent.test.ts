import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const generate = vi.fn(async (_o?: unknown) => "DCF ANALYSIS");
vi.mock("@/lib/llm", () => ({ generate: (o: unknown) => generate(o) }));
vi.mock("@/agents/skills", () => ({ getSkillsPrompt: () => "skill prompt" }));

const getBasicFinancials = vi.fn();
const getFinancialsReported = vi.fn();
const getSnapshots = vi.fn();
vi.mock("@/lib/finnhub", () => ({
  getBasicFinancials: (...a: unknown[]) => getBasicFinancials(...a),
  getFinancialsReported: (...a: unknown[]) => getFinancialsReported(...a),
  getSnapshots: (...a: unknown[]) => getSnapshots(...a),
}));

const lastPrompt = () => generate.mock.calls.at(-1)![0] as { prompt: string; agent: string };

beforeEach(() => {
  generate.mockClear().mockResolvedValue("DCF ANALYSIS");
  getBasicFinancials.mockReset();
  getFinancialsReported.mockReset();
  getSnapshots.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("runDcfAgent", () => {
  it("falls back to 'data unavailable' when no Finnhub key is set", async () => {
    vi.stubEnv("FINNHUB_API_KEY", "");
    const { runDcfAgent } = await import("./dcf-agent");
    const out = await runDcfAgent({ ticker: "AAPL" });
    expect(out).toBe("DCF ANALYSIS");
    expect(lastPrompt().agent).toBe("dcf");
    expect(lastPrompt().prompt).toContain("Financial data unavailable");
    expect(lastPrompt().prompt).toContain("AAPL");
  });

  it("computes a per-share DCF from financials and feeds it to the model", async () => {
    vi.stubEnv("FINNHUB_API_KEY", "key");
    getBasicFinancials.mockResolvedValue({ metric: { shareOutstanding: 100, grossMarginTTM: 40 } });
    getSnapshots.mockResolvedValue([{ price: 150 }]);
    getFinancialsReported.mockResolvedValue({
      data: [
        {
          report: {
            cf: [
              { concept: "NetCashProvidedByUsedInOperatingActivities", value: 1_000_000_000 },
              { concept: "PaymentsToAcquirePropertyPlantAndEquipment", value: 200_000_000 },
            ],
            ic: [
              { concept: "Revenues", value: 5_000_000_000 },
              { concept: "NetIncomeLoss", value: 800_000_000 },
            ],
          },
        },
      ],
    });
    const { runDcfAgent } = await import("./dcf-agent");
    const out = await runDcfAgent({ ticker: "AAPL" });
    expect(out).toBe("DCF ANALYSIS");
    const p = lastPrompt().prompt;
    expect(p).toContain("AAPL");
    expect(p).toContain("dcfEstimatePerShare");
    // FCF = 1.0B − 0.2B = 0.8B > 0 and shares > 0 → a real $ estimate, not "cannot model".
    expect(p).toMatch(/dcfEstimatePerShare["\s:]+"\$/);
  });

  it("reports a fetch failure (transport, not no-data) when Finnhub throws", async () => {
    vi.stubEnv("FINNHUB_API_KEY", "key");
    getBasicFinancials.mockRejectedValue(new Error("rate limited"));
    getFinancialsReported.mockResolvedValue({ data: [] });
    getSnapshots.mockResolvedValue([{ price: 1 }]);
    const { runDcfAgent } = await import("./dcf-agent");
    await runDcfAgent({ ticker: "AAPL" });
    const p = lastPrompt().prompt;
    expect(p).toContain("Could not fetch financials for AAPL");
    expect(p).toContain("temporarily unavailable"); // framed as a reachability problem
  });

  it("says 'no financials on file' when Finnhub responds with an empty report set", async () => {
    // Distinct from the transport failure above: the source answered, it just has
    // nothing on record — so we must not present it as a fetch problem, nor emit a
    // wall of N/A that looks like a real (empty) valuation.
    vi.stubEnv("FINNHUB_API_KEY", "key");
    getBasicFinancials.mockResolvedValue({ metric: {} });
    getFinancialsReported.mockResolvedValue({ data: [] });
    getSnapshots.mockResolvedValue([{ price: 100 }]);
    const { runDcfAgent } = await import("./dcf-agent");
    await runDcfAgent({ ticker: "AAPL" });
    const p = lastPrompt().prompt;
    expect(p).toContain("No financial statements on file for AAPL");
    expect(p).not.toContain("Could not fetch"); // not a transport failure
    expect(p).not.toContain("dcfEstimatePerShare"); // no fake JSON valuation
  });

  it("returns a safe fallback string when the model yields nothing", async () => {
    vi.stubEnv("FINNHUB_API_KEY", "");
    generate.mockResolvedValue("");
    const { runDcfAgent } = await import("./dcf-agent");
    expect(await runDcfAgent({ ticker: "AAPL" })).toBe("DCF unavailable.");
  });
});
