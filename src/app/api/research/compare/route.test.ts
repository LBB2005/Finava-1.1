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

const stock = (ticker: string, overrides = {}) => ({
  ticker,
  name: ticker,
  sector: "Technology",
  price: 100,
  chg: 1,
  marketCap: 1_000_000_000_000,
  pe: 25,
  f: { mom: 80, growth: 75, quality: 90, analyst: 70, value: 40, health: 85 },
  ...overrides,
});

function req(body: unknown) {
  return new Request("http://test.local/api/research/compare", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENROUTER_API_KEY = "or_key";
  deps.requireAuth.mockResolvedValue({ userId: "user_123" });
  deps.userRateLimit.mockReturnValue(null);
  deps.checkUsageLimit.mockResolvedValue(null);
  deps.generate.mockResolvedValue(JSON.stringify({
    winner: "AAPL",
    summary: "AAPL wins on quality.",
    perStock: [
      { ticker: "AAPL", oneLiner: "Quality leader.", bullCase: "Margins.", bearCase: "Valuation." },
    ],
  }));
});

describe("POST /api/research/compare", () => {
  it("gates auth, throttling, usage, and missing provider config", async () => {
    deps.requireAuth.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await POST(req({ stocks: [stock("AAPL"), stock("MSFT")] }))).status).toBe(401);

    deps.requireAuth.mockResolvedValueOnce({ userId: "user_123" });
    deps.userRateLimit.mockReturnValueOnce(NextResponse.json({ error: "slow" }, { status: 429 }));
    expect((await POST(req({ stocks: [stock("AAPL"), stock("MSFT")] }))).status).toBe(429);

    deps.userRateLimit.mockReturnValueOnce(null);
    deps.checkUsageLimit.mockResolvedValueOnce(NextResponse.json({ error: "quota" }, { status: 429 }));
    expect((await POST(req({ stocks: [stock("AAPL"), stock("MSFT")] }))).status).toBe(429);

    delete process.env.OPENROUTER_API_KEY;
    expect((await POST(req({ stocks: [stock("AAPL"), stock("MSFT")] }))).status).toBe(503);
  });

  it("returns validation errors for invalid JSON and too few stocks", async () => {
    expect((await POST(req("{"))).status).toBe(400);
    expect((await POST(req({ stocks: [stock("AAPL")] }))).status).toBe(400);
  });

  it("generates a normalized head-to-head verdict with fallback per-stock rows", async () => {
    const res = await POST(req({ stocks: [stock("AAPL"), stock("MSFT", { pe: null, marketCap: null })] }));

    expect(res.status).toBe(200);
    expect(deps.usageEnterWith).toHaveBeenCalledWith({ userId: "user_123" });
    expect(deps.generate).toHaveBeenCalledWith({
      agent: "compareVerdict",
      maxTokens: 1100,
      prompt: expect.stringContaining("AAPL (AAPL, Technology): price $100.00"),
    });
    await expect(res.json()).resolves.toEqual({
      verdict: {
        winner: "AAPL",
        summary: "AAPL wins on quality.",
        perStock: [
          { ticker: "AAPL", oneLiner: "Quality leader.", bullCase: "Margins.", bearCase: "Valuation." },
          { ticker: "MSFT", oneLiner: "", bullCase: "", bearCase: "" },
        ],
      },
    });
  });

  it("returns 502 for provider failures and unreadable model output", async () => {
    deps.generate.mockRejectedValueOnce(new Error("down"));
    expect((await POST(req({ stocks: [stock("AAPL"), stock("MSFT")] }))).status).toBe(502);

    deps.generate.mockResolvedValueOnce("not json");
    expect((await POST(req({ stocks: [stock("AAPL"), stock("MSFT")] }))).status).toBe(502);
  });
});
