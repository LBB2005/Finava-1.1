import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const deps = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireEntitlement: vi.fn(),
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("@/lib/requireAuth", () => ({ requireAuth: deps.requireAuth }));
vi.mock("@/lib/entitlements", () => ({ requireEntitlement: deps.requireEntitlement }));
vi.mock("fs", () => ({
  default: { existsSync: deps.existsSync, readFileSync: deps.readFileSync },
  existsSync: deps.existsSync,
  readFileSync: deps.readFileSync,
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  deps.requireAuth.mockResolvedValue({ userId: "user_1" });
  deps.requireEntitlement.mockResolvedValue(null); // entitled (quantSuite)
});

describe("GET /api/bot", () => {
  it("passes through an auth error", async () => {
    deps.requireAuth.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the entitlement gate when the user lacks quantSuite", async () => {
    deps.requireEntitlement.mockResolvedValueOnce(
      NextResponse.json({ error: "entitlement_required" }, { status: 403 })
    );
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("503s when the bot status file does not exist", async () => {
    deps.existsSync.mockReturnValue(false);
    const res = await GET();
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ live: false });
  });

  it("returns live bot status when the file is present and valid", async () => {
    deps.existsSync.mockReturnValue(true);
    deps.readFileSync.mockReturnValue(JSON.stringify({ equity: 1000, regimes: { SPY: "bull" } }));
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ live: true, data: { equity: 1000 } });
  });

  it("500s when the status file is unreadable / malformed", async () => {
    deps.existsSync.mockReturnValue(true);
    deps.readFileSync.mockReturnValue("{ not valid json");
    const res = await GET();
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ live: false });
  });
});
