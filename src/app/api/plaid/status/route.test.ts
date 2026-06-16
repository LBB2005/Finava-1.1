import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const deps = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  itemsGet: vi.fn(),
}));

vi.mock("@/lib/requireAuth", () => ({ requireAuth: deps.requireAuth }));
vi.mock("@/lib/firebase-admin", () => ({
  db: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({ get: deps.itemsGet })),
      })),
    })),
  },
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  deps.requireAuth.mockResolvedValue({ userId: "user_123" });
  deps.itemsGet.mockResolvedValue({
    docs: [
      { id: "item_1", data: () => ({ institutionName: "Robinhood", lastSyncedAt: "2026-06-01" }) },
      { id: "item_2", data: () => ({}) },
    ],
  });
});

describe("GET /api/plaid/status", () => {
  it("returns auth errors, connection summaries, and Firestore failures", async () => {
    deps.requireAuth.mockResolvedValueOnce({ error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) });
    expect((await GET()).status).toBe(401);

    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      connected: true,
      institutions: [
        { itemId: "item_1", name: "Robinhood", lastSyncedAt: "2026-06-01" },
        { itemId: "item_2", name: null, lastSyncedAt: null },
      ],
    });

    deps.itemsGet.mockRejectedValueOnce(new Error("down"));
    expect((await GET()).status).toBe(500);
  });
});
