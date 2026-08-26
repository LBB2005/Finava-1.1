import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  requireEntitlement: vi.fn(),
  checkUsageLimit: vi.fn(),
  usageRun: vi.fn((_store: { userId: string }, fn: () => unknown) => fn()),
  usageEnterWith: vi.fn(),
  userRateLimit: vi.fn(),
  generate: vi.fn(),
  getCandles: vi.fn(),
  addBacktest: vi.fn(),
}));

vi.mock("@/lib/entitlements", () => ({
  requireEntitlement: deps.requireEntitlement,
}));

vi.mock("@/lib/usage", () => ({
  checkUsageLimit: deps.checkUsageLimit,
  makeRunContext: (u: string) => ({ userId: u }),
  usageStore: {
    run: deps.usageRun,
    enterWith: deps.usageEnterWith,
  },
}));

vi.mock("@/lib/rateLimit", () => ({
  userRateLimit: deps.userRateLimit,
}));

vi.mock("@/lib/llm", () => ({
  generate: deps.generate,
}));

vi.mock("@/lib/finnhub", () => ({
  getCandles: deps.getCandles,
}));

vi.mock("@/lib/firebase-admin", () => ({
  db: {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          add: deps.addBacktest,
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/requireAuth", () => ({
  requireAuth: vi.fn(async () => ({ userId: "user_123" })),
}));

import { POST } from "./route";

const candleData = {
  s: "ok",
  t: [1_704_067_200, 1_704_153_600, 1_704_240_000],
  c: [100, 101, 102],
};

beforeEach(() => {
  vi.clearAllMocks();
  deps.requireEntitlement.mockResolvedValue(null);
  deps.checkUsageLimit.mockResolvedValue(null);
  deps.userRateLimit.mockReturnValue(null);
  deps.generate
    .mockResolvedValueOnce(
      JSON.stringify({
        tickers: ["AAPL"],
        strategy: "equal_weight",
        startDate: "2024-01-01",
        endDate: "2024-01-03",
        benchmark: "SPY",
        rebalancePeriod: 20,
      })
    )
    .mockResolvedValueOnce("AAPL outpaced the benchmark in this sample.");
  deps.getCandles.mockResolvedValue(candleData);
  deps.addBacktest.mockResolvedValue({ id: "bt_1" });
});

describe("POST /api/backtest", () => {
  it("runs model work inside a scoped usage context instead of enterWith", async () => {
    const res = await POST(
      new Request("http://test.local/api/backtest", {
        method: "POST",
        body: JSON.stringify({ query: "backtest AAPL", portfolioTickers: ["AAPL"] }),
      })
    );

    expect(res.status).toBe(200);
    expect(deps.usageRun).toHaveBeenCalledWith({ userId: "user_123" }, expect.any(Function));
    expect(deps.usageEnterWith).not.toHaveBeenCalled();
    expect(deps.generate).toHaveBeenCalledTimes(2);
  });

  it("returns a structured validation error before model spend when query is blank", async () => {
    const res = await POST(
      new Request("http://test.local/api/backtest", {
        method: "POST",
        body: JSON.stringify({ query: "   " }),
      })
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "validation_error" },
      message: "Validation failed",
    });
    expect(deps.generate).not.toHaveBeenCalled();
    expect(deps.usageRun).not.toHaveBeenCalled();
  });
});
