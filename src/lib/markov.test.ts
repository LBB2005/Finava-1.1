import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clampPct,
  dominantRegime,
  isMarkovDataValid,
  normalizeRegime,
  parseMarkovOutput,
} from "./markov";

const output = `
[markov] fetched 1258 rows | 2021-06-01 -> 2026-06-01

       Bear    86.23%    13.77%     0.00%
   Sideways    8.00%    80.00%    12.00%
       Bull     0.00%     9.78%    90.22%

Stationary distribution
Bear: 21.81%
Sideways: 31.30%
Bull: 46.89%

Sharpe (annualised, walk-forward): 0.26
Max drawdown: -18.74%
Trades evaluated: 1190

HMM regime mean daily returns
Bear (lowest mean return)      state 2: -0.143% per day
Sideways                       state 0: +0.077% per day
Bull (highest mean return)     state 1: +0.093% per day
`;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
});

describe("parseMarkovOutput", () => {
  it("extracts transition matrices, stationaries, backtest, HMM, and allocation guidance", () => {
    expect(parseMarkovOutput(output, "SPY", 5)).toEqual({
      ticker: "SPY",
      years: 5,
      fetchedAt: "2026-06-15T12:00:00.000Z",
      rows: 1258,
      dateRange: { start: "2021-06-01", end: "2026-06-01" },
      transitionMatrix: {
        Bear: { Bear: 86.23, Sideways: 13.77, Bull: 0 },
        Sideways: { Bear: 8, Sideways: 80, Bull: 12 },
        Bull: { Bear: 0, Sideways: 9.78, Bull: 90.22 },
      },
      persistence: { Bear: 86.23, Sideways: 80, Bull: 90.22 },
      stationary: { Bear: 21.81, Sideways: 31.3, Bull: 46.89 },
      backtest: { sharpe: 0.26, maxDrawdown: -18.74, trades: 1190 },
      hmm: { Bear: -0.143, Sideways: 0.077, Bull: 0.093 },
      currentBias: "Bull",
      allocationRec: {
        equityPct: 74,
        label: "Fully Invested",
        rationale: expect.stringContaining("47% long-run Bull"),
      },
    });
  });

  it("returns zero/default fields for unparseable output and validates parsed signals", () => {
    const parsed = parseMarkovOutput("not the skill output", "QQQ", 10);

    expect(parsed.rows).toBe(0);
    expect(parsed.hmm).toBeNull();
    expect(parsed.currentBias).toBe("Sideways");
    expect(parsed.allocationRec.label).toBe("Defensive");
    expect(isMarkovDataValid(parsed)).toBe(false);
    expect(isMarkovDataValid(parseMarkovOutput(output, "SPY", 5))).toBe(true);
  });
});

describe("regime helpers", () => {
  it("clamps, normalizes, and labels regime percentages", () => {
    expect(clampPct(120)).toBe(100);
    expect(clampPct(-5)).toBe(0);
    expect(clampPct(Number.NaN)).toBe(0);
    expect(normalizeRegime(20, 30, 50)).toEqual({ bear: 20, sideways: 30, bull: 50 });
    expect(normalizeRegime(-1, 0, 0)).toEqual({ bear: 0, sideways: 0, bull: 0 });
    expect(dominantRegime({ bear: 20, sideways: 30, bull: 50 })).toBe("Bull");
    expect(dominantRegime({ bear: 50, sideways: 50, bull: 10 })).toBe("Bear");
    expect(dominantRegime({ bear: 10, sideways: 40, bull: 30 })).toBe("Sideways");
  });
});
