import { describe, it, expect } from "vitest";
import { DATA_ACCURACY_RULE, DATA_ACCURACY_RULE_JSON } from "./dataAccuracy";

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

// The JSON variant is spliced into the strict-JSON agents (portfolio-statement
// extractor, supply-chain estimator). It shares the no-fabrication core but must
// NOT carry the prose clauses that break a null-based JSON shape.
describe("DATA_ACCURACY_RULE_JSON", () => {
  it("is a non-empty single block", () => {
    expect(DATA_ACCURACY_RULE_JSON.length).toBeGreaterThan(0);
    expect(DATA_ACCURACY_RULE_JSON).toContain("Data Accuracy");
  });

  it("keeps the no-fabrication guardrail", () => {
    expect(DATA_ACCURACY_RULE_JSON).toContain("No fabrication");
    expect(DATA_ACCURACY_RULE_JSON.toLowerCase()).toContain("from memory");
  });

  it("points missing values at null, not the string \"Unavailable\"", () => {
    expect(DATA_ACCURACY_RULE_JSON).toContain("null");
    expect(DATA_ACCURACY_RULE_JSON).not.toContain("Unavailable");
  });

  it("drops the prose-only inline-sourcing clause", () => {
    // Inline sourcing (e.g. "(SEC EDGAR FY2024)") is meaningless in a JSON payload.
    expect(DATA_ACCURACY_RULE_JSON).not.toContain("Sourcing");
  });
});
