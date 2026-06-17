import { describe, it, expect } from "vitest";
import { getSkillsPrompt } from "./index";

const KNOWN_KEYS = [
  "risk", "news", "macro", "technical", "dcf", "earnings", "insider",
  "sentiment", "competitor", "options", "comparables", "graham", "analyst",
  "hype", "fundamentals",
] as const;

describe("getSkillsPrompt", () => {
  it("returns a composed, non-empty prompt for every known skill", () => {
    for (const key of KNOWN_KEYS) {
      const prompt = getSkillsPrompt(key);
      expect(prompt.length, key).toBeGreaterThan(0);
      // All four sections present.
      expect(prompt, key).toContain("## Your Identity");
      expect(prompt, key).toContain("## Your Strengths");
      expect(prompt, key).toContain("## Analytical Guidelines");
      expect(prompt, key).toContain("## Domain Patterns");
      // Bullet lists are rendered with "- " prefixes.
      expect(prompt, key).toContain("\n- ");
    }
  });

  it("renders the persona text verbatim for the dcf skill", () => {
    const prompt = getSkillsPrompt("dcf");
    expect(prompt).toContain("DCF modeling experience");
    // Identity section comes before strengths in the composed order.
    expect(prompt.indexOf("## Your Identity")).toBeLessThan(prompt.indexOf("## Your Strengths"));
  });

  it("produces distinct prompts for distinct skills", () => {
    expect(getSkillsPrompt("dcf")).not.toBe(getSkillsPrompt("fundamentals"));
  });

  it("returns an empty string for an unknown key", () => {
    expect(getSkillsPrompt("nonexistent")).toBe("");
  });

  it("returns an empty string for an empty key", () => {
    expect(getSkillsPrompt("")).toBe("");
  });
});
