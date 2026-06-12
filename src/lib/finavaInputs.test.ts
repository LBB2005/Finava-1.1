import { describe, it, expect } from "vitest";
import { metricsToFundamentalInputs, surpriseAvg, ratingSkew, computeRelStrength } from "@/lib/finavaInputs";

describe("metricsToFundamentalInputs", () => {
  it("maps Finnhub metric fields to the right ScoreInputs shape", () => {
    const m = {
      roeTTM: 146.69, roaTTM: 34.02,
      grossMarginTTM: 47.86, operatingMarginTTM: 32.64, netProfitMarginTTM: 27.15,
      "totalDebt/totalEquityQuarterly": 0.7955, currentRatioQuarterly: 1.0704,
      revenueGrowthTTMYoy: 12.76, epsGrowthTTMYoy: 29.01,
      peTTM: 35.55, psTTM: 9.65, beta: 1.2,
    } as Record<string, number>;
    const out = metricsToFundamentalInputs(m);
    expect(out.roe).toBeCloseTo(146.69);
    expect(out.roic).toBeNull();                 // missing field → null
    expect(out.revenueYoY).toBeCloseTo(0.1276);  // percent → fraction
    expect(out.debtToEquity).toBeCloseTo(0.7955);
    expect(out.peTTM).toBeCloseTo(35.55);
    expect(out.beta).toBeCloseTo(1.2);
  });
});

describe("surpriseAvg", () => {
  it("averages percent surprise across the recent earnings list", () => {
    const rows = [{ actual: 1.1, estimate: 1.0 }, { actual: 0.9, estimate: 1.0 }];
    expect(surpriseAvg(rows)).toBeCloseTo(0, 5);
  });
  it("returns null on empty/garbage", () => {
    expect(surpriseAvg([])).toBeNull();
    expect(surpriseAvg(null)).toBeNull();
  });
});

describe("ratingSkew", () => {
  it("maps an all-strong-buy book toward +1 and all-sell toward -1", () => {
    expect(ratingSkew([{ strongBuy: 10, buy: 0, hold: 0, sell: 0, strongSell: 0 }])!).toBeCloseTo(1);
    expect(ratingSkew([{ strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 10 }])!).toBeCloseTo(-1);
    expect(ratingSkew([{ strongBuy: 0, buy: 0, hold: 10, sell: 0, strongSell: 0 }])!).toBeCloseTo(0);
  });
  it("returns null with no ratings", () => {
    expect(ratingSkew([])).toBeNull();
    expect(ratingSkew(null)).toBeNull();
  });
});

describe("computeRelStrength", () => {
  it("is positive when the stock outran the benchmark over the window", () => {
    const stock = Array.from({ length: 130 }, (_, k) => 100 + k);
    const bench = Array.from({ length: 130 }, (_, k) => 100 + k * 0.5);
    expect(computeRelStrength(stock, bench)!).toBeGreaterThan(0);
  });
  it("returns null with too few points", () => {
    expect(computeRelStrength([100], [100])).toBeNull();
  });
});
