import { describe, it, expect } from "vitest";
import { secretMatches } from "./secretMatches";

describe("secretMatches", () => {
  it("matches identical secrets", () => {
    expect(secretMatches("s3cret-value", "s3cret-value")).toBe(true);
  });

  it("rejects a wrong secret of the same length", () => {
    expect(secretMatches("s3cret-value", "s3cret-VALUE")).toBe(false);
  });

  it("rejects a wrong secret of a different length", () => {
    expect(secretMatches("short", "a-much-longer-secret")).toBe(false);
  });

  it("fails closed when the expected secret is unset/empty", () => {
    expect(secretMatches("anything", undefined)).toBe(false);
    expect(secretMatches("anything", "")).toBe(false);
  });

  it("fails closed when no value is provided", () => {
    expect(secretMatches(null, "expected")).toBe(false);
    expect(secretMatches(undefined, "expected")).toBe(false);
    expect(secretMatches("", "expected")).toBe(false);
  });
});
