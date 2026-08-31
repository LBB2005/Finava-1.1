import { describe, expect, it } from "vitest";
import {
  checkEntry,
  checkExit,
  checkUniverse,
  checkShortConstraints,
  positionsNeedingTrim,
  evaluateDrawdown,
  checkInceptionEquity,
  checkSectorConcentration,
  sectorGroupFor,
  sectorCapFor,
  type BookState,
  type CandidateFacts,
} from "./mandate";
import { MANDATE_V1, type LivePosition } from "@/lib/schemas/live/snapshot";

const M = MANDATE_V1;

function position(
  ticker: string,
  weightPct: number,
  side: "long" | "short" = "long",
  sector: string | null = "Industrials"
): LivePosition {
  return {
    ticker,
    side,
    sector,
    qty: 10,
    avgEntryPrice: 100,
    currentPrice: 110,
    marketValue: 1100,
    costBasis: 1000,
    unrealizedPlPct: 10,
    weightPct,
    targetWeightPct: weightPct,
    openedByDecisionId: `d-${ticker}`,
    openedOn: "2026-09-08",
    dataGap: false,
  };
}

function book(over: Partial<BookState> = {}): BookState {
  return {
    equity: 10_000,
    cashPct: 20,
    positions: [position("AAPL", 8), position("MSFT", 8)],
    entriesToday: 0,
    entriesFrozen: false,
    ...over,
  };
}

function candidate(over: Partial<CandidateFacts> = {}): CandidateFacts {
  return {
    ticker: "NVDA",
    side: "long",
    sector: "Information Technology",
    marketCapUsd: 3_000_000_000_000,
    avgDollarVolumeUsd: 500_000_000,
    shortInterestPct: 1.2,
    daysToNextEarnings: 40,
    usListed: true,
    isLeveragedOrInverseEtf: false,
    isOption: false,
    ...over,
  };
}

/** Which rails failed, for concise assertions. */
function failed(checks: { rule: string; passed: boolean }[]): string[] {
  return checks.filter((c) => !c.passed).map((c) => c.rule);
}

describe("checkUniverse", () => {
  it("passes a large, liquid, US-listed common stock", () => {
    expect(failed(checkUniverse(M, candidate()))).toEqual([]);
  });

  it.each([
    ["non-US listing", { usListed: false }, "us_listed"],
    ["an option", { isOption: true }, "no_derivatives"],
    ["a leveraged ETF", { isLeveragedOrInverseEtf: true }, "no_leveraged_etf"],
    ["a sub-$2bn cap", { marketCapUsd: 1_900_000_000 }, "min_market_cap"],
    ["thin dollar volume", { avgDollarVolumeUsd: 9_000_000 }, "min_dollar_volume"],
  ])("rejects %s", (_label, over, rule) => {
    expect(failed(checkUniverse(M, candidate(over)))).toContain(rule);
  });

  it("blocks rather than passes when eligibility data is missing", () => {
    // The whole point: a rail that passes when it cannot see is not a rail.
    const f = failed(checkUniverse(M, candidate({ marketCapUsd: null, avgDollarVolumeUsd: null })));
    expect(f).toEqual(["min_market_cap", "min_dollar_volume"]);
  });

  it("accepts a name exactly on both floors", () => {
    expect(
      failed(
        checkUniverse(
          M,
          candidate({ marketCapUsd: M.minMarketCapUsd, avgDollarVolumeUsd: M.minAvgDollarVolumeUsd })
        )
      )
    ).toEqual([]);
  });
});

