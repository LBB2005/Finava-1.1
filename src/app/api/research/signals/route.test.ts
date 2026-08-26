import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const deps = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  userRateLimit: vi.fn(),
  checkUsageLimit: vi.fn(),
  usageEnterWith: vi.fn(),
  generate: vi.fn(),
}));

vi.mock("@/lib/requireAuth", () => ({ requireAuth: deps.requireAuth }));
vi.mock("@/lib/rateLimit", () => ({ userRateLimit: deps.userRateLimit }));
vi.mock("@/lib/usage", () => ({
  checkUsageLimit: deps.checkUsageLimit,
  makeRunContext: (u: string) => ({ userId: u }),
  usageStore: { enterWith: deps.usageEnterWith },
}));
vi.mock("@/lib/llm", () => ({ generate: deps.generate }));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://test.local/api/research/signals", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const event = {
  ticker: "AAPL",
  name: "Apple",
  sector: "Technology",
  category: "mover",
  fact: "AAPL is up 5% on heavy volume.",
  lean: 0.6,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENROUTER_API_KEY = "or_key";
  deps.requireAuth.mockResolvedValue({ userId: "user_123" });
  deps.userRateLimit.mockReturnValue(null);
  deps.checkUsageLimit.mockResolvedValue(null);
  deps.generate.mockResolvedValue(JSON.stringify({
    items: [{ n: 1, headline: "Apple breaks out", take: "Momentum improved." }],
  }));
});

describe("POST /api/research/signals", () => {
  it("gates auth, throttling, usage, and missing provider config", async () => {
    deps.requireAuth.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await POST(req({ events: [event] }))).status).toBe(401);

    deps.requireAuth.mockResolvedValueOnce({ userId: "user_123" });
    deps.userRateLimit.mockReturnValueOnce(NextResponse.json({ error: "slow" }, { status: 429 }));
    expect((await POST(req({ events: [event] }))).status).toBe(429);

    deps.userRateLimit.mockReturnValueOnce(null);
    deps.checkUsageLimit.mockResolvedValueOnce(NextResponse.json({ error: "quota" }, { status: 429 }));
    expect((await POST(req({ events: [event] }))).status).toBe(429);

    delete process.env.OPENROUTER_API_KEY;
    expect((await POST(req({ events: [event] }))).status).toBe(503);
  });

  it("returns an empty feed for empty inputs and 400 for invalid JSON", async () => {
    await expect((await POST(req({ events: [] }))).json()).resolves.toEqual({ feed: [] });
    expect((await POST(req("{"))).status).toBe(400);
  });

  it("narrates signals and falls back when model items are missing", async () => {
    const res = await POST(req({
      events: [
        event,
        { ...event, ticker: "MSFT", category: "not-real", lean: -0.6, fact: "MSFT fell." },
        { ...event, ticker: "GOOGL", lean: 0, fact: "GOOGL is flat." },
      ],
    }));

    expect(res.status).toBe(200);
    expect(deps.usageEnterWith).toHaveBeenCalledWith({ userId: "user_123" });
    expect(deps.generate).toHaveBeenCalledWith({
      agent: "signalsNarrate",
      maxTokens: 1400,
      prompt: expect.stringContaining("AAPL (Apple, Technology)"),
    });
    await expect(res.json()).resolves.toEqual({
      feed: [
        { ticker: "AAPL", category: "mover", headline: "Apple breaks out", take: "Momentum improved.", sentiment: "bullish" },
        { ticker: "MSFT", category: "mover", headline: "MSFT — Big Move", take: "MSFT fell.", sentiment: "bearish" },
        { ticker: "GOOGL", category: "mover", headline: "GOOGL — Big Move", take: "GOOGL is flat.", sentiment: "neutral" },
      ],
    });
  });

  it("returns 502 when the narration provider fails", async () => {
    deps.generate.mockRejectedValueOnce(new Error("down"));

    const res = await POST(req({ events: [event] }));

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "The signals feed could not be generated." });
  });
});
