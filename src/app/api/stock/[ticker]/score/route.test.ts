import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  rateLimitGuard: vi.fn(),
  getFactorUniverse: vi.fn(),
}));

vi.mock("@/lib/rateLimit", () => ({ rateLimitGuard: deps.rateLimitGuard }));
vi.mock("@/lib/factorUniverse", () => ({ getFactorUniverse: deps.getFactorUniverse }));

import { GET } from "./route";

function ctx(ticker: string) {
  return { params: Promise.resolve({ ticker }) };
}

const STOCK = {
  ticker: "NVDA",
  name: "NVIDIA",
  sector: "Tech",
  price: 199,
  chg: 2.2,
  f: { mom: 82, growth: 94, quality: 91, analyst: 76, value: 38, health: 88 },
  mv: { week: 1, month: 4, year: 40 },
};

beforeEach(() => {
  vi.clearAllMocks();
  deps.rateLimitGuard.mockResolvedValue(null);
  deps.getFactorUniverse.mockResolvedValue({
    stocks: [STOCK],
    asOf: "2026-08-07T12:00:00.000Z",
    coverage: { total: 1, fundamentals: 1, analyst: 1 },
  });
});

describe("GET /api/stock/[ticker]/score", () => {
  it("returns pillars + composite score + grade for a universe ticker", async () => {
    const res = await GET(new Request("http://t"), ctx("nvda"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ticker).toBe("NVDA");
    expect(body.f).toEqual(STOCK.f);
    expect(typeof body.score).toBe("number");
    expect(body.score).toBeGreaterThan(0);
    expect(typeof body.grade).toBe("string");
    expect(body.asOf).toBe("2026-08-07T12:00:00.000Z");
  });

  it("404s outside the universe and 400s on a blank ticker", async () => {
    expect((await GET(new Request("http://t"), ctx("ZZZZ"))).status).toBe(404);
    expect((await GET(new Request("http://t"), ctx("  "))).status).toBe(400);
  });

  it("502s when the factor engine fails", async () => {
    deps.getFactorUniverse.mockRejectedValueOnce(new Error("engine down"));
    expect((await GET(new Request("http://t"), ctx("NVDA"))).status).toBe(502);
  });
});
