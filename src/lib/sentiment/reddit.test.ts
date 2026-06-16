import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  generate: vi.fn(),
}));

vi.mock("@/lib/llm", () => ({
  generate: deps.generate,
}));

import { DEFAULT_SUBS, scoreRedditSentiment } from "./reddit";

function redditPost(subreddit: string, title: string, score: number, createdUtc: number, selftext = "") {
  return {
    data: {
      subreddit,
      title,
      selftext,
      score,
      created_utc: createdUtc,
      permalink: `/r/${subreddit}/comments/1/post`,
    },
  };
}

function redditResponse(children: unknown[], after: string | null = null) {
  return Response.json({ data: { children, after } });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
  vi.clearAllMocks();
  delete process.env.REDDIT_ENABLED;
  process.env.REDDIT_USER_AGENT = "test-agent";
  vi.stubGlobal("fetch", vi.fn(async () => redditResponse([])));
  deps.generate.mockResolvedValue('[{"i":0,"s":1},{"i":1,"s":-1}]');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("scoreRedditSentiment", () => {
  it("is default-off and avoids HTTP work unless explicitly enabled", async () => {
    await expect(scoreRedditSentiment("AAPL")).resolves.toBeNull();

    expect(fetch).not.toHaveBeenCalled();
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("fetches, filters, scores, aggregates, and reports WSB separately", async () => {
    process.env.REDDIT_ENABLED = "1";
    const nowSec = Math.floor(Date.now() / 1000);
    vi.mocked(fetch).mockImplementation(async (url: string) => {
      if (url.includes("/r/wallstreetbets/")) {
        return redditResponse([
          redditPost("wallstreetbets", "AAPL calls look strong", 10, nowSec - 60),
          redditPost("wallstreetbets", "AAPL valuation worries me", 5, nowSec - 120),
          redditPost("wallstreetbets", "MSFT unrelated", 100, nowSec - 60),
          redditPost("wallstreetbets", "AAPL too old", 100, nowSec - 10 * 24 * 3600),
          redditPost("wallstreetbets", "AAPL too tiny", 1, nowSec - 60),
        ]);
      }
      if (url.includes("/r/stocks/")) {
        return redditResponse([
          redditPost("stocks", "AAPL services growth", 20, nowSec - 60),
        ]);
      }
      return redditResponse([]);
    });
    deps.generate
      .mockResolvedValueOnce('[{"i":0,"s":1},{"i":1,"s":-1}]')
      .mockResolvedValueOnce('[{"i":0,"s":1}]');

    const result = await scoreRedditSentiment("AAPL", "Apple");

    expect(result).toEqual({
      score: expect.closeTo(0.5556, 4),
      scoredPosts: 3,
      candidatePosts: 3,
      windowHours: 168,
      detail: expect.stringContaining("3 posts scored across 2 subs over 168h"),
      wsb: {
        score: expect.closeTo(0.3333, 4),
        n: 2,
        detail: expect.stringContaining("r/wallstreetbets: +0.33 across 2 posts"),
      },
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("https://www.reddit.com/r/wallstreetbets/search.json?"),
      expect.objectContaining({ headers: { "User-Agent": "web:finava-app:1.0 (sentiment)" } })
    );
    expect(deps.generate).toHaveBeenCalledWith({
      agent: "sentiment",
      maxTokens: 900,
      prompt: expect.stringContaining("AAPL (Apple)"),
    });
  });

  it("uses the generic ticker-sub fallback when the ticker subreddit is empty", async () => {
    process.env.REDDIT_ENABLED = "1";
    const nowSec = Math.floor(Date.now() / 1000);
    vi.mocked(fetch).mockImplementation(async (url: string) => {
      if (url.includes("/r/AAPL/")) return redditResponse([]);
      if (url.includes("/r/StocksAndTrading/")) {
        return redditResponse([redditPost("StocksAndTrading", "AAPL discussion", 5, nowSec - 60)]);
      }
      return redditResponse([]);
    });
    deps.generate.mockResolvedValue('[{"i":0,"s":0}]');

    const result = await scoreRedditSentiment("AAPL");

    expect(result).toMatchObject({
      score: 0,
      scoredPosts: 1,
      candidatePosts: 1,
      windowHours: 168,
    });
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/r/StocksAndTrading/"))).toBe(true);
  });

  it("paginates subreddit fetches and returns null when scoring yields no usable posts", async () => {
    process.env.REDDIT_ENABLED = "1";
    const nowSec = Math.floor(Date.now() / 1000);
    vi.mocked(fetch).mockImplementation(async (url: string) => {
      if (url.includes("/r/stocks/") && !url.includes("after=next")) {
        return redditResponse([redditPost("stocks", "AAPL first page", 4, nowSec - 60)], "next");
      }
      if (url.includes("/r/stocks/") && url.includes("after=next")) {
        return redditResponse([redditPost("stocks", "AAPL second page", 4, nowSec - 60)]);
      }
      return redditResponse([]);
    });
    deps.generate.mockResolvedValue("not json");

    await expect(scoreRedditSentiment("AAPL")).resolves.toBeNull();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("after=next"))).toBe(true);
  });

  it("failure-isolates blocked or throwing subreddits", async () => {
    process.env.REDDIT_ENABLED = "1";
    vi.mocked(fetch).mockImplementation(async (url: string) => {
      if (url.includes("/r/wallstreetbets/")) throw new Error("blocked");
      if (url.includes("/r/stocks/")) return new Response("forbidden", { status: 403 });
      return redditResponse([]);
    });

    await expect(scoreRedditSentiment("AAPL")).resolves.toBeNull();
  });

  it("documents the default sub list used by the Reddit signal", () => {
    expect(DEFAULT_SUBS).toContain("wallstreetbets");
    expect(DEFAULT_SUBS).toContain("SecurityAnalysis");
    expect(DEFAULT_SUBS).toHaveLength(9);
  });
});
