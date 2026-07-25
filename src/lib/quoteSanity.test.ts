import { describe, expect, it } from "vitest";
import {
  assessFreshness,
  assessMarketCapConsistency,
  STALE_MAX_AGE_MS,
  MARKETCAP_MAX_RATIO,
} from "./quoteSanity";

// A fixed "now" so tests never depend on the wall clock.
const NOW = Date.parse("2026-07-20T18:00:00Z");

describe("assessFreshness", () => {
  it("returns null for a quote timestamped moments ago", () => {
    const asOf = new Date(NOW - 15_000).toISOString(); // 15s old (within the 30s cache)
    expect(assessFreshness(asOf, NOW)).toBeNull();
  });

  it("returns null across a long weekend (under the staleness threshold)", () => {
    const asOf = "2026-07-17T20:00:00Z"; // Friday close, viewed the following Monday
    expect(assessFreshness(asOf, NOW)).toBeNull();
  });

  it("flags a quote that has not updated in 10 days (the real MU case)", () => {
    const asOf = "2026-07-10T20:00:00Z"; // exactly what /api/quotes returned for MU
    const warning = assessFreshness(asOf, NOW);
    expect(warning).not.toBeNull();
    expect(warning?.code).toBe("stale");
    expect(warning?.detail).toMatch(/day/i); // human-readable age in the tooltip
  });

  it("does not flag when the timestamp is missing (absence is not staleness)", () => {
    expect(assessFreshness(null, NOW)).toBeNull();
    expect(assessFreshness(undefined, NOW)).toBeNull();
  });

  it("does not flag a future timestamp (clock skew is not staleness)", () => {
    const asOf = new Date(NOW + 60_000).toISOString();
    expect(assessFreshness(asOf, NOW)).toBeNull();
  });

  it("exposes the threshold as a named constant of a few days", () => {
    expect(STALE_MAX_AGE_MS).toBeGreaterThanOrEqual(3 * 24 * 60 * 60 * 1000);
  });
});

describe("assessMarketCapConsistency", () => {
  it("returns null when price x shares matches the reported market cap", () => {
    // NVDA-like: ~24.3B shares x ~$204 ≈ $4.96T reported
    expect(assessMarketCapConsistency(204, 4.96e12, 24.3e9)).toBeNull();
  });

  it("tolerates the small drift from stale share counts / buybacks", () => {
    // 10% off — well within a sane band, must not false-positive
    expect(assessMarketCapConsistency(204, 4.96e12 * 1.1, 24.3e9)).toBeNull();
  });

  it("flags the NFLX case: $67 price against a $289.5B cap (~10x mismatch)", () => {
    const warning = assessMarketCapConsistency(67.47, 289.5e9, 430e6);
    expect(warning).not.toBeNull();
    expect(warning?.code).toBe("price-marketcap-mismatch");
  });

  it("cannot assess when any input is missing or non-positive", () => {
    expect(assessMarketCapConsistency(null, 289.5e9, 430e6)).toBeNull();
    expect(assessMarketCapConsistency(67, null, 430e6)).toBeNull();
    expect(assessMarketCapConsistency(67, 289.5e9, null)).toBeNull();
    expect(assessMarketCapConsistency(0, 289.5e9, 430e6)).toBeNull();
  });

  it("exposes the tolerance as a named ratio greater than 1", () => {
    expect(MARKETCAP_MAX_RATIO).toBeGreaterThan(1);
  });
});
