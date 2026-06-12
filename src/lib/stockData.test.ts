import { describe, it, expect } from "vitest";

import { runPooled } from "@/lib/stockData";

describe("runPooled", () => {
  it("never runs more than `limit` tasks at once", async () => {
    let active = 0;
    let peak = 0;
    const make = () => async () => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--; return active;
    };
    await runPooled([make(), make(), make(), make(), make(), make()], 2);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("returns results index-aligned and isolates failures to null", async () => {
    const tasks = [
      async () => 1,
      async () => { throw new Error("boom"); },
      async () => 3,
    ];
    const out = await runPooled(tasks, 2);
    expect(out).toEqual([1, null, 3]);
  });
});

import { insiderNetFlow } from "@/lib/stockData";

describe("insiderNetFlow", () => {
  const sharesOut = 12_000_000_000; // ~GOOGL scale

  it("routine modest selling lands near neutral, not bearish", () => {
    const trades = [
      { shares: -50_000 },
      { shares: -30_000 },
    ];
    const f = insiderNetFlow(trades, sharesOut);
    expect(f).not.toBeNull();
    expect(Math.abs(f!)).toBeLessThan(0.15);
  });

  it("heavy net buying is clearly bullish", () => {
    const trades = [
      { shares: 3_000_000 },
      { shares: 2_000_000 },
    ];
    const f = insiderNetFlow(trades, 50_000_000);
    expect(f!).toBeGreaterThan(0.3);
  });

  it("returns null when there are no trades", () => {
    expect(insiderNetFlow([], sharesOut)).toBeNull();
    expect(insiderNetFlow(null, sharesOut)).toBeNull();
  });
});
