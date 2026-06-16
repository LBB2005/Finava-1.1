import { describe, expect, it } from "vitest";
import { applyScreen, coerceFilter, type ScreenFilter } from "./screen";
import type { Stock } from "./research";

const stock = (ticker: string, overrides: Partial<Stock> = {}): Stock => ({
  ticker,
  name: ticker,
  sector: "Information Technology",
  price: 100,
  chg: 0,
  f: { mom: 50, growth: 50, quality: 50, analyst: 50, value: 50, health: 50 },
  mv: { week: 0, month: 0, year: 0 },
  pe: 20,
  marketCap: 100_000_000_000,
  ...overrides,
});

const universe = [
  stock("AAPL", {
    sector: "Information Technology",
    price: 200,
    chg: 3,
    pe: 30,
    marketCap: 3_000_000_000_000,
    f: { mom: 90, growth: 80, quality: 95, analyst: 85, value: 40, health: 90 },
  }),
  stock("JPM", {
    sector: "Financials",
    price: 250,
    chg: -1,
    pe: 12,
    marketCap: 600_000_000_000,
    f: { mom: 65, growth: 45, quality: 80, analyst: 75, value: 80, health: 85 },
  }),
  stock("F", {
    sector: "Consumer Discretionary",
    price: 12,
    chg: -4,
    pe: 8,
    marketCap: 48_000_000_000,
    f: { mom: 30, growth: 20, quality: 35, analyst: 40, value: 95, health: 45 },
  }),
];

describe("applyScreen", () => {
  it("filters by factor bands, sectors, valuation, price, market cap, and move bounds", () => {
    const filter: ScreenFilter = {
      factors: { value: { min: 70 }, mom: { max: 70 } },
      sectors: ["financial"],
      maxPe: 15,
      minPe: 5,
      minPrice: 100,
      maxPrice: 300,
      minMarketCap: 100_000_000_000,
      maxMarketCap: 1_000_000_000_000,
      minChg: -2,
      maxChg: 1,
    };

    expect(applyScreen(universe, filter).map((s) => s.ticker)).toEqual(["JPM"]);
  });

  it("sorts by requested keys and applies positive limits", () => {
    expect(applyScreen(universe, { sort: { key: "chg", dir: "asc" }, limit: 2 }).map((s) => s.ticker))
      .toEqual(["F", "JPM"]);
    expect(applyScreen(universe, { sort: { key: "marketCap", dir: "desc" }, limit: 1 })[0])
      .toMatchObject({ ticker: "AAPL", rank: 1, grade: "A-" });
    expect(applyScreen(universe, { sort: { key: "value", dir: "desc" }, limit: -1 })).toHaveLength(3);
  });

  it("rejects missing P/E and market cap when filters require them", () => {
    const missing = [stock("NOPE", { pe: null, marketCap: null })];

    expect(applyScreen(missing, { maxPe: 20 })).toEqual([]);
    expect(applyScreen(missing, { minPe: 1 })).toEqual([]);
    expect(applyScreen(missing, { minMarketCap: 1 })).toEqual([]);
    expect(applyScreen(missing, { maxMarketCap: 1_000_000 })).toEqual([]);
  });
});

describe("coerceFilter", () => {
  it("sanitizes model-produced filters into safe shapes", () => {
    expect(coerceFilter({
      factors: {
        value: { min: 70, max: 95 },
        bogus: { min: 100 },
        mom: { min: "bad" },
      },
      sectors: [" Tech ", "", 12],
      maxPe: 20,
      minPe: Number.NaN,
      maxPrice: 100,
      minPrice: 5,
      minMarketCap: 1e9,
      maxMarketCap: 1e12,
      minChg: -2,
      maxChg: 5,
      limit: 250.4,
      sort: { key: "marketCap", dir: "asc" },
    })).toEqual({
      factors: { value: { min: 70, max: 95 } },
      sectors: [" Tech "],
      maxPe: 20,
      maxPrice: 100,
      minPrice: 5,
      minMarketCap: 1e9,
      maxMarketCap: 1e12,
      minChg: -2,
      maxChg: 5,
      limit: 100,
      sort: { key: "marketCap", dir: "asc" },
    });
  });

  it("drops invalid sort and clamps low limits to one", () => {
    expect(coerceFilter({ limit: -5, sort: { key: "wat", dir: "asc" } })).toEqual({
      limit: 1,
    });
    expect(coerceFilter(null)).toEqual({});
  });
});
