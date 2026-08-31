import { describe, expect, it } from "vitest";
import { planWaves, mergeWaveEvidence, mergeWaves } from "./discoveryRun";
import { emptyEvidence, type ScoutPick, type WaveEvidence } from "./scoutTypes";

function pick(ticker: string, sector = "Tech"): ScoutPick {
  return {
    ticker,
    name: `${ticker} Inc`,
    sector,
    score: 70,
    grade: "B",
    fitRank: 1,
    f: { value: 50, growth: 50, quality: 50, mom: 50, health: 50, analyst: 50 },
    reason: "fits",
  };
}

function wave(index: number, valuation: WaveEvidence["valuation"]): WaveEvidence {
  return {
    waveIndex: index,
    tickers: Object.keys(valuation),
    valuationTickers: Object.keys(valuation),
    batch: { run_risk_agent: `risk ${index}` },
    valuation,
  };
}

describe("planWaves", () => {
  it("returns no waves for an empty shortlist", () => {
    expect(planWaves([])).toEqual([]);
  });

  it("puts a single pick in one wave", () => {
    const waves = planWaves([pick("AAPL")]);
    expect(waves).toHaveLength(1);
    expect(waves[0]).toMatchObject({
      tickers: ["AAPL"],
      valuationTickers: ["AAPL"],
      waveIndex: 0,
      totalWaves: 1,
    });
  });

  it("fills exactly one wave at WAVE_SIZE", () => {
    const waves = planWaves(["A", "B", "C", "D", "E"].map((t) => pick(t)));
    expect(waves).toHaveLength(1);
    expect(waves[0].tickers).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("spills the sixth pick into a second wave", () => {
    const waves = planWaves(["A", "B", "C", "D", "E", "F"].map((t) => pick(t)));
    expect(waves).toHaveLength(2);
    expect(waves[0].tickers).toEqual(["A", "B", "C", "D", "E"]);
    expect(waves[1].tickers).toEqual(["F"]);
    expect(waves.map((w) => w.waveIndex)).toEqual([0, 1]);
    expect(waves.every((w) => w.totalWaves === 2)).toBe(true);
  });

  it("chunks a deep shortlist of 13 into 3 waves", () => {
    const picks = Array.from({ length: 13 }, (_, i) => pick(`T${i}`));
    const waves = planWaves(picks);
    expect(waves.map((w) => w.tickers.length)).toEqual([5, 5, 3]);
    expect(waves.flatMap((w) => w.tickers)).toHaveLength(13);
  });

  it("takes the top VALUATION_PER_WAVE of each wave by fit order", () => {
    const waves = planWaves(["A", "B", "C", "D", "E", "F", "G"].map((t) => pick(t)));
    expect(waves[0].valuationTickers).toEqual(["A", "B", "C"]);
    // A short tail wave gets fewer than the cap, not padding.
    expect(waves[1].valuationTickers).toEqual(["F", "G"]);
  });

  it("dedupes sectors within a wave", () => {
    const waves = planWaves([
      pick("A", "Tech"),
      pick("B", "Tech"),
      pick("C", "Energy"),
    ]);
    expect(waves[0].sectors).toEqual(["Tech", "Energy"]);
  });
});

describe("mergeWaveEvidence", () => {
  it("appends the wave and does not mutate the input", () => {
    const base = emptyEvidence();
    const next = mergeWaveEvidence(base, wave(0, { AAPL: { dcf: "a" } }));
    expect(next.waves).toHaveLength(1);
    expect(base.waves).toHaveLength(0);
    expect(base.valuation).toEqual({});
  });

  it("merges per-agent valuation for a ticker seen in two waves", () => {
    const one = mergeWaveEvidence(emptyEvidence(), wave(0, { AAPL: { dcf: "first" } }));
    const two = mergeWaveEvidence(one, wave(1, { AAPL: { graham: "second" } }));
    expect(two.valuation.AAPL).toEqual({ dcf: "first", graham: "second" });
  });

  it("lets a later wave overwrite the same agent for the same ticker", () => {
    const one = mergeWaveEvidence(emptyEvidence(), wave(0, { AAPL: { dcf: "old" } }));
    const two = mergeWaveEvidence(one, wave(1, { AAPL: { dcf: "new" } }));
    expect(two.valuation.AAPL).toEqual({ dcf: "new" });
  });

  it("keeps tickers from different waves side by side", () => {
    const merged = mergeWaves([
      wave(0, { AAPL: { dcf: "a" } }),
      wave(1, { MSFT: { dcf: "m" } }),
    ]);
    expect(Object.keys(merged.valuation).sort()).toEqual(["AAPL", "MSFT"]);
    expect(merged.waves.map((w) => w.waveIndex)).toEqual([0, 1]);
  });

  it("folds an empty wave list to empty evidence", () => {
    expect(mergeWaves([])).toEqual(emptyEvidence());
  });
});
