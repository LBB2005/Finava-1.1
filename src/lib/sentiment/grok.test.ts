import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  recordUsage: vi.fn(),
}));

vi.mock("@/lib/usage", () => ({
  recordUsage: deps.recordUsage,
}));

async function loadGrok() {
  vi.resetModules();
  return import("./grok");
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.XAI_API_KEY;
  delete process.env.XAI_MODEL;
  vi.stubGlobal("fetch", vi.fn());
});

describe("getGrokSentiment", () => {
  it("returns null without an xAI key or when the API fails", async () => {
    const { getGrokSentiment } = await loadGrok();

    await expect(getGrokSentiment("AAPL")).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();

    process.env.XAI_API_KEY = "xai_key";
    const mod = await loadGrok();
    vi.mocked(fetch).mockResolvedValueOnce(new Response("bad", { status: 500 }));
    await expect(mod.getGrokSentiment("AAPL")).resolves.toBeNull();
  });

  it("calls xAI Agent Tools, extracts citations, clamps score, and records flat usage", async () => {
    process.env.XAI_API_KEY = "xai_key";
    process.env.XAI_MODEL = "grok-test";
    const { getGrokSentiment } = await loadGrok();
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: '{"foundPosts": 9, "score": 1.4, "summary": "Bullish product chatter."}',
                annotations: [
                  { type: "url_citation", url: "https://x.com/post/1" },
                  { type: "url_citation", url: "https://x.com/post/2" },
                ],
              },
            ],
          },
        ],
      })
    );

    await expect(getGrokSentiment("AAPL", "Apple")).resolves.toEqual({
      score: 1,
      confidence: 0.6,
      foundPosts: 9,
      degraded: false,
      detail: "9 X posts assessed. Bullish product chatter.",
      citations: ["https://x.com/post/1", "https://x.com/post/2"],
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.x.ai/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer xai_key", "Content-Type": "application/json" },
        body: expect.stringContaining("AAPL (Apple)"),
      })
    );
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toMatchObject({
      model: "grok-test",
      tools: [{ type: "x_search" }],
    });
    expect(deps.recordUsage).toHaveBeenCalledWith({
      agent: "sentiment-grok",
      model: "xai/grok-test",
      flatCredits: 120,
    });
  });

  it("drops degraded unsourced answers and tolerates malformed responses", async () => {
    process.env.XAI_API_KEY = "xai_key";
    const { getGrokSentiment } = await loadGrok();
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        Response.json({
          output: [{
            type: "message",
            content: [{ type: "output_text", text: '{"foundPosts": 0, "score": -0.5, "summary": "Memory answer"}', annotations: [] }],
          }],
        })
      )
      .mockResolvedValueOnce(Response.json({ output: [] }))
      .mockRejectedValueOnce(new Error("network"));

    await expect(getGrokSentiment("AAPL")).resolves.toMatchObject({
      score: -0.5,
      confidence: 0,
      foundPosts: 0,
      degraded: true,
      detail: "X live search returned no usable posts — signal dropped.",
      citations: [],
    });
    await expect(getGrokSentiment("AAPL")).resolves.toMatchObject({
      score: 0,
      confidence: 0,
      degraded: true,
    });
    await expect(getGrokSentiment("AAPL")).resolves.toBeNull();
  });
});
