import { describe, it, expect } from "vitest";
import {
  interp,
  scoreFactors,
  computeFinavaScore,
  blendFairValue,
  PILLAR_WEIGHTS,
  type ScoreInputs,
} from "@/lib/finavaScore";

describe("interp", () => {
  const curve: [number, number][] = [[-0.4, 18], [0, 55], [0.2, 72], [0.5, 88]];
  it("returns the anchor score at an exact anchor", () => {
    expect(interp(0, curve)).toBe(55);
    expect(interp(0.2, curve)).toBe(72);
  });
  it("interpolates linearly between anchors", () => {
    expect(interp(0.1, curve)).toBeCloseTo((55 + 72) / 2, 5);
  });
  it("clamps below the first and above the last anchor", () => {
    expect(interp(-1, curve)).toBe(18);
    expect(interp(99, curve)).toBe(88);
  });
  it("returns null for null/NaN input", () => {
    expect(interp(null, curve)).toBeNull();
    expect(interp(NaN, curve)).toBeNull();
  });
});

const EMPTY: ScoreInputs = {
  revenueYoY: null, epsYoY: null, revenueCagr3y: null,
  grossMargin: null, operatingMargin: null, netMargin: null,
  roe: null, roa: null, roic: null,
  debtToEquity: null, currentRatio: null, fcfConversion: null,
  price: null, dcfFair: null,
  peTTM: null, peerPe: null, psTTM: null, peerPs: null,
  ratingSkew: null, targetUpsidePct: null, estimateRevisionPct: null, earningsSurprisePct: null,
  trendVs200: null, ret3m: null, relStrength6m: null,
  newsSentiment: null, xSentiment: null,
  insiderFlow: null,
  beta: null, annualizedVol: null,
};

describe("scoreFactors", () => {
  it("overvalued name scores absoluteVal low", () => {
    const f = scoreFactors({ ...EMPTY, price: 357, dcfFair: 143 });
    const av = f.find((x) => x.key === "absoluteVal")!;
    expect(av.score).not.toBeNull();
    expect(av.score!).toBeLessThan(40);
  });
  it("strong margins score profitability high", () => {
    const f = scoreFactors({ ...EMPTY, grossMargin: 60, operatingMargin: 35, netMargin: 28 });
    const p = f.find((x) => x.key === "profitability")!;
    expect(p.score!).toBeGreaterThan(75);
  });
  it("routine insider selling lands near neutral", () => {
    const f = scoreFactors({ ...EMPTY, insiderFlow: -0.08 });
    const i = f.find((x) => x.key === "insiderFlow")!;
    expect(Math.abs(i.score! - 50)).toBeLessThan(12);
  });
  it("missing inputs yield null-scored factors (excluded downstream)", () => {
    const f = scoreFactors(EMPTY);
    expect(f.every((x) => x.score === null)).toBe(true);
  });
  it("rating skew maps -1->~10, 0->50, +1->~90", () => {
    const lo = scoreFactors({ ...EMPTY, ratingSkew: -1 }).find((x) => x.key === "rating")!;
    const mid = scoreFactors({ ...EMPTY, ratingSkew: 0 }).find((x) => x.key === "rating")!;
    const hi = scoreFactors({ ...EMPTY, ratingSkew: 1 }).find((x) => x.key === "rating")!;
    expect(lo.score!).toBeLessThan(20);
    expect(mid.score!).toBe(50);
    expect(hi.score!).toBeGreaterThan(80);
  });
  it("produces exactly 15 factors", () => {
    expect(scoreFactors(EMPTY).length).toBe(15);
  });
  it("excludes a negative P/E from relative valuation (no false-best score)", () => {
    // Loss-maker: peTTM < 0, no P/S → relativeVal must be null, never the 85 floor.
    const f = scoreFactors({ ...EMPTY, peTTM: -30, peerPe: 25 });
    const rv = f.find((x) => x.key === "relativeVal")!;
    expect(rv.score).toBeNull();
  });
});

