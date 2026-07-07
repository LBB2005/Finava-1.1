import { describe, expect, it } from "vitest";
import { computeInvestorDna, lensLineFor, normalizeTicker, type DnaHolding } from "./investorDna";
import type { FactorScores, Stock } from "./research";

function stock(ticker: string, price: number, f: Partial<FactorScores>, sector = "Technology"): Stock {
  return {
    ticker,
    name: ticker,
    sector,
    price,
    chg: 0,
    f: { mom: 50, growth: 50, quality: 50, analyst: 50, value: 50, health: 50, ...f },
    mv: { week: 0, month: 0, year: 0 },
  };
}

describe("computeInvestorDna", () => {
  it("returns null when there are no holdings", () => {
    expect(computeInvestorDna([], [stock("AAA", 100, {})])).toBeNull();
  });

  it("returns null when no holding matches the universe", () => {
    const holdings: DnaHolding[] = [{ ticker: "ZZZ", shares: 5, avgCost: 10 }];
    expect(computeInvestorDna(holdings, [stock("AAA", 100, {})])).toBeNull();
  });

  it("computes a market-value-weighted dna vector", () => {
    const univ = [stock("AAA", 100, { mom: 100 }), stock("BBB", 100, { mom: 0 })];
    const holdings: DnaHolding[] = [
      { ticker: "AAA", shares: 1, avgCost: 100 }, // value 100
      { ticker: "BBB", shares: 3, avgCost: 100 }, // value 300
    ];
    const dna = computeInvestorDna(holdings, univ)!;
    expect(dna.dnaVector.mom).toBe(25); // (100*100 + 300*0) / 400
    expect(dna.dnaVector.growth).toBe(50); // both 50
    expect(dna.holdingsCount).toBe(2);
  });

  it("computes a real value-weighted track record per factor", () => {
    const univ = [
      stock("M1", 100, { mom: 80 }),
      stock("M2", 100, { mom: 80 }),
      stock("M3", 100, { mom: 80 }),
    ];
    const holdings: DnaHolding[] = [
      { ticker: "M1", shares: 1, avgCost: 50 }, // +100%, value 100
      { ticker: "M2", shares: 1, avgCost: 100 }, // 0%,   value 100
      { ticker: "M3", shares: 2, avgCost: 200 }, // -50%, value 200
    ];
    const dna = computeInvestorDna(holdings, univ)!;
    const mom = dna.traitRecord.find((t) => t.factor === "mom")!;
    expect(mom.total).toBe(3);
    expect(mom.sample).toBe("real");
    expect(mom.hits).toBe(1);
    expect(mom.avgReturnPct).toBe(0); // (100*100 + 100*0 + 200*-50) / 400
    expect(mom.exposurePct).toBe(100);
  });

  it("flags thin samples and keeps knownness low for a single holding", () => {
    const univ = [stock("ONE", 100, { quality: 90, health: 90 })];
    const holdings: DnaHolding[] = [{ ticker: "ONE", shares: 1, avgCost: 80 }]; // +25%
    const dna = computeInvestorDna(holdings, univ)!;
    const q = dna.traitRecord.find((t) => t.factor === "quality")!;
    expect(q.sample).toBe("thin");
    expect(q.total).toBe(1);
    expect(dna.knownness).toBeLessThan(20);
  });

  it("names a quality compounder when quality + health dominate", () => {
    const univ = [stock("QC", 100, { quality: 95, health: 90, mom: 30 })];
    const dna = computeInvestorDna([{ ticker: "QC", shares: 10, avgCost: 90 }], univ)!;
    expect(dna.archetype).toBe("Quality compounder");
  });

  it("writes an edge into the identity line when a winning bucket exists", () => {
    const univ = [stock("W1", 100, { mom: 80 }), stock("W2", 100, { mom: 80 })];
    const holdings: DnaHolding[] = [
      { ticker: "W1", shares: 1, avgCost: 50 }, // +100%
      { ticker: "W2", shares: 1, avgCost: 60 }, // +66%
    ];
    const dna = computeInvestorDna(holdings, univ)!;
    expect(dna.identityLine.toLowerCase()).toContain("edge in momentum");
  });

  it("says it is still learning when there is no winning bucket", () => {
    const univ = [stock("D1", 100, { value: 80 }), stock("D2", 100, { value: 80 })];
    const holdings: DnaHolding[] = [
      { ticker: "D1", shares: 1, avgCost: 200 }, // -50%
      { ticker: "D2", shares: 1, avgCost: 300 }, // -67%
    ];
    const dna = computeInvestorDna(holdings, univ)!;
    expect(dna.identityLine.toLowerCase()).toContain("still learning");
  });

  it("skips holdings absent from the universe but keeps matched ones", () => {
    const univ = [stock("AAA", 100, { mom: 100 })];
    const holdings: DnaHolding[] = [
      { ticker: "AAA", shares: 1, avgCost: 100 },
      { ticker: "ZZZ", shares: 5, avgCost: 10 }, // not in universe
    ];
    const dna = computeInvestorDna(holdings, univ)!;
    expect(dna.holdingsCount).toBe(1);
    expect(dna.dnaVector.mom).toBe(100);
  });

  it("raises knownness with more holdings and convictions", () => {
    const univ = Array.from({ length: 12 }, (_, i) => stock(`T${i}`, 100, {}, `Sector${i % 6}`));
    const many: DnaHolding[] = univ.map((s) => ({ ticker: s.ticker, shares: 1, avgCost: 100 }));
    const low = computeInvestorDna(many.slice(0, 2), univ, 0)!;
    const high = computeInvestorDna(many, univ, 10)!;
    expect(high.knownness).toBeGreaterThan(low.knownness);
    expect(high.knownness).toBeLessThanOrEqual(100);
  });
});

