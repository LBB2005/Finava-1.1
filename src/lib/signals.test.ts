import { describe, expect, it } from "vitest";
import { deriveSignals } from "./signals";
import type { Stock } from "./research";

const stock = (ticker: string, overrides: Partial<Stock> = {}): Stock => ({
  ticker,
  name: ticker,
  sector: "Technology",
  price: 100,
  chg: 0,
  f: { mom: 50, growth: 50, quality: 50, analyst: 50, value: 50, health: 50 },
  mv: { week: 0, month: 0, year: 0 },
  live: true,
  ...overrides,
});

describe("deriveSignals", () => {
  it("derives deduped, priority-ordered signals from live market rows", () => {
    const universe = [
      stock("MOVE", { chg: 6, f: { mom: 90, growth: 70, quality: 50, analyst: 40, value: 30, health: 50 } }),
      stock("VOL", { chg: -1, rvol: 2.4 }),
      stock("BREAK", { chg: 1, f: { mom: 95, growth: 85, quality: 60, analyst: 60, value: 35, health: 60 } }),
      stock("ANALYST", { f: { mom: 40, growth: 50, quality: 50, analyst: 92, value: 55, health: 50 } }),
      stock("VALUE", { f: { mom: 35, growth: 20, quality: 40, analyst: 40, value: 96, health: 50 } }),
      stock("GRADE", { f: { mom: 40, growth: 50, quality: 94, analyst: 70, value: 50, health: 90 } }),
    ];

    const signals = deriveSignals(universe, 10);

    expect(signals.map((s) => s.ticker)).toEqual(["VOL", "MOVE", "BREAK", "ANALYST", "VALUE", "GRADE"]);
    expect(signals).toEqual([
      expect.objectContaining({ ticker: "VOL", category: "volume", fact: "relative volume 2.4× the 10-day average, -1.0% today", lean: -0.4 }),
      expect.objectContaining({ ticker: "MOVE", category: "mover", fact: "+6.0% today; momentum score 90/100", lean: 0.6 }),
      expect.objectContaining({ ticker: "BREAK", category: "breakout", lean: 0.7 }),
      expect.objectContaining({ ticker: "ANALYST", category: "analyst", lean: 0.5 }),
      expect.objectContaining({ ticker: "VALUE", category: "value", lean: -0.1 }),
      expect.objectContaining({ ticker: "GRADE", category: "grade", lean: 0.3 }),
    ]);
  });

  it("falls back to the full universe when too few rows are live and caps output", () => {
    const universe = [
      stock("A", { live: false, chg: 5 }),
      stock("B", { live: false, chg: -4 }),
      stock("C", { live: false, rvol: 2 }),
    ];

    expect(deriveSignals(universe, 2).map((s) => s.ticker)).toEqual(["C", "A"]);
  });
});
