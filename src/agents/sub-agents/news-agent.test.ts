import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const generate = vi.fn(async () => "NEWS ANALYSIS");
vi.mock("@/lib/llm", () => ({ generate: (o: unknown) => generate(o) }));
vi.mock("@/agents/skills", () => ({ getSkillsPrompt: () => "skill prompt" }));

const getCompanyNews = vi.fn();
vi.mock("@/lib/finnhub", () => ({ getCompanyNews: (...a: unknown[]) => getCompanyNews(...a) }));

const perplexitySearch = vi.fn();
vi.mock("@/lib/perplexity", () => ({ perplexitySearch: (...a: unknown[]) => perplexitySearch(...a) }));

vi.mock("@/lib/externalContent", () => ({
  fenceExternal: (_label: string, s: string) => s,
  EXTERNAL_DATA_RULE: "rule",
}));

const lastPrompt = () => generate.mock.calls.at(-1)![0] as { prompt: string; agent: string };

beforeEach(() => {
  generate.mockClear().mockResolvedValue("NEWS ANALYSIS");
  getCompanyNews.mockReset().mockResolvedValue([]);
  perplexitySearch.mockReset().mockResolvedValue("");
});
afterEach(() => vi.unstubAllEnvs());

describe("runNewsAgent", () => {
  it("returns a hard NEWS DATA UNAVAILABLE signal when both sources are empty", async () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "");
    const { runNewsAgent } = await import("./news-agent");
    const out = await runNewsAgent({ tickers: ["AAPL"] });
    expect(out).toContain("NEWS DATA UNAVAILABLE for AAPL");
    expect(out).toContain("Treat news/sentiment for these tickers as unknown.");
    expect(generate).not.toHaveBeenCalled();
  });

  it("summarizes Finnhub headlines plus Perplexity research on the happy path", async () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "key");
    getCompanyNews.mockResolvedValue([
      { headline: "Apple unveils new chip", datetime: 1_700_000_000 },
    ]);
    perplexitySearch.mockResolvedValue("Analysts upbeat on services growth.");
    const { runNewsAgent } = await import("./news-agent");
    const out = await runNewsAgent({ tickers: ["AAPL"], days: 7 });
    expect(out).toBe("NEWS ANALYSIS");
    const p = lastPrompt();
    expect(p.agent).toBe("news");
    expect(p.prompt).toContain("Apple unveils new chip");
    expect(p.prompt).toContain("Analysts upbeat on services growth.");
    expect(p.prompt).toContain("AAPL");
  });

  it("falls back to a no-Finnhub note but still synthesizes when only web research exists", async () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "key");
    getCompanyNews.mockRejectedValue(new Error("rate limited"));
    perplexitySearch.mockResolvedValue("Some web research.");
    const { runNewsAgent } = await import("./news-agent");
    const out = await runNewsAgent({ tickers: ["AAPL"] });
    expect(out).toBe("NEWS ANALYSIS");
    expect(lastPrompt().prompt).toContain("No Finnhub news found for AAPL.");
    expect(lastPrompt().prompt).toContain("Some web research.");
  });

  it("passes through whatever the model returns (including empty)", async () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "key");
    getCompanyNews.mockResolvedValue([{ headline: "x", datetime: 1_700_000_000 }]);
    generate.mockResolvedValue("");
    const { runNewsAgent } = await import("./news-agent");
    expect(await runNewsAgent({ tickers: ["AAPL"] })).toBe("");
  });
});
