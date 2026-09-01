import { describe, it, expect } from "vitest";
import {
  establishAsOf,
  postDatesAsOf,
  standingOf,
  stampFact,
  shouldWithhold,
  unverifiableStamps,
  type FactStamp,
} from "./asOf";

const AS_OF = "2026-09-02T13:15:00.000Z";

describe("establishAsOf", () => {
  it("is an ISO 8601 UTC string, matching the rest of the ledger", () => {
    const iso = establishAsOf(new Date(Date.UTC(2026, 8, 2, 13, 15)));
    expect(iso).toBe("2026-09-02T13:15:00.000Z");
  });
});

describe("postDatesAsOf", () => {
  it("is true only for a value from after the cutoff", () => {
    expect(postDatesAsOf("2026-09-02T13:15:00.001Z", AS_OF)).toBe(true);
    expect(postDatesAsOf("2026-09-03T00:00:00.000Z", AS_OF)).toBe(true);
  });

  it("is false at or before the cutoff", () => {
    expect(postDatesAsOf(AS_OF, AS_OF)).toBe(false);
    expect(postDatesAsOf("2026-09-02T13:14:59.999Z", AS_OF)).toBe(false);
  });

  it("treats a missing source timestamp as not post-dating, not as a violation", () => {
    // Discarding every undated fact would empty the bundle for most providers.
    expect(postDatesAsOf(null, AS_OF)).toBe(false);
    expect(postDatesAsOf(undefined, AS_OF)).toBe(false);
    expect(postDatesAsOf("", AS_OF)).toBe(false);
  });

  it("treats an unparseable timestamp as not post-dating", () => {
    expect(postDatesAsOf("not a date", AS_OF)).toBe(false);
  });

  it("is false when our own cutoff is unreadable", () => {
    expect(postDatesAsOf("2026-09-03T00:00:00.000Z", "garbage")).toBe(false);
  });

  it("compares instants, not strings — offsets must not fool it", () => {
    // 14:15+01:00 is 13:15Z: the same instant as the cutoff, so not after it.
    expect(postDatesAsOf("2026-09-02T14:15:00.000+01:00", AS_OF)).toBe(false);
    // 14:16+01:00 is 13:16Z, one minute after.
    expect(postDatesAsOf("2026-09-02T14:16:00.000+01:00", AS_OF)).toBe(true);
  });
});

describe("standingOf", () => {
  it("separates clean, undated and post-as-of", () => {
    expect(standingOf("2026-09-01T00:00:00.000Z", AS_OF)).toBe("clean");
    expect(standingOf(null, AS_OF)).toBe("undated");
    expect(standingOf("2026-09-03T00:00:00.000Z", AS_OF)).toBe("post_asof");
  });

  it("reports undated rather than clean when the cutoff itself is unreadable", () => {
    // We cannot claim a value predates a cutoff we cannot read.
    expect(standingOf("2026-09-01T00:00:00.000Z", "garbage")).toBe("undated");
  });

  it("treats an unparseable source timestamp as undated, not clean", () => {
    expect(standingOf("yesterday-ish", AS_OF)).toBe("undated");
  });
});

describe("stampFact", () => {
  it("records observedAt and sourceAsOf as separate facts", () => {
    const stamp = stampFact({
      field: "marketCapUsd",
      source: "finnhub_basic_financials",
      sourceAsOf: "2026-09-01T20:00:00.000Z",
      asOf: AS_OF,
      observedAt: "2026-09-02T13:15:04.000Z",
    });
    expect(stamp).toEqual({
      field: "marketCapUsd",
      source: "finnhub_basic_financials",
      observedAt: "2026-09-02T13:15:04.000Z",
      sourceAsOf: "2026-09-01T20:00:00.000Z",
      standing: "clean",
    });
  });

  it("normalises a missing source timestamp to null and marks it undated", () => {
    const stamp = stampFact({
      field: "sector",
      source: "factor_universe",
      sourceAsOf: undefined,
      asOf: AS_OF,
    });
    expect(stamp.sourceAsOf).toBeNull();
    expect(stamp.standing).toBe("undated");
  });

  it("defaults observedAt to now when the caller does not supply one", () => {
    const before = Date.now();
    const stamp = stampFact({
      field: "price",
      source: "finnhub_quote",
      sourceAsOf: AS_OF,
      asOf: AS_OF,
    });
    expect(Date.parse(stamp.observedAt)).toBeGreaterThanOrEqual(before);
  });
});

describe("shouldWithhold", () => {
  const base = { field: "f", source: "s", observedAt: AS_OF, sourceAsOf: AS_OF };

  it("withholds only values from after the as-of", () => {
    expect(shouldWithhold({ ...base, standing: "post_asof" } as FactStamp)).toBe(true);
  });

  it("shows clean and undated values — an undated fact is measured, not discarded", () => {
    expect(shouldWithhold({ ...base, standing: "clean" } as FactStamp)).toBe(false);
    expect(shouldWithhold({ ...base, standing: "undated" } as FactStamp)).toBe(false);
  });
});

describe("unverifiableStamps", () => {
  it("returns everything that is not clean", () => {
    const stamps: FactStamp[] = [
      { field: "a", source: "s", observedAt: AS_OF, sourceAsOf: AS_OF, standing: "clean" },
      { field: "b", source: "s", observedAt: AS_OF, sourceAsOf: null, standing: "undated" },
      { field: "c", source: "s", observedAt: AS_OF, sourceAsOf: AS_OF, standing: "post_asof" },
    ];
    expect(unverifiableStamps(stamps).map((s) => s.field)).toEqual(["b", "c"]);
  });

  it("is empty when every fact is dated and in-window", () => {
    const stamps: FactStamp[] = [
      { field: "a", source: "s", observedAt: AS_OF, sourceAsOf: AS_OF, standing: "clean" },
    ];
    expect(unverifiableStamps(stamps)).toEqual([]);
  });
});