const ALL_BULLISH: ScoreInputs = {
  ...EMPTY,
  revenueYoY: 0.3, epsYoY: 0.4, revenueCagr3y: 0.3,
  grossMargin: 65, operatingMargin: 38, netMargin: 30,
  roe: 35, roa: 18, roic: 28,
  debtToEquity: 0.2, currentRatio: 2.5, fcfConversion: 1.2,
  price: 100, dcfFair: 150, peTTM: 12, peerPe: 25, psTTM: 3, peerPs: 6,
  ratingSkew: 0.9, estimateRevisionPct: 0.08, earningsSurprisePct: 0.1,
  trendVs200: 0.25, ret3m: 0.3, relStrength6m: 0.3,
  newsSentiment: 80, xSentiment: 78, insiderFlow: 0.5, beta: 1, annualizedVol: 0.3,
};

const ALL_BEARISH: ScoreInputs = {
  ...EMPTY,
  revenueYoY: -0.1, epsYoY: -0.15, revenueCagr3y: 0,
  grossMargin: 10, operatingMargin: 0, netMargin: 0,
  roe: 5, roa: 1, roic: 4,
  debtToEquity: 3, currentRatio: 0.8, fcfConversion: 0.3,
  price: 357, dcfFair: 143, peTTM: 50, peerPe: 25, psTTM: 12, peerPs: 6,
  ratingSkew: -1, estimateRevisionPct: -0.1, earningsSurprisePct: -0.1,
  trendVs200: -0.2, ret3m: -0.25, relStrength6m: -0.25,
  newsSentiment: 20, xSentiment: 22, insiderFlow: -0.5, beta: 1, annualizedVol: 0.3,
};

describe("end-to-end calibration sanity", () => {
  it("a uniformly strong company scores high", () => {
    expect(computeFinavaScore(ALL_BULLISH).score).toBeGreaterThan(75);
  });
  it("a uniformly weak company scores low", () => {
    expect(computeFinavaScore(ALL_BEARISH).score).toBeLessThan(35);
  });
  it("full-coverage corroborating signals yield High confidence", () => {
    expect(computeFinavaScore(ALL_BULLISH).confidence).toBe("High");
  });
});

describe("computeFinavaScore", () => {
  it("pillar weights sum to 100", () => {
    const sum = Object.values(PILLAR_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 6);
  });
  it("excludes a dark pillar and reweights the rest (analyst missing)", () => {
    const noAnalyst = computeFinavaScore({
      ...EMPTY, netMargin: 25, roe: 22, revenueYoY: 0.12,
      price: 100, dcfFair: 120, peTTM: 18, peerPe: 20,
      ratingSkew: null, earningsSurprisePct: null,
      trendVs200: 0.1, ret3m: 0.08, relStrength6m: 0.05,
      newsSentiment: 62, xSentiment: 58, insiderFlow: 0.0,
    });
    const analystPillar = noAnalyst.pillars.find((p) => p.key === "analyst")!;
    expect(analystPillar.score).toBeNull();
    expect(noAnalyst.score).toBeGreaterThan(0);
    expect(noAnalyst.score).toBeLessThanOrEqual(100);
  });
  it("confidence drops when coverage is poor", () => {
    const thin = computeFinavaScore({ ...EMPTY, netMargin: 25 });
    expect(thin.confidence).toBe("Low");
  });
  it("returns 50 when no data at all", () => {
    expect(computeFinavaScore(EMPTY).score).toBe(50);
  });
});

describe("blendFairValue", () => {
  it("weights DCF and Street when both present", () => {
    expect(blendFairValue({ dcf: 140, street: 200 })).toBeCloseTo(140 * 0.5 + 200 * 0.5, 5);
  });
  it("falls back to whichever is present", () => {
    expect(blendFairValue({ dcf: 140, street: null })).toBe(140);
    expect(blendFairValue({ dcf: null, street: 200 })).toBe(200);
  });
  it("returns null when neither is present", () => {
    expect(blendFairValue({ dcf: null, street: null })).toBeNull();
  });
});
