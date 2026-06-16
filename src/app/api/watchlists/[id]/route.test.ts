import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  docGet: vi.fn(),
  docUpdate: vi.fn(),
  docDelete: vi.fn(),
  serializeDoc: vi.fn((id: string, data: Record<string, unknown>) => ({ id, ...data })),
}));

vi.mock("@/lib/withRoute", () => ({
  withRoute: vi.fn((_opts, handler) => async (
    req = new Request("http://localhost/api/watchlists/watch_1"),
    ctx = { params: Promise.resolve({ id: "watch_1" }) }
  ) => {
    const body = req.method === "PATCH" ? await req.json() : undefined;
    return handler({ req, userId: "user_123", body }, ctx);
  }),
}));
vi.mock("@/lib/schemas/watchlist", () => ({
  UpdateWatchlistSchema: {},
}));
vi.mock("@/lib/firebase-admin", () => ({
  serializeDoc: deps.serializeDoc,
  db: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          doc: vi.fn(() => ({
            get: deps.docGet,
            update: deps.docUpdate,
            delete: deps.docDelete,
          })),
        })),
      })),
    })),
  },
}));

import { DELETE, PATCH } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
  deps.docGet.mockResolvedValue({
    exists: true,
    id: "watch_1",
    data: () => ({
      name: "Core",
      tickers: ["AAPL", "MSFT"],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-06-15T12:00:00.000Z",
    }),
  });
  deps.docUpdate.mockResolvedValue(undefined);
  deps.docDelete.mockResolvedValue(undefined);
});

describe("/api/watchlists/[id]", () => {
  it("updates name and tickers only after confirming ownership document exists", async () => {
    deps.docGet
      .mockResolvedValueOnce({ exists: true })
      .mockResolvedValueOnce({
        exists: true,
        id: "watch_1",
        data: () => ({
          name: "Compounders",
          tickers: ["MSFT"],
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-06-15T12:00:00.000Z",
        }),
      });

    const res = await PATCH(new Request("http://localhost/api/watchlists/watch_1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Compounders", tickers: ["MSFT"] }),
    }), { params: Promise.resolve({ id: "watch_1" }) });

    expect(res.status).toBe(200);
    expect(deps.docUpdate).toHaveBeenCalledWith({
      updatedAt: "2026-06-15T12:00:00.000Z",
      name: "Compounders",
      tickers: ["MSFT"],
    });
    await expect(res.json()).resolves.toEqual({
      id: "watch_1",
      name: "Compounders",
      tickers: ["MSFT"],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-06-15T12:00:00.000Z",
    });
  });

  it("allows partial updates and returns not_found for missing watchlists", async () => {
    await PATCH(new Request("http://localhost/api/watchlists/watch_1", {
      method: "PATCH",
      body: JSON.stringify({ tickers: ["AAPL"] }),
    }), { params: Promise.resolve({ id: "watch_1" }) });

    expect(deps.docUpdate).toHaveBeenCalledWith({
      updatedAt: "2026-06-15T12:00:00.000Z",
      tickers: ["AAPL"],
    });

    deps.docGet.mockResolvedValueOnce({ exists: false });
    const res = await PATCH(new Request("http://localhost/api/watchlists/missing", {
      method: "PATCH",
      body: JSON.stringify({ name: "Missing" }),
    }), { params: Promise.resolve({ id: "missing" }) });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: { code: "not_found", message: "Watchlist not found" },
      message: "Watchlist not found",
    });
  });

  it("deletes existing watchlists and reports missing ids", async () => {
    const deleted = await DELETE(new Request("http://localhost/api/watchlists/watch_1", {
      method: "DELETE",
    }), { params: Promise.resolve({ id: "watch_1" }) });

    expect(deleted.status).toBe(200);
    expect(deps.docDelete).toHaveBeenCalled();
    await expect(deleted.json()).resolves.toEqual({ ok: true });

    deps.docGet.mockResolvedValueOnce({ exists: false });
    const missing = await DELETE(new Request("http://localhost/api/watchlists/missing", {
      method: "DELETE",
    }), { params: Promise.resolve({ id: "missing" }) });

    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toEqual({
      error: { code: "not_found", message: "Watchlist not found" },
      message: "Watchlist not found",
    });
  });
});
