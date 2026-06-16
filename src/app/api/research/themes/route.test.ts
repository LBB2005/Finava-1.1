import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const deps = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  rateLimitGuard: vi.fn(),
  generate: vi.fn(),
}));

vi.mock("@/lib/requireAuth", () => ({ requireAuth: deps.requireAuth }));
vi.mock("@/lib/rateLimit", () => ({ rateLimitGuard: deps.rateLimitGuard }));
vi.mock("@/lib/llm", () => ({ generate: deps.generate }));

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
  vi.clearAllMocks();
  process.env.OPENROUTER_API_KEY = "or_key";
  deps.requireAuth.mockResolvedValue({ userId: "user_123" });
  deps.rateLimitGuard.mockReturnValue(null);
  deps.generate.mockResolvedValue(JSON.stringify({
    themes: [
      {
        name: "AI Infrastructure",
        thesis: "Semis and cloud names benefit.",
        tickers: ["NVDA", "MSFT", "AAPL", "FAKE", "NVDA"],
      },
      { name: "", thesis: "drop", tickers: ["AAPL", "MSFT", "NVDA"] },
      { name: "Too Thin", thesis: "drop", tickers: ["AAPL", "FAKE"] },
    ],
  }));
});

describe("GET /api/research/themes", () => {
  it("gates auth, rate limiting, and missing provider config", async () => {
    let { GET } = await loadRoute();
    deps.requireAuth.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await GET(new Request("http://test.local/api/research/themes"))).status).toBe(401);

    ({ GET } = await loadRoute());
    deps.rateLimitGuard.mockReturnValueOnce(NextResponse.json({ error: "slow" }, { status: 429 }));
    expect((await GET(new Request("http://test.local/api/research/themes"))).status).toBe(429);

    ({ GET } = await loadRoute());
    delete process.env.OPENROUTER_API_KEY;
    expect((await GET(new Request("http://test.local/api/research/themes"))).status).toBe(503);
  });

  it("generates validated themes, drops hallucinated tickers, and caches warm responses", async () => {
    const { GET } = await loadRoute();

    const first = await GET(new Request("http://test.local/api/research/themes"));
    const second = await GET(new Request("http://test.local/api/research/themes"));

    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({
      themes: [
        {
          key: "ai-infrastructure",
          name: "AI Infrastructure",
          thesis: "Semis and cloud names benefit.",
          tickers: ["NVDA", "MSFT", "AAPL"],
        },
      ],
      asOf: "2026-06-15T12:00:00.000Z",
    });
    await expect(second.json()).resolves.toMatchObject({
      themes: [expect.objectContaining({ key: "ai-infrastructure" })],
    });
    expect(deps.generate).toHaveBeenCalledTimes(1);
  });

  it("returns 502 when no valid themes are produced", async () => {
    deps.generate.mockResolvedValueOnce(JSON.stringify({ themes: [{ name: "Bad", tickers: ["FAKE"] }] }));
    const { GET } = await loadRoute();

    const res = await GET(new Request("http://test.local/api/research/themes"));

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "Failed to generate themes." });
  });
});
