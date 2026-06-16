import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const deps = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getUsageSummary: vi.fn(),
}));

vi.mock("@/lib/requireAuth", () => ({
  requireAuth: deps.requireAuth,
}));

vi.mock("@/lib/usage", () => ({
  getUsageSummary: deps.getUsageSummary,
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  deps.requireAuth.mockResolvedValue({ userId: "user_123" });
  deps.getUsageSummary.mockResolvedValue({
    plan: "Pro",
    used: 12,
    limit: 100,
    remaining: 88,
  });
});

describe("GET /api/usage", () => {
  it("short-circuits when auth fails", async () => {
    deps.requireAuth.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await GET();

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(deps.getUsageSummary).not.toHaveBeenCalled();
  });

  it("returns the quota summary for the authenticated user", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    expect(deps.getUsageSummary).toHaveBeenCalledWith("user_123");
    await expect(res.json()).resolves.toEqual({
      plan: "Pro",
      used: 12,
      limit: 100,
      remaining: 88,
    });
  });

  it("returns a stable 500 shape when usage lookup fails", async () => {
    deps.getUsageSummary.mockRejectedValueOnce(new Error("firestore down"));

    const res = await GET();

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Failed to load usage" });
  });
});
