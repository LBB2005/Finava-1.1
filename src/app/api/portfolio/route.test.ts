import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

// Exercises the real withRoute wrapper (auth + run-context + zod validate), so it
// also covers the run-context path added in M3.
const deps = vi.hoisted(() => {
  const holdings = new Map<string, Record<string, unknown>>();
  const col = {
    orderBy: () => col,
    get: async () => ({
      docs: [...holdings.entries()].map(([id, v]) => ({ id, ref: { id }, data: () => v })),
    }),
    doc: (ticker: string) => ({
      id: ticker,
      get: async () => ({ exists: holdings.has(ticker), id: ticker, data: () => holdings.get(ticker) }),
      set: async (v: Record<string, unknown>) => { holdings.set(ticker, v); },
      update: async (v: Record<string, unknown>) => { holdings.set(ticker, { ...holdings.get(ticker), ...v }); },
    }),
  };
  return {
    holdings,
    requireAuth: vi.fn(),
    deleteRefsInBatches: vi.fn(),
    db: { collection: () => ({ doc: () => ({ collection: () => col }) }) },
  };
});

vi.mock("@/lib/requireAuth", () => ({ requireAuth: deps.requireAuth }));
vi.mock("@/lib/firebase-admin", () => ({
  db: deps.db,
  serializeDoc: (id: string, data: Record<string, unknown>) => ({ id, ...data }),
  deleteRefsInBatches: deps.deleteRefsInBatches,
}));

import { GET, POST, DELETE } from "./route";

function req(body?: unknown) {
  return new Request("http://test.local/api/portfolio", {
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  deps.holdings.clear();
  deps.requireAuth.mockResolvedValue({ userId: "user_1" });
});

describe("/api/portfolio", () => {
  it("GET lists the user's holdings", async () => {
    deps.holdings.set("AAPL", { ticker: "AAPL", shares: 5 });
    const res = await GET(req());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([{ id: "AAPL", ticker: "AAPL", shares: 5 }]);
  });

  it("GET returns 401 when unauthenticated (via withRoute)", async () => {
    deps.requireAuth.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("POST creates a new holding (201)", async () => {
    const res = await POST(req({ ticker: "aapl", shares: 10, avgCost: 150 }));
    expect(res.status).toBe(201);
    expect(deps.holdings.get("AAPL")).toMatchObject({ ticker: "AAPL", shares: 10, avgCost: 150 });
  });

  it("POST upserts an existing holding", async () => {
    deps.holdings.set("AAPL", { ticker: "AAPL", shares: 1, avgCost: 100 });
    const res = await POST(req({ ticker: "AAPL", shares: 20, avgCost: 160 }));
    expect(res.status).toBe(201);
    expect(deps.holdings.get("AAPL")).toMatchObject({ shares: 20, avgCost: 160 });
  });

  it("POST 400s an invalid body (negative shares)", async () => {
    const res = await POST(req({ ticker: "AAPL", shares: -5, avgCost: 150 }));
    expect(res.status).toBe(400);
  });

  it("DELETE clears the book", async () => {
    deps.holdings.set("AAPL", { ticker: "AAPL" });
    const res = await DELETE(req());
    expect(res.status).toBe(200);
    expect(deps.deleteRefsInBatches).toHaveBeenCalled();
  });
});