describe("checkEntry", () => {
  it("allows a clean entry at the requested weight", () => {
    const v = checkEntry(M, book(), candidate(), 6);
    expect(v.allowed).toBe(true);
    expect(v.allowedWeightPct).toBe(6);
  });

  it("clamps an oversized request to the entry cap instead of rejecting it", () => {
    const v = checkEntry(M, book(), candidate(), 20);
    expect(v.allowed).toBe(true);
    expect(v.allowedWeightPct).toBe(M.maxEntryWeightPct);
  });

  it("rejects a sub-floor request outright", () => {
    const v = checkEntry(M, book(), candidate(), 1.5);
    expect(v.allowed).toBe(false);
    expect(failed(v.checks)).toContain("min_weight");
    expect(v.allowedWeightPct).toBe(0);
  });

  it("accepts exactly the floor and exactly the cap", () => {
    expect(checkEntry(M, book(), candidate(), M.minWeightPct).allowed).toBe(true);
    const atCap = checkEntry(M, book(), candidate(), M.maxEntryWeightPct);
    expect(atCap.allowed).toBe(true);
    expect(atCap.allowedWeightPct).toBe(M.maxEntryWeightPct);
  });

  it("blocks a fourth entry once the daily cap is reached", () => {
    expect(checkEntry(M, book({ entriesToday: 2 }), candidate(), 6).allowed).toBe(true);
    const v = checkEntry(M, book({ entriesToday: 3 }), candidate(), 6);
    expect(failed(v.checks)).toContain("max_entries_per_day");
  });

  it("blocks entries while the drawdown rail is frozen", () => {
    const v = checkEntry(M, book({ entriesFrozen: true }), candidate(), 6);
    expect(failed(v.checks)).toContain("entries_not_frozen");
  });

  it("blocks a 16th position", () => {
    const full = Array.from({ length: 15 }, (_, i) => position(`T${i}`, 6));
    const v = checkEntry(M, book({ positions: full }), candidate(), 6);
    expect(failed(v.checks)).toContain("max_positions");
  });

  it("blocks a name already held — that would be an add, not an entry", () => {
    const v = checkEntry(M, book(), candidate({ ticker: "AAPL" }), 6);
    expect(failed(v.checks)).toContain("not_already_held");
  });

  it("enforces the earnings blackout on the boundary", () => {
    // blackout is 2 days: 2 is inside, 3 is clear.
    expect(failed(checkEntry(M, book(), candidate({ daysToNextEarnings: 2 }), 6).checks)).toContain(
      "earnings_blackout"
    );
    expect(checkEntry(M, book(), candidate({ daysToNextEarnings: 3 }), 6).allowed).toBe(true);
  });

  it("treats an unknown earnings date as clear", () => {
    // Unlike eligibility, no scheduled date genuinely means no blackout to serve.
    expect(checkEntry(M, book(), candidate({ daysToNextEarnings: null }), 6).allowed).toBe(true);
  });

  it("records every rail it evaluated, passed or failed", () => {
    const v = checkEntry(M, book(), candidate(), 6);
    expect(v.checks.map((c) => c.rule)).toEqual(
      expect.arrayContaining([
        "entries_not_frozen",
        "max_entries_per_day",
        "max_positions",
        "not_already_held",
        "min_weight",
        "earnings_blackout",
        "us_listed",
        "min_market_cap",
      ])
    );
  });
});

describe("checkShortConstraints", () => {
  const short = candidate({ side: "short", marketCapUsd: 20_000_000_000, shortInterestPct: 5 });

  it("returns nothing for a long candidate", () => {
    expect(checkShortConstraints(M, book(), candidate(), 6)).toEqual([]);
  });

  it("allows a compliant short", () => {
    expect(failed(checkShortConstraints(M, book(), short, 5))).toEqual([]);
  });

  it("blocks a fourth concurrent short", () => {
    const three = [
      position("A", -5, "short"),
      position("B", -5, "short"),
      position("C", -5, "short"),
    ];
    expect(failed(checkShortConstraints(M, book({ positions: three }), short, 5))).toContain(
      "max_concurrent_shorts"
    );
  });

  it("blocks an oversized single short", () => {
    expect(failed(checkShortConstraints(M, book(), short, 6))).toContain("max_short_weight");
  });

  it("blocks a short that would breach gross exposure", () => {
    const two = [position("A", -5, "short"), position("B", -5, "short")];
    // 10% gross + 5% = 15%, exactly the cap — allowed.
    expect(failed(checkShortConstraints(M, book({ positions: two }), short, 5))).not.toContain(
      "max_gross_short"
    );
    const heavy = [position("A", -5, "short"), position("B", -5.5, "short")];
    expect(failed(checkShortConstraints(M, book({ positions: heavy }), short, 5))).toContain(
      "max_gross_short"
    );
  });

  it("blocks a squeeze-prone or small-cap short", () => {
    expect(
      failed(checkShortConstraints(M, book(), candidate({ ...short, shortInterestPct: 25 }), 5))
    ).toContain("short_interest_ceiling");
    expect(
      failed(checkShortConstraints(M, book(), candidate({ ...short, marketCapUsd: 4e9 }), 5))
    ).toContain("short_min_market_cap");
  });

  it("blocks when squeeze risk is unverifiable", () => {
    expect(
      failed(checkShortConstraints(M, book(), candidate({ ...short, shortInterestPct: null }), 5))
    ).toContain("short_interest_ceiling");
  });

  it("applies short rails through checkEntry too", () => {
    const v = checkEntry(M, book(), candidate({ ...short, shortInterestPct: 30 }), 5);
    expect(v.allowed).toBe(false);
    expect(failed(v.checks)).toContain("short_interest_ceiling");
  });
});

