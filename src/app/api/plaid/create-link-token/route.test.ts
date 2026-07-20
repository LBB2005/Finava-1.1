import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const deps = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireEntitlement: vi.fn(),
  linkTokenCreate: vi.fn(),
  plaidConfigured: vi.fn(),
}));

vi.mock("@/lib/requireAuth", () => ({ requireAuth: deps.requireAuth }));
vi.mock("@/lib/entitlements", () => ({ requireEntitlement: deps.requireEntitlement }));
vi.mock("@/lib/plaid", () => ({
  plaidClient: { linkTokenCreate: deps.linkTokenCreate },
  plaidConfigured: deps.plaidConfigured,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  deps.requireAuth.mockResolvedValue({ userId: "user_1" });
  deps.requireEntitlement.mockResolvedValue(null); // entitled
  deps.plaidConfigured.mockReturnValue(true);
  deps.linkTokenCreate.mockResolvedValue({ data: { link_token: "link-sandbox-abc" } });
});

describe("POST /api/plaid/create-link-token", () => {
  it("passes through an auth error", async () => {
    deps.requireAuth.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await POST();
    expect(res.status).toBe(401);
    expect(deps.linkTokenCreate).not.toHaveBeenCalled();
  });

  it("returns the entitlement gate when not entitled", async () => {
    deps.requireEntitlement.mockResolvedValueOnce(
      NextResponse.json({ error: "entitlement_required" }, { status: 403 })
    );
    const res = await POST();
    expect(res.status).toBe(403);
  });

  it("503s when Plaid is not configured", async () => {
    deps.plaidConfigured.mockReturnValueOnce(false);
    const res = await POST();
    expect(res.status).toBe(503);
  });

  it("returns the link token on success, scoped to the user", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ link_token: "link-sandbox-abc" });
    expect(deps.linkTokenCreate).toHaveBeenCalledWith(
      expect.objectContaining({ user: { client_user_id: "user_1" } })
    );
  });

  it("500s when the Plaid call throws", async () => {
    deps.linkTokenCreate.mockRejectedValueOnce({ response: { data: { error_code: "X" } } });
    const res = await POST();
    expect(res.status).toBe(500);
  });
});
