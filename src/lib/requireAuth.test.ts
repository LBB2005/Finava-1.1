import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// requireAuth is the ONLY server-side authorization gate for every authed route
// (Firestore rules are deny-all, all access flows through the Admin SDK), so its
// branches are security-critical: the dev-bypass must be impossible in production,
// betaBlocked must fence off non-admins, and a bad/absent token must 401.

const deps = vi.hoisted(() => ({
  authHeader: null as string | null,
  verifyIdToken: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (name: string) => (name === "Authorization" ? deps.authHeader : null),
  })),
}));

vi.mock("@/lib/firebase-admin", () => ({
  adminAuth: { verifyIdToken: deps.verifyIdToken },
}));

import { requireAuth } from "./requireAuth";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  deps.authHeader = null;
  // Non-production by default so the dev-bypass branch is reachable unless a test
  // explicitly stubs production.
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requireAuth", () => {
  it("rejects a request with no Authorization header", async () => {
    deps.authHeader = null;

    const result = await requireAuth();

    expect(result.userId).toBeUndefined();
    expect(result.error?.status).toBe(401);
    expect(deps.verifyIdToken).not.toHaveBeenCalled();
  });

  it("rejects a malformed (non-Bearer) Authorization header", async () => {
    deps.authHeader = "Basic abc123";

    const result = await requireAuth();

    expect(result.error?.status).toBe(401);
    expect(deps.verifyIdToken).not.toHaveBeenCalled();
  });

  it("accepts the dev-bypass sentinel only outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    deps.authHeader = "Bearer dev-bypass";

    await expect(requireAuth()).resolves.toEqual({ userId: "dev-user" });
    // Bypass short-circuits before any token verification.
    expect(deps.verifyIdToken).not.toHaveBeenCalled();
  });

  it("does NOT honor the dev-bypass sentinel in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    deps.authHeader = "Bearer dev-bypass";
    // In production the sentinel falls through to real verification, which rejects it.
    deps.verifyIdToken.mockRejectedValueOnce(new Error("invalid token"));

    const result = await requireAuth();

    expect(result.userId).toBeUndefined();
    expect(result.error?.status).toBe(401);
    expect(deps.verifyIdToken).toHaveBeenCalledWith("dev-bypass");
  });

  it("returns the verified uid for a valid token when beta lockdown is off", async () => {
    deps.authHeader = "Bearer good-token";
    deps.verifyIdToken.mockResolvedValueOnce({ uid: "user_abc" });

    await expect(requireAuth()).resolves.toEqual({ userId: "user_abc" });
    expect(deps.verifyIdToken).toHaveBeenCalledWith("good-token");
  });

  it("401s when token verification throws", async () => {
    deps.authHeader = "Bearer expired-token";
    deps.verifyIdToken.mockRejectedValueOnce(new Error("token expired"));

    const result = await requireAuth();

    expect(result.error?.status).toBe(401);
    await expect(result.error?.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("403s a verified non-admin when BETA_ADMIN_ONLY is on", async () => {
    vi.stubEnv("BETA_ADMIN_ONLY", "1");
    vi.stubEnv("ADMIN_UIDS", " admin_1 , admin_2 ");
    deps.authHeader = "Bearer good-token";
    deps.verifyIdToken.mockResolvedValueOnce({ uid: "regular_user" });

    const result = await requireAuth();

    expect(result.userId).toBeUndefined();
    expect(result.error?.status).toBe(403);
    await expect(result.error?.json()).resolves.toEqual({ error: "Private beta" });
  });

  it("allows a verified admin (after trimming ADMIN_UIDS) when BETA_ADMIN_ONLY is on", async () => {
    vi.stubEnv("BETA_ADMIN_ONLY", "1");
    vi.stubEnv("ADMIN_UIDS", " admin_1 , admin_2 ");
    deps.authHeader = "Bearer good-token";
    deps.verifyIdToken.mockResolvedValueOnce({ uid: "admin_2" });

    await expect(requireAuth()).resolves.toEqual({ userId: "admin_2" });
  });
});