describe("checkExit", () => {
  it("blocks a discretionary exit inside the minimum hold", () => {
    const v = checkExit(M, "reunderwrite", 2);
    expect(v.allowed).toBe(false);
    expect(failed(v.checks)).toContain("min_hold_days");
  });

  it("allows a discretionary exit once the minimum is served", () => {
    expect(checkExit(M, "reunderwrite", 3).allowed).toBe(true);
  });

  it.each(["invalidation", "risk_rail"] as const)(
    "lets %s override the minimum hold on day one",
    (reason) => {
      // The book must never be trapped in a position whose thesis is already dead.
      expect(checkExit(M, reason, 0).allowed).toBe(true);
    }
  );
});

describe("positionsNeedingTrim", () => {
  it("ignores positions inside the drift cap", () => {
    expect(positionsNeedingTrim(M, [position("AAPL", 17.9)])).toEqual([]);
  });

  it("trims a drifted winner back to the entry cap, not out of the book", () => {
    expect(positionsNeedingTrim(M, [position("NVDA", 21)])).toEqual([
      { ticker: "NVDA", weightPct: 21, trimToPct: M.maxEntryWeightPct },
    ]);
  });

  it("measures drift on absolute weight so shorts are covered", () => {
    expect(positionsNeedingTrim(M, [position("XYZ", -19, "short")])).toHaveLength(1);
  });
});

describe("evaluateDrawdown", () => {
  it("raises the high-water mark on a new high and reports no drawdown", () => {
    const d = evaluateDrawdown(M, 11_000, 10_500, 0);
    expect(d.highWaterMark).toBe(11_000);
    expect(d.drawdownPct).toBe(0);
    expect(d.frozen).toBe(false);
  });

  it("computes drawdown against the high-water mark, not against cost", () => {
    const d = evaluateDrawdown(M, 9_000, 10_000, 0);
    expect(d.drawdownPct).toBeCloseTo(10, 6);
    expect(d.frozen).toBe(false);
    expect(d.tripped).toBe(false);
  });

  it("trips exactly at the rail and freezes for the declared number of days", () => {
    const d = evaluateDrawdown(M, 8_500, 10_000, 0);
    expect(d.drawdownPct).toBeCloseTo(15, 6);
    expect(d.tripped).toBe(true);
    expect(d.frozen).toBe(true);
    expect(d.freezeDaysRemaining).toBe(M.drawdownFreezeDays);
  });

  it("counts the freeze down in trading days and clears it", () => {
    // Day 1 trips with 3 remaining; each later day decrements by one.
    const d1 = evaluateDrawdown(M, 8_500, 10_000, 0);
    expect(d1.freezeDaysRemaining).toBe(3);

    const d2 = evaluateDrawdown(M, 8_600, 10_000, d1.freezeDaysRemaining);
    expect(d2.freezeDaysRemaining).toBe(2);
    expect(d2.frozen).toBe(true);
    expect(d2.tripped).toBe(false); // only the first day owes a review

    const d3 = evaluateDrawdown(M, 8_700, 10_000, d2.freezeDaysRemaining);
    const d4 = evaluateDrawdown(M, 8_800, 10_000, d3.freezeDaysRemaining);
    expect(d4.freezeDaysRemaining).toBe(0);
    expect(d4.frozen).toBe(false);
  });

  it("re-trips once a freeze has fully cleared and the book is still under water", () => {
    let state = evaluateDrawdown(M, 8_500, 10_000, 0);
    for (let i = 0; i < 3; i++) {
      state = evaluateDrawdown(M, 8_400, 10_000, state.freezeDaysRemaining);
    }
    expect(state.frozen).toBe(true);
    expect(state.tripped).toBe(true);
  });

  it("does not divide by zero on an empty book", () => {
    const d = evaluateDrawdown(M, 0, 0, 0);
    expect(d.drawdownPct).toBe(0);
    expect(d.frozen).toBe(false);
  });
});

