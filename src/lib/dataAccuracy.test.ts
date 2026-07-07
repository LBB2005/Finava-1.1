import { describe, it, expect } from "vitest";
import { DATA_ACCURACY_RULE } from "./dataAccuracy";

// This rule is spliced into every report prompt (sub-agents via getSkillsPrompt,
// plus each synthesis/chat call-site). These assertions pin the three policies so
// an accidental edit that drops one is caught, and document intent for readers.
describe("DATA_ACCURACY_RULE", () => {
  it("is a non-empty single block", () => {
    expect(DATA_ACCURACY_RULE.length).toBeGreaterThan(0);
    expect(DATA_ACCURACY_RULE).toContain("Data Accuracy");
  });

  it("forbids fabricating figures from memory / estimates", () => {
    expect(DATA_ACCURACY_RULE).toContain("No fabrication");
    expect(DATA_ACCURACY_RULE.toLowerCase()).toContain("from memory");
    expect(DATA_ACCURACY_RULE.toLowerCase()).toContain("estimate");
  });

  it('requires an explicit "Unavailable" instead of a silent blank', () => {
    expect(DATA_ACCURACY_RULE).toContain("Unavailable");
    // The policy is: never drop the field silently.
    expect(DATA_ACCURACY_RULE.toLowerCase()).toContain("never omit");
  });

  it("requires figures to be sourced/attributed", () => {
    expect(DATA_ACCURACY_RULE).toContain("Sourcing");
    expect(DATA_ACCURACY_RULE.toLowerCase()).toContain("attribute");
  });
});
