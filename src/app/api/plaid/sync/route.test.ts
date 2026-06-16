import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const deps = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  plaidConfigured: vi.fn(),
  itemsGet: vi.fn(),
  rebuildHoldings: vi.fn(),
  updateItem: vi.fn(),
}));

vi.mock("@/lib/requireAuth", () => ({ requireAuth: deps.requireAuth }));
vi.mock("@/lib/plaid", () => ({ plaidConfigured: deps.plaidConfigured }));
vi.mock("@/lib/plaidSync", () => ({ rebuildHoldings: deps.rebuildHoldings }));
vi.mock("@/lib/firebase-admin", () => ({
  db: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({ get: deps.itemsGet })),
      })),
    })),
  },
}));

import { POST } from "./route";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
  vi.clearAllMocks();
  deps.requireAuth.mockResolvedValue({ userId: "user_123" });
  deps.plaidConfigured.mockReturnValue(true);
  deps.itemsGet.mockResolvedValue({
    empty: false,
    size: 2,
    docs: [{ ref: { update: deps.updateItem } }, { ref: { update: deps.updateItem } }],
  });
  deps.rebuildHoldings.mockResolvedValue({ imported: 3, skipped: 1, cash: 2500 });
  deps.updateItem.mockResolvedValue(undefined);
});

describe("POST /api/plaid/sync", () => {
  it("gates auth/config, handles no items, syncs holdings, and records timestamps", async () => {
    deps.requireAuth.mockResolvedValueOnce({ error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) });
    expect((await POST()).status).toBe(401);
    deps.plaidConfigured.mockReturnValueOnce(false);
    expect((await POST()).status).toBe(503);
    deps.itemsGet.mockResolvedValueOnce({ empty: true, size: 0, docs: [] });
    await expect((await POST()).json()).resolves.toEqual({ ok: true, items: 0, imported: 0 });

    const res = await POST();
    expect(res.status).toBe(200);
    expect(deps.rebuildHoldings).toHaveBeenCalledWith("user_123");
    expect(deps.updateItem).toHaveBeenCalledWith({ lastSyncedAt: "2026-06-15T12:00:00.000Z" });
    await expect(res.json()).resolves.toEqual({
      ok: true,
      items: 2,
      imported: 3,
      skipped: 1,
      cash: 2500,
    });
  });

  it("returns 500 when Plaid sync throws", async () => {
    deps.rebuildHoldings.mockRejectedValueOnce({ response: { data: { error_code: "ITEM_LOGIN_REQUIRED" } } });
    expect((await POST()).status).toBe(500);
  });
});
