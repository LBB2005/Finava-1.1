import { describe, it, expect } from "vitest";
import { RankedCandidatesSchema, RANKED_CONTRACT, MAX_DEBATE_SUBJECTS } from "./ranking";

describe("RankedCandidatesSchema", () => {
  it("accepts a well-formed ranking", () => {
    const r = RankedCandidatesSchema.safeParse({
      ranked: [{ ticker: "NVDA", rank: 1, rationale: "Strongest factor composite in the shortlist." }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects an empty ranking", () => {
    expect(RankedCandidatesSchema.safeParse({ ranked: [] }).success).toBe(false);
  });

  it("rejects a rationale-free entry", () => {
    const r = RankedCandidatesSchema.safeParse({ ranked: [{ ticker: "NVDA", rank: 1, rationale: "" }] });
    expect(r.success).toBe(false);
  });

  it("rejects a rank of zero", () => {
    const r = RankedCandidatesSchema.safeParse({
      ranked: [{ ticker: "NVDA", rank: 0, rationale: "x" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a ticker too long to be one", () => {
    const r = RankedCandidatesSchema.safeParse({
      ranked: [{ ticker: "NOTATICKERATALL", rank: 1, rationale: "x" }],
    });
    expect(r.success).toBe(false);
  });
});

describe("RANKED_CONTRACT", () => {
  it("tells the model to omit a name rather than invent a reason for it", () => {
    // The failure mode this guards: a plausible rationale attached to a name the
    // synthesis never actually argued for, which would then reach a full debate.
    expect(RANKED_CONTRACT).toContain("rather than inventing one");
  });
});

describe("MAX_DEBATE_SUBJECTS", () => {
  it("is bounded so the run can still commit before the open", () => {
    expect(MAX_DEBATE_SUBJECTS).toBeGreaterThan(0);
    expect(MAX_DEBATE_SUBJECTS).toBeLessThanOrEqual(8);
  });
});
