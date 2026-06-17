import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const generate = vi.fn(async () => "TECHNICAL ANALYSIS");
vi.mock("@/lib/llm", () => ({ generate: (o: unknown) => generate(o) }));
vi.mock("@/agents/skills", () => ({ getSkillsPrompt: () => "skill prompt" }));

const getCandles = vi.fn();
vi.mock("@/lib/finnhub", () => ({ getCandles: (...a: unknown[]) => getCandles(...a) }));

const lastPrompt = () => generate.mock.calls.at(-1)![0] as { prompt: string; agent: string };

// 60 ascending closes — enough for SMA50/RSI/MACD, all indicators computable.
const closes = Array.from({ length: 60 }, (_, i) => 100 + i);

beforeEach(() => {
  generate.mockClear().mockResolvedValue("TECHNICAL ANALYSIS");
  getCandles.mockReset().mockResolvedValue({ s: "ok", c: closes });
});
afterEach(() => vi.unstubAllEnvs());

describe("runTechnicalAgent", () => {
  it("blocks analysis with a hard no-data signal when every ticker fails", async () => {
    getCandles.mockResolvedValue({ s: "no_data", c: null });
    const { runTechnicalAgent } = await import("./technical-agent");
    const out = await runTechnicalAgent({ tickers: ["AAPL", "MSFT"] });
    expect(out).toContain("DATA UNAVAILABLE — TECHNICAL ANALYSIS BLOCKED");
    expect(out).toContain("AAPL, MSFT");
    expect(generate).not.toHaveBeenCalled();
  });

  it("computes indicators and feeds them to the model on the happy path", async () => {
    const { runTechnicalAgent } = await import("./technical-agent");
    const out = await runTechnicalAgent({ tickers: ["AAPL"] });
    expect(out).toBe("TECHNICAL ANALYSIS");
    const p = lastPrompt();
    expect(p.agent).toBe("technical");
    expect(p.prompt).toContain("AAPL");
    expect(p.prompt).toContain("rsi");
    expect(p.prompt).toContain("macd");
    expect(p.prompt).toContain("currentPrice");
  });

  it("adds a data-quality warning when some (not all) tickers fail", async () => {
    getCandles.mockImplementation(async (ticker: string) =>
      ticker === "AAPL" ? { s: "ok", c: closes } : { s: "no_data", c: null }
    );
    const { runTechnicalAgent } = await import("./technical-agent");
    const out = await runTechnicalAgent({ tickers: ["AAPL", "BADX"] });
    expect(out).toBe("TECHNICAL ANALYSIS");
    const p = lastPrompt().prompt;
    expect(p).toContain("DATA QUALITY WARNING");
    expect(p).toContain("BADX");
    expect(p).toContain("Only analyze: AAPL");
  });

  it("marks a ticker as errored when getCandles throws", async () => {
    getCandles.mockImplementation(async (ticker: string) =>
      ticker === "AAPL" ? { s: "ok", c: closes } : Promise.reject(new Error("boom"))
    );
    const { runTechnicalAgent } = await import("./technical-agent");
    const out = await runTechnicalAgent({ tickers: ["AAPL", "ERRX"] });
    expect(out).toBe("TECHNICAL ANALYSIS");
    const p = lastPrompt().prompt;
    expect(p).toContain("Could not fetch data");
    expect(p).toContain("ERRX");
  });
});
