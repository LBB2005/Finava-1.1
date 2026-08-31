import { describe, it, expect } from "vitest";
import { withAlpha, CHART_SERIES, CHART_TICK } from "./chartPalette";

describe("withAlpha", () => {
  it("converts a 6-digit hex to rgba", () => {
    expect(withAlpha("#057a55", 0.32)).toBe("rgba(5, 122, 85, 0.32)");
  });

  it("expands 3-digit shorthand", () => {
    expect(withAlpha("#f00", 1)).toBe("rgba(255, 0, 0, 1)");
    expect(withAlpha("#abc", 0.5)).toBe("rgba(170, 187, 204, 0.5)");
  });

  it("accepts a hex without the leading hash", () => {
    expect(withAlpha("b42318", 0.26)).toBe("rgba(180, 35, 24, 0.26)");
  });

  it("is case-insensitive", () => {
    expect(withAlpha("#FF8800", 0.5)).toBe(withAlpha("#ff8800", 0.5));
  });

  it("tolerates the whitespace getComputedStyle leaves on a token value", () => {
    expect(withAlpha("  #057a55  ", 0.32)).toBe("rgba(5, 122, 85, 0.32)");
  });

  it("handles the transparent and opaque ends", () => {
    expect(withAlpha("#3fb950", 0)).toBe("rgba(63, 185, 80, 0)");
    expect(withAlpha("#3fb950", 1)).toBe("rgba(63, 185, 80, 1)");
  });

  it("passes a non-hex colour through rather than mangling it", () => {
    // Already-valid fillStyle values: applying alpha is not worth corrupting them.
    expect(withAlpha("rgb(1, 2, 3)", 0.5)).toBe("rgb(1, 2, 3)");
    expect(withAlpha("rebeccapurple", 0.5)).toBe("rebeccapurple");
    // A CSS variable can never be resolved by a canvas, but returning it
    // unchanged keeps the failure visible instead of inventing a colour.
    expect(withAlpha("var(--color-bull)", 0.5)).toBe("var(--color-bull)");
  });

  it("rejects malformed hex lengths instead of half-parsing them", () => {
    expect(withAlpha("#12345", 0.5)).toBe("#12345");
    expect(withAlpha("#gggggg", 0.5)).toBe("#gggggg");
  });
});

describe("chart palette constants", () => {
  it("leads with the accent token so series 1 matches the app's accent", () => {
    expect(CHART_SERIES[0]).toBe("var(--color-accent)");
  });

  it("exposes distinct series colours", () => {
    expect(new Set(CHART_SERIES).size).toBe(CHART_SERIES.length);
  });

  it("ticks use the muted token", () => {
    expect(CHART_TICK).toBe("var(--color-muted)");
  });
});
