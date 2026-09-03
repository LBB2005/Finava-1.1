import { describe, expect, it } from "vitest";
import { compositeScore, scoreForTicker } from "./compositeScore";
import { WEIGHTS, type Stock } from "@/lib/research";

function stock(ticker: string, f: Partial<Stock["f"]> = {}): Stock {
  return {
    ticker,
    name: `${ticker} Inc.`,
    sector: "Technology",
    price: 100,
    chg: 0,
    f: { mom: 50, growth: 50, quality: 50, analyst: 50, value: 50, health: 50, ...f },
    mv: { week: 0, month: 0, year: 0 },
  } as Stock;
}

describe("compositeScore", () => {
  it("returns the flat factor value when every sub-score is equal (weights sum to 1)", () => {
    expect(compositeScore(stock("AAPL"))).toBe(50);
    expect(compositeScore(stock("AAPL"), "week")).toBe(50);
    expect(compositeScore(stock("AAPL"), "year")).toBe(50);
  });

  it("defaults to the month horizon", () => {
    const s = stock("AAPL", { mom: 100 });
    expect(compositeScore(s)).toBe(compositeScore(s, "month"));
  });

  it("weights momentum hardest on the week horizon and lightest on the year", () => {
    const momentumLeader = stock("AAPL", { mom: 100, growth: 0, quality: 0, analyst: 0, value: 0, health: 0 });
    expect(compositeScore(momentumLeader, "week")).toBe(Math.round(WEIGHTS.week.mom * 100));
    expect(compositeScore(momentumLeader, "year")).toBe(Math.round(WEIGHTS.year.mom * 100));
    expect(compositeScore(momentumLeader, "week")).toBeGreaterThan(
      compositeScore(momentumLeader, "year"),
    );
  });

  it("rounds to a whole number", () => {
    // month weights × these values give a fractional blend.
    const s = stock("AAPL", { mom: 71, growth: 63, quality: 58, analyst: 82, value: 44, health: 67 });
    const score = compositeScore(s);
    expect(Number.isInteger(score)).toBe(true);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("floors at 0 and tops out at 100 for the extreme factor sets", () => {
    const worst = stock("X", { mom: 0, growth: 0, quality: 0, analyst: 0, value: 0, health: 0 });
    const best = stock("Y", { mom: 100, growth: 100, quality: 100, analyst: 100, value: 100, health: 100 });
    expect(compositeScore(worst)).toBe(0);
    expect(compositeScore(best)).toBe(100);
  });
});

describe("scoreForTicker", () => {
  const universe = [stock("AAPL", { mom: 100 }), stock("MSFT")];

  it("finds the ticker and scores it", () => {
    expect(scoreForTicker(universe, "AAPL")).toBe(compositeScore(universe[0]));
  });

  it("uppercases the lookup", () => {
    expect(scoreForTicker(universe, "aapl")).toBe(compositeScore(universe[0]));
  });

  it("honours the horizon argument", () => {
    expect(scoreForTicker(universe, "AAPL", "week")).toBe(compositeScore(universe[0], "week"));
  });

  it("returns null — never a neutral 50 — for a ticker outside the universe", () => {
    expect(scoreForTicker(universe, "TSLA")).toBeNull();
  });

  it("returns null when the universe has not loaded", () => {
    expect(scoreForTicker(null, "AAPL")).toBeNull();
  });
});
