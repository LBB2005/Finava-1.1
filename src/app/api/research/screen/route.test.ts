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
  return new Request("http://test.local/api/research/screen", {
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
  deps.generate.mockResolvedValue(
    JSON.stringify({
      filter: { factors: { value: { min: 80 } }, limit: 5 },
      interpretation: "Cheap high-quality names.",
    })
  );
});

describe("POST /api/research/screen", () => {
  it("short-circuits auth, rate-limit, and usage gates before AI work", async () => {
    deps.requireAuth.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await POST(req({ mode: "parse", query: "cheap" }))).status).toBe(401);
    expect(deps.generate).not.toHaveBeenCalled();

    deps.requireAuth.mockResolvedValueOnce({ userId: "user_123" });
    deps.userRateLimit.mockReturnValueOnce(NextResponse.json({ error: "slow" }, { status: 429 }));
    expect((await POST(req({ mode: "parse", query: "cheap" }))).status).toBe(429);

    deps.userRateLimit.mockReturnValueOnce(null);
    deps.checkUsageLimit.mockResolvedValueOnce(NextResponse.json({ error: "quota" }, { status: 429 }));
    expect((await POST(req({ mode: "parse", query: "cheap" }))).status).toBe(429);
  });

  it("returns 503 before parsing when OpenRouter is missing", async () => {
    delete process.env.OPENROUTER_API_KEY;

    const res = await POST(req({ mode: "parse", query: "cheap" }));

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: "AI service not configured (OPENROUTER_API_KEY missing).",
    });
  });

  it("parses natural language into a coerced screen filter", async () => {
    const res = await POST(req({ mode: "parse", query: "cheap stocks" }));

    expect(res.status).toBe(200);
    expect(deps.usageEnterWith).toHaveBeenCalledWith({ userId: "user_123" });
    expect(deps.generate).toHaveBeenCalledWith({
      agent: "screenParse",
      maxTokens: 600,
      prompt: expect.stringContaining('Request: "cheap stocks"'),
    });
    await expect(res.json()).resolves.toMatchObject({
      filter: { factors: { value: { min: 80 } }, limit: 5 },
      interpretation: "Cheap high-quality names.",
    });
  });

  it("builds commentary and suggest responses from model JSON", async () => {
    deps.generate
      .mockResolvedValueOnce(JSON.stringify({
        commentary: "The basket leans profitable.",
        standout: "AAPL has the cleanest score.",
        watchout: "Valuation is still elevated.",
      }))
      .mockResolvedValueOnce(JSON.stringify({
        screens: [
          { label: "AI Winners", rationale: "Momentum is strong.", query: "AI momentum" },
          { label: "", rationale: "drop", query: "drop" },
        ],
      }));

    await expect(
      (await POST(req({
        mode: "commentary",
        query: "quality",
        stocks: [{ ticker: "AAPL", name: "Apple", sector: "Tech", score: 90 }],
      }))).json()
    ).resolves.toEqual({
      commentary: "The basket leans profitable.",
      standout: "AAPL has the cleanest score.",
      watchout: "Valuation is still elevated.",
    });

    await expect((await POST(req({ mode: "suggest", summary: { movers: ["AAPL"] } }))).json())
      .resolves.toEqual({
        screens: [{ label: "AI Winners", rationale: "Momentum is strong.", query: "AI momentum" }],
      });
  });

  it("handles bad bodies, unknown modes, empty query, and model failures", async () => {
    expect((await POST(req("{"))).status).toBe(400);
    expect((await POST(req({ mode: "what" }))).status).toBe(400);
    expect((await POST(req({ mode: "parse", query: "  " }))).status).toBe(400);

    deps.generate.mockResolvedValueOnce("not json");
    const res = await POST(req({ mode: "parse", query: "cheap" }));
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "The screener AI failed. Try again." });
  });
});
