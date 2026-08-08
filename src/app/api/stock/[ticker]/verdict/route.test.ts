import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const deps = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  readVerdict: vi.fn(),
}));

vi.mock("@/lib/requireAuth", () => ({ requireAuth: deps.requireAuth }));
vi.mock("@/lib/verdictStore", () => ({ readVerdict: deps.readVerdict }));

import { GET } from "./route";

function ctx(ticker: string) {
  return { params: Promise.resolve({ ticker }) };
}

const CACHED = {
  verdict: {
    score: 82,
    stance: "Bullish",
    confidence: "High",
    fairValue: 230,
    upsidePct: 15,
    take: "Strong setup.",
    catalysts: ["Services growth"],
    risks: ["Multiple compression"],
    comparison: { finava: 230, street: 225, dcf: 215 },
  },
  signals: [{ key: "fundamentals", label: "Fundamentals", score: 77, stance: "bullish", headline: "h", detail: "d" }],
  updatedAt: "2026-08-05T12:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  deps.requireAuth.mockResolvedValue({ userId: "user_123" });
});

describe("GET /api/stock/[ticker]/verdict", () => {
  it("requires auth", async () => {
    deps.requireAuth.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await GET(new Request("http://test.local"), ctx("AAPL"));
    expect(res.status).toBe(401);
    expect(deps.readVerdict).not.toHaveBeenCalled();
  });

  it("400s on a blank ticker", async () => {
    const res = await GET(new Request("http://test.local"), ctx("   "));
    expect(res.status).toBe(400);
  });

  it("404s when the user has never run this ticker", async () => {
    deps.readVerdict.mockResolvedValueOnce(null);
    const res = await GET(new Request("http://test.local"), ctx("AAPL"));
    expect(res.status).toBe(404);
  });

  it("returns the cached run, uppercasing the ticker for the store", async () => {
    deps.readVerdict.mockResolvedValueOnce(CACHED);
    const res = await GET(new Request("http://test.local"), ctx("aapl"));
    expect(res.status).toBe(200);
    expect(deps.readVerdict).toHaveBeenCalledWith("user_123", "AAPL");
    const body = await res.json();
    expect(body.verdict.score).toBe(82);
    expect(body.signals).toHaveLength(1);
    expect(body.updatedAt).toBe(CACHED.updatedAt);
  });
});
