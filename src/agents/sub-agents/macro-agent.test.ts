import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const generate = vi.fn(async () => "MACRO ANALYSIS");
vi.mock("@/lib/llm", () => ({ generate: (o: unknown) => generate(o) }));
vi.mock("@/agents/skills", () => ({ getSkillsPrompt: () => "skill prompt" }));

const getMarketSnapshot = vi.fn();
const getMarketNews = vi.fn();
vi.mock("@/lib/finnhub", () => ({
  getMarketSnapshot: (...a: unknown[]) => getMarketSnapshot(...a),
  getMarketNews: (...a: unknown[]) => getMarketNews(...a),
}));

const perplexitySearch = vi.fn();
vi.mock("@/lib/perplexity", () => ({ perplexitySearch: (...a: unknown[]) => perplexitySearch(...a) }));

const lastPrompt = () => generate.mock.calls.at(-1)![0] as { prompt: string; agent: string };

beforeEach(() => {
  generate.mockClear().mockResolvedValue("MACRO ANALYSIS");
  getMarketSnapshot.mockReset().mockResolvedValue([]);
  getMarketNews.mockReset().mockResolvedValue([]);
  perplexitySearch.mockReset().mockResolvedValue("");
});
afterEach(() => vi.unstubAllEnvs());

describe("runMacroAgent", () => {
  it("uses 'data unavailable' placeholders when no Finnhub/Perplexity keys are set", async () => {
    vi.stubEnv("FINNHUB_API_KEY", "");
    vi.stubEnv("PERPLEXITY_API_KEY", "");
    const { runMacroAgent } = await import("./macro-agent");
    const out = await runMacroAgent({ sectors: [] });
    expect(out).toBe("MACRO ANALYSIS");
    expect(getMarketSnapshot).not.toHaveBeenCalled();
    expect(perplexitySearch).not.toHaveBeenCalled();
    const p = lastPrompt();
    expect(p.agent).toBe("macro");
    expect(p.prompt).toContain("Market data unavailable.");
    expect(p.prompt).toContain("News unavailable.");
  });

  it("feeds real market snapshot, headlines, and macro research into the model", async () => {
    vi.stubEnv("FINNHUB_API_KEY", "key");
    vi.stubEnv("PERPLEXITY_API_KEY", "key");
    getMarketSnapshot.mockResolvedValue([{ ticker: "SPY", price: 500, change: 1.2, changePct: 0.24 }]);
    getMarketNews.mockResolvedValue([{ headline: "Fed holds rates steady" }]);
    perplexitySearch.mockResolvedValue("Inflation cooling, soft landing in view.");
    const { runMacroAgent } = await import("./macro-agent");
    const out = await runMacroAgent({ sectors: ["Tech"] });
    expect(out).toBe("MACRO ANALYSIS");
    const p = lastPrompt().prompt;
    expect(p).toContain("SPY");
    expect(p).toContain("Fed holds rates steady");
    expect(p).toContain("Inflation cooling");
    expect(p).toContain("Tech");
  });

  it("degrades gracefully when Finnhub throws", async () => {
    vi.stubEnv("FINNHUB_API_KEY", "key");
    vi.stubEnv("PERPLEXITY_API_KEY", "");
    getMarketSnapshot.mockRejectedValue(new Error("rate limited"));
    const { runMacroAgent } = await import("./macro-agent");
    const out = await runMacroAgent({});
    expect(out).toBe("MACRO ANALYSIS");
    // catch leaves the placeholders in place
    expect(lastPrompt().prompt).toContain("Market data unavailable.");
  });

  it("returns a safe fallback string when the model yields nothing", async () => {
    vi.stubEnv("FINNHUB_API_KEY", "");
    vi.stubEnv("PERPLEXITY_API_KEY", "");
    generate.mockResolvedValue("");
    const { runMacroAgent } = await import("./macro-agent");
    expect(await runMacroAgent({})).toBe("Macro analysis unavailable.");
  });
});