describe("checkInceptionEquity", () => {
  const m = { ...MANDATE_V1, startingEquity: 10_000 };

  it("accepts an exactly funded account", () => {
    expect(checkInceptionEquity(m, 10_000).matches).toBe(true);
  });

  it("tolerates trivial interest accrual", () => {
    // Failing a launch over $3 would be theatre.
    expect(checkInceptionEquity(m, 10_050).matches).toBe(true);
  });

  it("refuses the real mismatch this was written for", () => {
    // A $100k Alpaca paper account against a $10k declared mandate — caught on
    // the first real run, where it also reported a 900% return on day one.
    const r = checkInceptionEquity(m, 100_000);
    expect(r.matches).toBe(false);
    expect(Math.round(r.driftPct)).toBe(900);
  });

  it("refuses an underfunded account too", () => {
    expect(checkInceptionEquity(m, 5_000).matches).toBe(false);
  });

  it("refuses just outside the tolerance", () => {
    expect(checkInceptionEquity(m, 10_101).matches).toBe(false);
  });

  it("reports both figures so the operator can see which to change", () => {
    const r = checkInceptionEquity(m, 100_000);
    expect(r.declared).toBe(10_000);
    expect(r.actual).toBe(100_000);
  });
});

describe("sector concentration", () => {
  const tech = (t: string, w: number, sector: string) => position(t, w, "long", sector);

  it("groups Communication Services with Information Technology", () => {
    // Why the rail is written on groups and not raw GICS sectors: GOOGL and META
    // are Communication Services, so an Information-Technology-only cap would
    // have let a book hold 35% of one and 25% of the other — 60% in tech, under
    // a cap that looked like it was working.
    expect(sectorGroupFor(M, "Information Technology")).toBe("Technology");
    expect(sectorGroupFor(M, "Communication Services")).toBe("Technology");
  });

  it("leaves an ungrouped sector as its own bucket", () => {
    expect(sectorGroupFor(M, "Materials")).toBe("Materials");
  });

  it("returns null for an unknown sector", () => {
    expect(sectorGroupFor(M, null)).toBeNull();
  });

  it("applies the tech cap to the group and the default elsewhere", () => {
    expect(sectorCapFor(M, "Technology")).toBe(35);
    expect(sectorCapFor(M, "Materials")).toBe(25);
  });

  it("allows a tech entry up to the 35% group cap", () => {
    const b = book({
      positions: [
        tech("MSFT", 12, "Information Technology"),
        tech("GOOGL", 12, "Communication Services"),
      ],
    });
    const checks = checkSectorConcentration(M, b, candidate(), 11);
    expect(checks.find((c) => c.rule === "sector_concentration")?.passed).toBe(true);
  });

  it("refuses the tech entry that would breach 35%", () => {
    const b = book({
      positions: [
        tech("MSFT", 12, "Information Technology"),
        tech("GOOGL", 12, "Communication Services"),
      ],
    });
    const checks = checkSectorConcentration(M, b, candidate(), 12);
    expect(checks.find((c) => c.rule === "sector_concentration")?.passed).toBe(false);
  });

  it("counts BOTH tech sectors toward the same cap", () => {
    // The 24% already held is entirely Communication Services; a new Information
    // Technology name still sees it. That is the whole point of the grouping.
    const b = book({
      positions: [
        tech("GOOGL", 12, "Communication Services"),
        tech("META", 12, "Communication Services"),
      ],
    });
    const checks = checkSectorConcentration(M, b, candidate(), 12);
    expect(checks.find((c) => c.rule === "sector_concentration")?.passed).toBe(false);
  });

  it("holds non-tech sectors to 25%", () => {
    const b = book({
      positions: [tech("CF", 12, "Materials"), tech("NEM", 12, "Materials")],
    });
    const checks = checkSectorConcentration(M, b, candidate({ sector: "Materials" }), 5);
    expect(checks.find((c) => c.rule === "sector_concentration")?.passed).toBe(false);
  });

  it("refuses an entry whose sector could not be resolved", () => {
    // Compliance that cannot be verified is not compliance.
    const checks = checkSectorConcentration(M, book(), candidate({ sector: null }), 5);
    expect(checks.find((c) => c.rule === "sector_known")?.passed).toBe(false);
  });

  it("never forces a trim on sector drift — only single-name drift trims", () => {
    // Entry-only by design: a sector winner appreciating past its cap must not
    // trigger a sale, exactly as single-name drift does not.
    const b = book({ positions: [tech("MSFT", 20, "Information Technology")] });
    expect(positionsNeedingTrim(M, b.positions).map((t) => t.ticker)).toEqual(["MSFT"]);
  });

  it("blocks the breaching entry through checkEntry, not just the helper", () => {
    const b = book({
      positions: [
        tech("MSFT", 12, "Information Technology"),
        tech("GOOGL", 12, "Communication Services"),
        tech("META", 11, "Communication Services"),
      ],
    });
    const verdict = checkEntry(M, b, candidate(), 6);
    expect(verdict.allowed).toBe(false);
    expect(verdict.allowedWeightPct).toBe(0);
  });
});
