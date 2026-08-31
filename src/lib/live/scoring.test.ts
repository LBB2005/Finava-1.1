import { describe, it, expect } from "vitest";
import { SCORING_SHA256, scoringRegistration } from "./scoring";

describe("scoring registration", () => {
  it("pins a full sha256", () => {
    expect(SCORING_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("names the document and the commit that introduced it", () => {
    const r = scoringRegistration();
    expect(r.document).toBe("SCORING.md");
    expect(r.commit).toMatch(/^[0-9a-f]{7,40}$/);
    expect(r.version).toBe("v1");
  });

  it("tells a reader how to recompute the hash themselves", () => {
    // The pin is worthless if verifying it requires asking us how.
    expect(scoringRegistration().note).toContain("shasum -a 256");
  });
});
