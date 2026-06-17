import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const generate = vi.fn(async () => "SENTIMENT ANALYSIS");
vi.mock("@/lib/llm", () => ({ generate: (o: unknown) => generate(o) }));
vi.mock("@/agents/skills", () => ({ getSkillsPrompt: () => "skill prompt" }));

const recordUsage = vi.fn();
vi.mock("@/lib/usage", () => ({ recordUsage: (...a: unknown[]) => recordUsage(...a) }));

vi.mock("@/lib/externalContent", () => ({
  fenceExternal: (_label: string, s: string) => s,
  EXTERNAL_DATA_RULE: "rule",
}));

const lastPrompt = () => generate.mock.calls.at(-1)![0] as { prompt: string; agent: string };

beforeEach(() => {
  generate.mockClear().mockResolvedValue("SENTIMENT ANALYSIS");
  recordUsage.mockReset();
  vi.restoreAllMocks();
});
afterEach(() => vi.unstubAllEnvs());

describe("runSentimentAgent", () => {
  it("returns a guard string when no tickers are provided", async () => {
    const { runSentimentAgent } = await import("./sentiment-agent");
    const out = await runSentimentAgent({ tickers: [] });
    expect(out).toBe("No tickers provided for sentiment analysis.");
    expect(generate).not.toHaveBeenCalled();
  });

  it("normalizes a comma-joined string of tickers and synthesizes", async () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "");
    vi.stubEnv("STOCKTWITS_ACCESS_TOKEN", "");
    // Perplexity has no key (returns early), StockTwits fetch fails → null
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false } as Response);
    const { runSentimentAgent } = await import("./sentiment-agent");
    const out = await runSentimentAgent({ tickers: "aapl, msft" });
    expect(out).toBe("SENTIMENT ANALYSIS");
    expect(lastPrompt().agent).toBe("sentiment");
    expect(lastPrompt().prompt).toContain("AAPL, MSFT");
    expect(lastPrompt().prompt).toContain("Perplexity API key not configured.");
  });

  it("includes a StockTwits section and meters Perplexity usage on success", async () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "key");
    vi.stubEnv("STOCKTWITS_ACCESS_TOKEN", "tok");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url: unknown) => {
      const u = String(url);
      if (u.includes("perplexity")) {
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: "bullish chatter" } }],
            citations: ["https://news.example/x"],
          }),
        } as Response;
      }
      // StockTwits
      return {
        ok: true,
        json: async () => ({
          messages: [
            { body: "to the moon", entities: { sentiment: { basic: "Bullish" } } },
            { body: "dumping", entities: { sentiment: { basic: "Bearish" } } },
          ],
        }),
      } as Response;
    });
    const { runSentimentAgent } = await import("./sentiment-agent");
    const out = await runSentimentAgent({ tickers: ["AAPL"] });
    expect(out).toBe("SENTIMENT ANALYSIS");
    const p = lastPrompt().prompt;
    expect(p).toContain("StockTwits Live Stream");
    expect(p).toContain("bullish chatter");
    expect(p).toContain("Sources:");
    expect(recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ agent: "sentiment-perplexity" })
    );
  });

  it("degrades gracefully when the Perplexity call throws", async () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "key");
    vi.stubEnv("STOCKTWITS_ACCESS_TOKEN", "");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url: unknown) => {
      if (String(url).includes("perplexity")) throw new Error("boom");
      return { ok: false } as Response;
    });
    const { runSentimentAgent } = await import("./sentiment-agent");
    await runSentimentAgent({ tickers: ["AAPL"] });
    expect(lastPrompt().prompt).toContain("Perplexity search unavailable: boom");
  });
});
