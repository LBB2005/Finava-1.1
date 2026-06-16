import { describe, expect, it } from "vitest";
import {
  FACTORS,
  NEUTRAL_WEIGHTS,
  composite,
  factorClass,
  factorColor,
  fmtMktCap,
  fmtPE,
  fmtPct,
  fmtPct1,
  fmtPrice,
  fmtRvol,
  fmtVol,
  grade,
  gradeClass,
  movers,
  normalizedWeights,
  overlayLive,
  ranked,
  rankByWeights,
  topPicks,
  type Stock,
} from "./research";

const baseStock: Stock = {
  ticker: "AAA",
  name: "Alpha",
  sector: "Technology",
  price: 100,
  chg: 1.2,
  f: { mom: 100, growth: 80, quality: 60, analyst: 40, value: 20, health: 10 },
  mv: { week: 5, month: 10, year: 20 },
};

const valueStock: Stock = {
  ticker: "BBB",
  name: "Beta",
  sector: "Financials",
  price: 50,
  chg: -0.5,
  f: { mom: 10, growth: 20, quality: 30, analyst: 40, value: 100, health: 80 },
  mv: { week: -3, month: -6, year: -12 },
};

const balancedStock: Stock = {
  ticker: "CCC",
  name: "Core",
  sector: "Industrials",
  price: 75,
  chg: 0,
  f: { mom: 70, growth: 70, quality: 70, analyst: 70, value: 70, health: 70 },
  mv: { week: 1, month: 2, year: 3 },
};

const universe = [baseStock, valueStock, balancedStock];

describe("research scoring", () => {
  it("computes weighted composites and grades boundaries", () => {
    expect(composite(baseStock, "week")).toBe(65);
    expect(grade(95)).toBe("A+");
    expect(grade(85)).toBe("A");
    expect(grade(75)).toBe("B+");
    expect(grade(65)).toBe("B-");
    expect(grade(55)).toBe("C");
    expect(grade(45)).toBe("D+");
    expect(grade(39)).toBe("F");
    expect(gradeClass("A-")).toBe("grade-a");
    expect(gradeClass("F")).toBe("grade-f");
  });

  it("ranks stocks by horizon score with rank and grade attached", () => {
    expect(ranked("week", universe).map((s) => [s.ticker, s.rank, s.grade])).toEqual([
      ["CCC", 1, "B"],
      ["AAA", 2, "B-"],
      ["BBB", 3, "F"],
    ]);
  });

  it("selects distinct top picks across horizons", () => {
    const picks = topPicks(universe);

    expect(new Set(picks.map((p) => p.ticker)).size).toBe(3);
    expect(picks.map((p) => p.horizon.key)).toEqual(["week", "month", "year"]);
    expect(picks.every((p) => typeof p.take === "string" && p.take.length > 0)).toBe(true);
  });

  it("returns top gainers and losers for a move window", () => {
    expect(movers("week", universe)).toMatchObject({
      gainers: [
        { ticker: "AAA", move: 5 },
        { ticker: "CCC", move: 1 },
        { ticker: "BBB", move: -3 },
      ],
      losers: [
        { ticker: "BBB", move: -3 },
        { ticker: "CCC", move: 1 },
        { ticker: "AAA", move: 5 },
      ],
    });
  });

  it("normalizes user weights and falls back to even weights when all are non-positive", () => {
    expect(normalizedWeights({
      mom: 100,
      growth: 100,
      quality: 0,
      analyst: -10,
      value: 0,
      health: 0,
    })).toEqual({
      mom: 50,
      growth: 50,
      quality: 0,
      analyst: 0,
      value: 0,
      health: 0,
    });

    expect(rankByWeights({
      mom: 0,
      growth: 0,
      quality: 0,
      analyst: 0,
      value: 0,
      health: 0,
    }, universe)[0]).toMatchObject({ ticker: "CCC", score: 70, rank: 1 });

    expect(Object.keys(NEUTRAL_WEIGHTS)).toEqual(FACTORS.map((f) => f.key));
  });

  it("ranks by custom factor weights", () => {
    expect(rankByWeights({
      mom: 0,
      growth: 0,
      quality: 0,
      analyst: 0,
      value: 100,
      health: 0,
    }, universe).map((s) => s.ticker)).toEqual(["BBB", "CCC", "AAA"]);
  });
});

describe("research live overlay and presentation helpers", () => {
  it("overlays live quote rows without mutating the original universe", () => {
    const overlaid = overlayLive(
      universe,
      new Map([
        ["AAA", {
          ticker: "AAA",
          price: 111,
          changePct: null,
          marketCap: 1_250_000_000_000,
          pe: 32.4,
          avgVol: 25_000_000,
          rvol: 1.45,
        }],
      ])
    );

    expect(overlaid).not.toBe(universe);
    expect(overlaid[0]).toMatchObject({
      ticker: "AAA",
      price: 111,
      chg: 1.2,
      marketCap: 1_250_000_000_000,
      pe: 32.4,
      avgVol: 25_000_000,
      rvol: 1.45,
      live: true,
    });
    expect(universe[0].price).toBe(100);
    expect(overlayLive(universe, null)).toBe(universe);
  });

  it("classifies factor strength and colors", () => {
    expect(factorClass(80)).toBe("f-strong");
    expect(factorClass(50)).toBe("f-neutral");
    expect(factorClass(20)).toBe("f-weak");
    expect(factorColor(80)).toBe("var(--color-bull)");
    expect(factorColor(50)).toBe("var(--color-warn)");
    expect(factorColor(20)).toBe("var(--color-bear)");
  });

  it("formats prices, percentages, market data, and missing values", () => {
    expect(fmtPrice(1234.5)).toBe("$1,234.50");
    expect(fmtPct(1.234)).toBe("+1.23%");
    expect(fmtPct(-1.234)).toBe("-1.23%");
    expect(fmtPct1(1.26)).toBe("+1.3%");
    expect(fmtMktCap(5_110_000_000_000)).toBe("$5.11T");
    expect(fmtMktCap(612_300_000_000)).toBe("$612.3B");
    expect(fmtMktCap(84_600_000)).toBe("$84.6M");
    expect(fmtMktCap(null)).toBe("—");
    expect(fmtVol(181_300_000)).toBe("181.3M");
    expect(fmtVol(850_000)).toBe("850.0K");
    expect(fmtVol(null)).toBe("—");
    expect(fmtPE(18.24)).toBe("18.2");
    expect(fmtPE(-1)).toBe("—");
    expect(fmtRvol(1.456)).toBe("1.46×");
    expect(fmtRvol(null)).toBe("—");
  });
});
