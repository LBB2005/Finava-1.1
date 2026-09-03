import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({ getFactorUniverse: vi.fn() }));
vi.mock("@/lib/factorUniverse", () => ({ getFactorUniverse: deps.getFactorUniverse }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/research/factors", () => {
  it("returns the shared factor universe", async () => {
    const universe = [{ ticker: "AAPL", f: { mom: 70 } }];
    deps.getFactorUniverse.mockResolvedValueOnce(universe);

    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(universe);
  });

  it("takes no arguments — the memo lives in the lib, shared with the discovery scout", async () => {
    deps.getFactorUniverse.mockResolvedValueOnce([]);
    await GET();
    expect(deps.getFactorUniverse).toHaveBeenCalledWith();
  });

  it("500s (without leaking the cause) on an unexpected failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    deps.getFactorUniverse.mockRejectedValueOnce(new Error("polygon down"));

    const res = await GET();
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Failed to compute factor universe" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