describe("lensLineFor", () => {
  const winUniv = [stock("W1", 100, { mom: 80 }), stock("W2", 100, { mom: 80 })];
  const winDna = computeInvestorDna(
    [
      { ticker: "W1", shares: 1, avgCost: 50 }, // +100%
      { ticker: "W2", shares: 1, avgCost: 60 }, // +66%
    ],
    winUniv,
  )!;

  it("surfaces a conviction thesis when one exists (even without DNA)", () => {
    const res = lensLineFor(null, null, { thesisTrait: "post-hype reset", status: "playing_out", outcomePct: 11 });
    expect(res?.line).toContain("Your thesis: post-hype reset");
    expect(res?.tone).toBe("edge");
  });

  it("calls a stock the user's sweet spot when it matches a winning trait", () => {
    const res = lensLineFor(winDna, stock("HOT", 100, { mom: 95 }));
    expect(res?.tone).toBe("edge");
    expect(res?.line.toLowerCase()).toContain("sweet spot");
  });

  it("warns when a stock matches a losing trait", () => {
    const loseUniv = [stock("L1", 100, { value: 85 }), stock("L2", 100, { value: 85 })];
    const loseDna = computeInvestorDna(
      [
        { ticker: "L1", shares: 1, avgCost: 200 }, // -50%
        { ticker: "L2", shares: 1, avgCost: 300 }, // -67%
      ],
      loseUniv,
    )!;
    const res = lensLineFor(loseDna, stock("CHEAP", 100, { value: 95 }));
    expect(res?.tone).toBe("caution");
    expect(res?.line.toLowerCase()).toContain("cost you");
  });

  it("returns null when there is nothing personal to say", () => {
    expect(lensLineFor(null, null, null)).toBeNull();
  });
});

describe("normalizeTicker", () => {
  it("strips punctuation so class shares match", () => {
    expect(normalizeTicker("BRK.B")).toBe("BRKB");
    expect(normalizeTicker("BRK-B")).toBe("BRKB");
    expect(normalizeTicker("brkb")).toBe("BRKB");
  });
});

describe("computeInvestorDna — coverage + ETFs", () => {
  it("matches holdings to the universe across symbology variants", () => {
    const univ = [stock("BRK.B", 100, { value: 90 })];
    const dna = computeInvestorDna([{ ticker: "BRK-B", shares: 1, avgCost: 50 }], univ)!;
    expect(dna.holdingsCount).toBe(1);
    expect(dna.coverage.uncovered).toEqual([]);
  });

  it("uses ETF profiles for tilt but excludes them from the track record", () => {
    const univ = [stock("AAPL", 100, { quality: 90 })];
    const etf = {
      VOO: { sector: "Broad market ETF", f: { mom: 60, growth: 90, quality: 50, analyst: 50, value: 40, health: 50 } },
    };
    const holdings: DnaHolding[] = [
      { ticker: "AAPL", shares: 1, avgCost: 50 }, // real stock, +100%
      { ticker: "VOO", shares: 10, avgCost: 10 }, // ETF tilt only
    ];
    const dna = computeInvestorDna(holdings, univ, 0, etf)!;
    expect(dna.coverage.analyzed).toBe(2);
    expect(dna.traitRecord.find((t) => t.factor === "growth")).toBeUndefined(); // ETF doesn't fabricate a bucket
    expect(dna.dnaVector.growth).toBeGreaterThan(50); // but it pulls the tilt vector up
  });

  it("lists uncovered tickers and still derives from what's covered", () => {
    const univ = [stock("AAPL", 100, { quality: 90 })];
    const holdings: DnaHolding[] = [
      { ticker: "AAPL", shares: 1, avgCost: 50 },
      { ticker: "BTC", shares: 1, avgCost: 1 },
      { ticker: "TLT", shares: 1, avgCost: 1 },
    ];
    const dna = computeInvestorDna(holdings, univ)!;
    expect(dna.coverage.analyzed).toBe(1);
    expect(dna.coverage.total).toBe(3);
    expect(dna.coverage.uncovered).toEqual(["BTC", "TLT"]);
  });

  it("returns null when nothing is covered", () => {
    const univ = [stock("AAPL", 100, {})];
    expect(computeInvestorDna([{ ticker: "BTC", shares: 1, avgCost: 1 }], univ)).toBeNull();
  });
});
