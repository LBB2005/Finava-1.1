import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/firebase-admin", () => ({
  db: {
    collection: () => ({ doc: () => ({ get: deps.get }) }),
  },
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/health", () => {
  it("returns 200 ok when Firestore responds", async () => {
    deps.get.mockResolvedValueOnce({ exists: false });

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      status: "ok",
      checks: { firestore: "ok" },
    });
  });

  it("returns 503 degraded when Firestore is unreachable", async () => {
    deps.get.mockRejectedValueOnce(new Error("firestore down"));

    const res = await GET();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({
      status: "degraded",
      checks: { firestore: "error" },
    });
  });
});
