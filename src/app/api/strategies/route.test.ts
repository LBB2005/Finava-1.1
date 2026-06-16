import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const deps = vi.hoisted(() => ({
  requireEntitlement: vi.fn(),
  batchSet: vi.fn(),
  batchCommit: vi.fn(),
  orderByGet: vi.fn(),
  addStrategy: vi.fn(),
  serializeDoc: vi.fn((id: string, data: Record<string, unknown>) => ({ id, ...data })),
}));

vi.mock("@/lib/withRoute", () => ({
  withRoute: vi.fn((_opts, handler) => async (req: Request) => {
    let body;
    try {
      body = req.method === "POST" ? await req.json() : undefined;
    } catch {
      body = undefined;
    }
    return handler({ req, userId: "user_123", body });
  }),
}));

vi.mock("@/lib/entitlements", () => ({
  requireEntitlement: deps.requireEntitlement,
}));

vi.mock("@/lib/firebase-admin", () => ({
  serializeDoc: deps.serializeDoc,
  db: {
    batch: vi.fn(() => ({
      set: deps.batchSet,
      commit: deps.batchCommit,
    })),
    collection: vi.fn((name: string) => {
      if (name !== "users") throw new Error(`unexpected collection ${name}`);
      return {
        doc: vi.fn((userId?: string) => ({
          id: userId ?? "generated_id",
          collection: vi.fn((sub: string) => {
            if (sub !== "strategies") throw new Error(`unexpected subcollection ${sub}`);
            return {
              doc: vi.fn(() => ({ id: "seed_ref" })),
              add: deps.addStrategy,
              orderBy: vi.fn(() => ({ get: deps.orderByGet })),
            };
          }),
        })),
      };
    }),
  },
}));

import { GET, POST } from "./route";

const storedStrategy = {
  name: "Stored Strategy",
  tag: "Live",
  desc: "Existing",
  tickers: JSON.stringify(["SPY"]),
  config: JSON.stringify({ mode: "allocation" }),
  research: "Stored research",
  sharpe: 1.2,
  cagr: 10,
  maxDD: -5,
  winRate: 60,
  active: true,
  lastTrade: "BUY",
};

beforeEach(() => {
  vi.clearAllMocks();
  deps.requireEntitlement.mockResolvedValue(null);
  deps.batchCommit.mockResolvedValue(undefined);
  deps.orderByGet.mockResolvedValue({
    empty: false,
    docs: [{ id: "strategy_1", data: () => storedStrategy }],
  });
  deps.addStrategy.mockResolvedValue({
    get: vi.fn(async () => ({
      id: "new_strategy",
      data: () => ({
        ...storedStrategy,
        name: "Custom Strategy",
        tickers: JSON.stringify(["AAPL", "MSFT"]),
        config: JSON.stringify({ mode: "custom" }),
        active: false,
        lastTrade: "—",
      }),
    })),
  });
});

describe("GET /api/strategies", () => {
  it("returns entitlement gate responses before Firestore reads", async () => {
    deps.requireEntitlement.mockResolvedValueOnce(
      NextResponse.json({ error: "Upgrade required" }, { status: 403 })
    );

    const res = await GET(new Request("http://test.local/api/strategies"));

    expect(res.status).toBe(403);
    expect(deps.orderByGet).not.toHaveBeenCalled();
  });

  it("returns existing strategies with JSON fields decoded", async () => {
    const res = await GET(new Request("http://test.local/api/strategies"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([
      {
        id: "strategy_1",
        name: "Stored Strategy",
        tag: "Live",
        desc: "Existing",
        tickers: ["SPY"],
        config: { mode: "allocation" },
        research: "Stored research",
        sharpe: 1.2,
        cagr: 10,
        maxDD: -5,
        winRate: 60,
        active: true,
        lastTrade: "BUY",
      },
    ]);
  });

  it("seeds default strategies for a new user before returning them", async () => {
    deps.orderByGet
      .mockResolvedValueOnce({ empty: true, docs: [] })
      .mockResolvedValueOnce({
        empty: false,
        docs: [{ id: "seeded_1", data: () => storedStrategy }],
      });

    const res = await GET(new Request("http://test.local/api/strategies"));

    expect(res.status).toBe(200);
    expect(deps.batchSet).toHaveBeenCalledTimes(7);
    expect(deps.batchSet.mock.calls[0][1]).toMatchObject({
      userId: "user_123",
      name: "TQQQ Opening Range Breakout",
      active: true,
    });
    expect(deps.batchSet.mock.calls[1][1]).toMatchObject({
      name: "Markov Regime — SPY / QQQ / DIA",
      sharpe: 0.43,
    });
    expect(deps.batchCommit).toHaveBeenCalledTimes(1);
    await expect(res.json()).resolves.toEqual([
      expect.objectContaining({ id: "seeded_1", tickers: ["SPY"] }),
    ]);
  });
});

describe("POST /api/strategies", () => {
  it("creates a strategy with encoded Firestore JSON fields and returns decoded output", async () => {
    const body = {
      name: "Custom Strategy",
      tag: "Draft",
      desc: "My model",
      tickers: ["AAPL", "MSFT"],
      config: { mode: "custom" },
      research: "Research note",
      sharpe: 0.5,
      cagr: 8,
      maxDD: -12,
      winRate: 55,
    };

    const res = await POST(
      new Request("http://test.local/api/strategies", {
        method: "POST",
        body: JSON.stringify(body),
      })
    );

    expect(res.status).toBe(200);
    expect(deps.addStrategy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_123",
        name: "Custom Strategy",
        tickers: JSON.stringify(["AAPL", "MSFT"]),
        config: JSON.stringify({ mode: "custom" }),
        active: false,
        lastTrade: "—",
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      })
    );
    await expect(res.json()).resolves.toMatchObject({
      id: "new_strategy",
      name: "Custom Strategy",
      tickers: ["AAPL", "MSFT"],
      config: { mode: "custom" },
      active: false,
    });
  });
});
