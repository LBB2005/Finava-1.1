import { describe, it, expect } from "vitest";
import { scoreProvenance, summariseProvenance, type ProvenanceGap } from "./provenance";
import type { FactStamp } from "./asOf";

const AS_OF = "2026-09-02T13:15:00.000Z";

function stamp(field: string, standing: FactStamp["standing"]): FactStamp {
  return {
    field,
    source: "finnhub_basic_financials",
    observedAt: AS_OF,
    sourceAsOf: standing === "undated" ? null : AS_OF,
    standing,
  };
}

describe("scoreProvenance", () => {
  it("counts each standing", () => {
    const s = scoreProvenance([
      stamp("price", "clean"),
      stamp("marketCapUsd", "undated"),
      stamp("sector", "undated"),
      stamp("shortInterestPct", "post_asof"),
    ]);
    expect(s.factsTotal).toBe(4);
    expect(s.clean).toBe(1);
    expect(s.undated).toBe(2);
    expect(s.postAsOf).toBe(1);
  });

  it("reads a decision with no stamps as unverifiable, not clean", () => {
    // An empty evidence array means nothing was recorded, not that nothing was
    // wrong — the two must not score the same.
    const s = scoreProvenance([]);
    expect(s.factsTotal).toBe(0);
    expect(s.verifiableShare).toBe(0);
    expect(s.standing).toBe("unverifiable");
  });

  it("is unverifiable when nothing could be dated, however many facts there were", () => {
    const s = scoreProvenance([
      stamp("marketCapUsd", "undated"),
      stamp("sector", "undated"),
      stamp("daysToNextEarnings", "undated"),
    ]);
    expect(s.standing).toBe("unverifiable");
    expect(s.verifiableShare).toBe(0);
  });

  it("is weak below the floor and verifiable at or above it", () => {
    const oneOfThree = scoreProvenance([
      stamp("price", "clean"),
      stamp("marketCapUsd", "undated"),
      stamp("sector", "undated"),
    ]);
    expect(oneOfThree.standing).toBe("weak");

    const halfAndHalf = scoreProvenance([
      stamp("price", "clean"),
      stamp("marketCapUsd", "undated"),
    ]);
    expect(halfAndHalf.verifiableShare).toBe(0.5);
    expect(halfAndHalf.standing).toBe("verifiable");
  });

  it("reflects today's real shape: mostly undated fundamentals read weak", () => {
    // This is the finding, not a bug. Finnhub's basic-financials payload has no
    // publication timestamp, so every fundamental is undated by construction.
    const s = scoreProvenance([
      stamp("price", "clean"),
      stamp("marketCapUsd", "undated"),
      stamp("avgDollarVolumeUsd", "undated"),
      stamp("shortInterestPct", "undated"),
      stamp("daysToNextEarnings", "undated"),
      stamp("sector", "undated"),
    ]);
    expect(s.standing).toBe("weak");
    expect(s.verifiableShare).toBeCloseTo(1 / 6);
  });

  it("lists the fields withheld as post-as-of", () => {
    const gaps: ProvenanceGap[] = [
      { field: "price", status: "excluded_post_asof", source: "finnhub_quote" },
      { field: "sector", status: "unavailable", source: "factor_universe" },
      { field: "marketCapUsd", status: "failed", source: "finnhub_basic_financials" },
    ];
    const s = scoreProvenance([stamp("price", "post_asof")], gaps);
    // Only the exclusion counts — the other two are facts we never had.
    expect(s.withheldFields).toEqual(["price"]);
  });

  it("has no withheld fields in an ordinary live-forward run", () => {
    const s = scoreProvenance([stamp("price", "clean")], [
      { field: "sector", status: "unavailable", source: "factor_universe" },
    ]);
    expect(s.withheldFields).toEqual([]);
  });

  it("tolerates a missing gaps argument", () => {
    expect(scoreProvenance([stamp("price", "clean")]).withheldFields).toEqual([]);
  });
});

describe("summariseProvenance", () => {
  it("is zeroed for a day with no decisions", () => {
    expect(summariseProvenance([])).toEqual({
      decisions: 0,
      verifiable: 0,
      weak: 0,
      unverifiable: 0,
      meanVerifiableShare: 0,
      withheldOn: 0,
    });
  });

  it("buckets decisions by standing", () => {
    const s = summariseProvenance([
      scoreProvenance([stamp("price", "clean")]),
      scoreProvenance([stamp("price", "clean"), stamp("a", "undated"), stamp("b", "undated")]),
      scoreProvenance([stamp("a", "undated")]),
    ]);
    expect(s.decisions).toBe(3);
    expect(s.verifiable).toBe(1);
    expect(s.weak).toBe(1);
    expect(s.unverifiable).toBe(1);
  });

  it("means over decisions, not facts — a wide name must not outweigh a narrow one", () => {
    const narrow = scoreProvenance([stamp("price", "clean")]); // share 1
    const wide = scoreProvenance([
      stamp("price", "clean"),
      ...Array.from({ length: 9 }, (_, i) => stamp(`f${i}`, "undated")),
    ]); // share 0.1
    const s = summariseProvenance([narrow, wide]);
    expect(s.meanVerifiableShare).toBeCloseTo((1 + 0.1) / 2);
  });

  it("counts decisions that had something withheld", () => {
    const withheld = scoreProvenance(
      [stamp("price", "post_asof")],
      [{ field: "price", status: "excluded_post_asof", source: "finnhub_quote" }]
    );
    const clean = scoreProvenance([stamp("price", "clean")]);
    expect(summariseProvenance([withheld, clean, withheld]).withheldOn).toBe(2);
  });
});
