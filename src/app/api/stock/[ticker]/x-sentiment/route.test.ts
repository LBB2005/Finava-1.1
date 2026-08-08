import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const deps = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  userRateLimit: vi.fn(),
  checkUsageLimit: vi.fn(),
  usageEnterWith: vi.fn(),
  checkCache: vi.fn(),
  saveCache: vi.fn(),
  getGrokSentiment: vi.fn(),
  getCompanyProfile: vi.fn(),
}));

vi.mock("@/lib/requireAuth", () => ({ requireAuth: deps.requireAuth }));
vi.mock("@/lib/rateLimit", () => ({ userRateLimit: deps.userRateLimit }));
vi.mock("@/lib/usage", () => ({
  checkUsageLimit: deps.checkUsageLimit,
  usageStore: { enterWith: deps.usageEnterWith },
}));
vi.mock("@/lib/agentMemory", () => ({
  checkCache: deps.checkCache,
  saveCache: deps.saveCache,
}));
vi.mock("@/lib/sentiment/grok", () => ({ getGrokSentiment: deps.getGrokSentiment }));
vi.mock("@/lib/finnhub", () => ({ getCompanyProfile: deps.getCompanyProfile }));

import { GET, POST } from "./route";

function ctx(ticker: string) {
  return { params: Promise.resolve({ ticker }) };
}

const CACHED = JSON.stringify({
  ticker: "NVDA",
  score: 71,
  confidence: 0.8,
  foundPosts: 12,
  detail: "Bullish, cooling from last week.",
  updatedAt: "2026-08-07T10:00:00.000Z",
});

beforeEach(() => {
  vi.clearAllMocks();
  deps.requireAuth.mockResolvedValue({ userId: "user_123" });
  deps.userRateLimit.mockResolvedValue(null);
  deps.checkUsageLimit.mockResolvedValue(null);
  deps.checkCache.mockResolvedValue(null);
  deps.getCompanyProfile.mockResolvedValue({ name: "NVIDIA" });
});

describe("GET /api/stock/[ticker]/x-sentiment", () => {
  it("serves the shared cache without auth or spend", async () => {
    deps.checkCache.mockResolvedValueOnce(CACHED);
    const res = await GET(new Request("http://t"), ctx("nvda"));
    expect(res.status).toBe(200);
    expect((await res.json()).score).toBe(71);
    expect(deps.checkCache).toHaveBeenCalledWith("x-sentiment", { ticker: "NVDA" });
    expect(deps.requireAuth).not.toHaveBeenCalled();
    expect(deps.getGrokSentiment).not.toHaveBeenCalled();
  });

  it("404s when uncached", async () => {
    expect((await GET(new Request("http://t"), ctx("NVDA"))).status).toBe(404);
  });
});

describe("POST /api/stock/[ticker]/x-sentiment", () => {
  it("gates on auth and usage before spending", async () => {
    deps.requireAuth.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await POST(new Request("http://t"), ctx("NVDA"))).status).toBe(401);

    deps.checkUsageLimit.mockResolvedValueOnce(
      NextResponse.json({ error: "quota" }, { status: 429 })
    );
    expect((await POST(new Request("http://t"), ctx("NVDA"))).status).toBe(429);
    expect(deps.getGrokSentiment).not.toHaveBeenCalled();
  });

  it("computes, maps to 0-100, and caches a good read", async () => {
    deps.getGrokSentiment.mockResolvedValueOnce({
      score: 0.42,
      confidence: 0.8,
      foundPosts: 12,
      degraded: false,
      detail: "Bullish chatter.",
      citations: ["a"],
    });
    const res = await POST(new Request("http://t"), ctx("nvda"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.score).toBe(71); // (0.42+1)*50 = 71
    expect(deps.usageEnterWith).toHaveBeenCalledWith({ userId: "user_123" });
    expect(deps.getGrokSentiment).toHaveBeenCalledWith("NVDA", "NVIDIA");
    expect(deps.saveCache).toHaveBeenCalledWith(
      "x-sentiment",
      { ticker: "NVDA" },
      expect.stringContaining('"score":71')
    );
  });

  it("returns the fresh cache instead of double-spending", async () => {
    deps.checkCache.mockResolvedValueOnce(CACHED);
    const res = await POST(new Request("http://t"), ctx("NVDA"));
    expect(res.status).toBe(200);
    expect(deps.getGrokSentiment).not.toHaveBeenCalled();
  });

  it("never caches or scores a degraded read", async () => {
    deps.getGrokSentiment.mockResolvedValueOnce({
      score: 0,
      confidence: 0,
      foundPosts: 0,
      degraded: true,
      detail: "",
      citations: [],
    });
    const res = await POST(new Request("http://t"), ctx("NVDA"));
    expect(res.status).toBe(502);
    expect(deps.saveCache).not.toHaveBeenCalled();
  });
});
