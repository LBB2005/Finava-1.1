import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const deps = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  plaidConfigured: vi.fn(),
  itemRemove: vi.fn(),
  itemsGet: vi.fn(),
  holdingsGet: vi.fn(),
  batchDelete: vi.fn(),
  batchUpdate: vi.fn(),
  batchCommit: vi.fn(),
}));

vi.mock("@/lib/requireAuth", () => ({ requireAuth: deps.requireAuth }));
vi.mock("@/lib/plaid", () => ({
  plaidConfigured: deps.plaidConfigured,
  plaidClient: { itemRemove: deps.itemRemove },
}));
vi.mock("@/lib/firebase-admin", () => ({
  db: {
    batch: vi.fn(() => ({ delete: deps.batchDelete, update: deps.batchUpdate, commit: deps.batchCommit })),
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn((name: string) => ({
          get: name === "plaidItems" ? deps.itemsGet : deps.holdingsGet,
        })),
      })),
    })),
  },
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  deps.requireAuth.mockResolvedValue({ userId: "user_123" });
  deps.plaidConfigured.mockReturnValue(true);
  deps.itemRemove.mockResolvedValue(undefined);
  deps.batchCommit.mockResolvedValue(undefined);
  deps.itemsGet.mockResolvedValue({
    docs: [
      { ref: { path: "item_1" }, data: () => ({ accessToken: "access_1" }) },
      { ref: { path: "item_2" }, data: () => ({}) },
    ],
  });
  deps.holdingsGet.mockResolvedValue({
    size: 2,
    docs: [
      { ref: { path: "holding_aapl" }, data: () => ({ source: "plaid" }) },
      { ref: { path: "holding_cash" }, data: () => ({ source: "manual" }) },
    ],
  });
});

describe("POST /api/plaid/disconnect", () => {
  it("removes Plaid items, converts Plaid holdings to manual, and tolerates itemRemove failures", async () => {
    deps.itemRemove.mockRejectedValueOnce(new Error("already removed"));

    const res = await POST();

    expect(res.status).toBe(200);
    expect(deps.itemRemove).toHaveBeenCalledWith({ access_token: "access_1" });
    expect(deps.batchDelete).toHaveBeenCalledWith({ path: "item_1" });
    expect(deps.batchDelete).toHaveBeenCalledWith({ path: "item_2" });
    expect(deps.batchUpdate).toHaveBeenCalledWith(
      { path: "holding_aapl" },
      expect.objectContaining({ source: "manual", updatedAt: expect.any(String) })
    );
    await expect(res.json()).resolves.toEqual({ ok: true, converted: 2 });
  });

  it("returns auth errors and handles Firestore failures", async () => {
    deps.requireAuth.mockResolvedValueOnce({ error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) });
    expect((await POST()).status).toBe(401);
    deps.itemsGet.mockRejectedValueOnce(new Error("down"));
    expect((await POST()).status).toBe(500);
  });
});
