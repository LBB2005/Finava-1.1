import { describe, it, expect, vi } from "vitest";

// conversationTitle imports firebase-admin (self-initializes from env) and llm.
// The sanitizer is pure, so stub those modules to keep this an isolated unit test.
vi.mock("./firebase-admin", () => ({ db: {} }));
vi.mock("./llm", () => ({ generate: vi.fn() }));

import { sanitizeTitle } from "./conversationTitle";

describe("sanitizeTitle", () => {
  it("passes a clean title through unchanged", () => {
    expect(sanitizeTitle("Apple Stock Buy Analysis")).toBe("Apple Stock Buy Analysis");
  });

  it("strips wrapping straight and curly quotes/backticks", () => {
    expect(sanitizeTitle('"Apple Stock Analysis"')).toBe("Apple Stock Analysis");
    expect(sanitizeTitle("`Apple Stock Analysis`")).toBe("Apple Stock Analysis");
    expect(sanitizeTitle("“Apple Stock Analysis”")).toBe("Apple Stock Analysis");
  });

  it("removes a leading Title:/Chat: prefix", () => {
    expect(sanitizeTitle("Title: Apple Stock Analysis")).toBe("Apple Stock Analysis");
    expect(sanitizeTitle("Conversation - Apple Stock Analysis")).toBe(
      "Apple Stock Analysis"
    );
  });

  it("drops trailing punctuation", () => {
    expect(sanitizeTitle("Apple Stock Analysis.")).toBe("Apple Stock Analysis");
    expect(sanitizeTitle("Is Apple A Buy?")).toBe("Is Apple A Buy");
  });

  it("collapses internal whitespace and newlines", () => {
    expect(sanitizeTitle("Apple   Stock\nAnalysis")).toBe("Apple Stock Analysis");
  });

  it("clamps overly long titles on a word boundary", () => {
    const long = "Apple Stock Comprehensive Long Term Investment Thesis And Valuation Review Deep";
    const out = sanitizeTitle(long);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out).not.toMatch(/\s$/);
    // No partial word at the end.
    expect(long.startsWith(out)).toBe(true);
  });

  it("returns empty string for empty or whitespace-only input", () => {
    expect(sanitizeTitle("")).toBe("");
    expect(sanitizeTitle("   ")).toBe("");
    expect(sanitizeTitle('""')).toBe("");
  });
});
