import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const deps = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/requireAuth", () => ({ requireAuth: deps.requireAuth }));

import { requireAdmin } from "./requireAdmin";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requireAdmin", () => {
  it("passes through authentication errors", async () => {
    deps.requireAuth.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const result = await requireAdmin();

    expect(result.userId).toBeUndefined();
    expect(result.error?.status).toBe(401);
  });

  it("allows configured admins after trimming ADMIN_UIDS", async () => {
    vi.stubEnv("ADMIN_UIDS", " other-user, user_123 ");
    deps.requireAuth.mockResolvedValueOnce({ userId: "user_123" });

    await expect(requireAdmin()).resolves.toEqual({ userId: "user_123" });
  });

  it("allows the dev user outside production and blocks non-admins", async () => {
    deps.requireAuth.mockResolvedValueOnce({ userId: "dev-user" });
    await expect(requireAdmin()).resolves.toEqual({ userId: "dev-user" });

    deps.requireAuth.mockResolvedValueOnce({ userId: "regular-user" });
    const blocked = await requireAdmin();

    expect(blocked.error?.status).toBe(403);
    await expect(blocked.error?.json()).resolves.toEqual({ error: "Forbidden" });
  });
});
