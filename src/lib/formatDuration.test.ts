import { describe, it, expect } from "vitest";
import { formatDuration } from "./formatDuration";

describe("formatDuration", () => {
  it("renders whole seconds under a minute", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(8000)).toBe("8s");
    expect(formatDuration(59400)).toBe("59s");
  });

  it("rounds to the nearest second", () => {
    expect(formatDuration(12400)).toBe("12s");
    expect(formatDuration(12600)).toBe("13s");
  });

  it("switches to m s at a minute and drops a trailing 0s", () => {
    expect(formatDuration(60000)).toBe("1m");
    expect(formatDuration(64000)).toBe("1m 4s");
    expect(formatDuration(125000)).toBe("2m 5s");
  });

  it("never renders negative or NaN input", () => {
    expect(formatDuration(-500)).toBe("0s");
    expect(formatDuration(NaN)).toBe("0s");
  });
});
