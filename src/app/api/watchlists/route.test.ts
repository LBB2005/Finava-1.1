import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const deps = vi.hoisted(() => ({
  orderGet: vi.fn(),
  countGet: vi.fn(),
  add: vi.fn(),
  assertWatchlistQuota: vi.fn(),
  serializeDoc: vi.fn((id: string, data: Record<string, unknown>) => ({ id, ...data })),
}));

vi.mock("@/lib/withRoute", () => ({
  withRoute: vi.fn((_opts, handler) => async (req = new Request("http://localhost/api/watchlists")) => {
    const body = req.method === "POST" ? await req.json() : undefined;
    return handler({ req, userId: "user_123", body });
  }),
}));
vi.mock("@/lib/schemas/watchlist", () => ({
  CreateWatchlistSchema: {},
}));
vi.mock("@/lib/entitlements", () => ({
  assertWatchlistQuota: deps.assertWatchlistQuota,
}));
vi.mock("@/lib/firebase-admin", () => ({
  serializeDoc: deps.serializeDoc,
  db: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          orderBy: vi.fn(() => ({ get: deps.orderGet })),
          count: vi.fn(() => ({ get: deps.countGet })),
          add: deps.add,
        })),
      })),
    })),
  },
}));

import { GET, POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
  deps.orderGet.mockResolvedValue({
    docs: [
      { id: "watch_1", data: () => ({ name: "Core", tickers: ["AAPL"], createdAt: "a", updatedAt: "b" }) },
      { id: "watch_2", data: () => ({ name: "Empty", tickers: null, createdAt: "c", updatedAt: "d" }) },
    ],
  });
  deps.countGet.mockResolvedValue({ data: () => ({ count: 1 }) });
  deps.assertWatchlistQuota.mockResolvedValue(null);
  deps.add.mockResolvedValue({
    get: vi.fn().mockResolvedValue({
      id: "watch_new",
      data: () => ({
        name: "AI Basket",
        tickers: ["NVDA", "MSFT"],
        createdAt: "2026-06-15T12:00:00.000Z",
        updatedAt: "2026-06-15T12:00:00.000Z",
      }),
    }),
  });
});

describe("/api/watchlists", () => {
  it("lists the authenticated user's watchlists in created order", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([
      { id: "watch_1", name: "Core", tickers: ["AAPL"], createdAt: "a", updatedAt: "b" },
      { id: "watch_2", name: "Empty", tickers: [], createdAt: "c", updatedAt: "d" },
    ]);
  });

  it("enforces quota before creating a watchlist", async () => {
    const quota = NextResponse.json({ error: "Watchlist limit reached" }, { status: 403 });
    deps.assertWatchlistQuota.mockResolvedValueOnce(quota);

    const res = await POST(new Request("http://localhost/api/watchlists", {
      method: "POST",
      body: JSON.stringify({ name: "Blocked", tickers: ["AAPL"] }),
    }));

    expect(res.status).toBe(403);
    expect(deps.assertWatchlistQuota).toHaveBeenCalledWith("user_123", 1);
    expect(deps.add).not.toHaveBeenCalled();
  });

  it("creates a watchlist with server-owned metadata", async () => {
    const res = await POST(new Request("http://localhost/api/watchlists", {
      method: "POST",
      body: JSON.stringify({ name: "AI Basket", tickers: ["NVDA", "MSFT"] }),
    }));

    expect(res.status).toBe(200);
    expect(deps.add).toHaveBeenCalledWith({
      userId: "user_123",
      name: "AI Basket",
      tickers: ["NVDA", "MSFT"],
      createdAt: "2026-06-15T12:00:00.000Z",
      updatedAt: "2026-06-15T12:00:00.000Z",
    });
    await expect(res.json()).resolves.toEqual({
      id: "watch_new",
      name: "AI Basket",
      tickers: ["NVDA", "MSFT"],
      createdAt: "2026-06-15T12:00:00.000Z",
      updatedAt: "2026-06-15T12:00:00.000Z",
    });
  });
});
