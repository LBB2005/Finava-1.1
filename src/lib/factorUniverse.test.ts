import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  computeFactorUniverse: vi.fn(),
}));

vi.mock("@/lib/factors", () => ({
  computeFactorUniverse: deps.computeFactorUniverse,
}));

async function loadModule() {
  vi.resetModules();
  return import("./factorUniverse");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
  delete (globalThis as typeof globalThis & { __factorUniverse?: unknown }).__factorUniverse;
  delete (globalThis as typeof globalThis & { __factorUniverseInflight?: unknown }).__factorUniverseInflight;
  vi.clearAllMocks();
  deps.computeFactorUniverse.mockResolvedValue([{ ticker: "AAPL" }]);
});

describe("getFactorUniverse", () => {
  it("computes once, serves warm cache, and refreshes after TTL", async () => {
    const { getFactorUniverse } = await loadModule();

    await expect(getFactorUniverse()).resolves.toEqual([{ ticker: "AAPL" }]);
    await expect(getFactorUniverse()).resolves.toEqual([{ ticker: "AAPL" }]);
    expect(deps.computeFactorUniverse).toHaveBeenCalledTimes(1);

    deps.computeFactorUniverse.mockResolvedValueOnce([{ ticker: "MSFT" }]);
    vi.setSystemTime(new Date("2026-06-15T12:16:00.000Z"));
    await expect(getFactorUniverse()).resolves.toEqual([{ ticker: "MSFT" }]);
    expect(deps.computeFactorUniverse).toHaveBeenCalledTimes(2);
  });

  it("collapses concurrent cold requests onto one inflight compute", async () => {
    let resolve!: (v: unknown) => void;
    deps.computeFactorUniverse.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const { getFactorUniverse } = await loadModule();

    const a = getFactorUniverse();
    const b = getFactorUniverse();
    resolve([{ ticker: "NVDA" }]);

    await expect(Promise.all([a, b])).resolves.toEqual([
      [{ ticker: "NVDA" }],
      [{ ticker: "NVDA" }],
    ]);
    expect(deps.computeFactorUniverse).toHaveBeenCalledTimes(1);
  });
});
