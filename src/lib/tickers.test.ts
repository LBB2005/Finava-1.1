import { describe, it, expect } from "vitest";
import { isValidTicker, parseTickersParam } from "./tickers";

describe("isValidTicker", () => {
  it("accepts common symbols", () => {
    for (const t of ["AAPL", "MSFT", "BRK.B", "BF-B", "GOOGL", "V", "RDS.A"]) {
      expect(isValidTicker(t), t).toBe(true);
    }
  });

  it("rejects junk", () => {
    for (const t of ["", "9XYZ", "AAPL!!", "../../etc/passwd", "A".repeat(11), "lowercase", "FOO BAR"]) {
      expect(isValidTicker(t), t).toBe(false);
    }
  });
});

describe("parseTickersParam", () => {
  it("uppercases, trims, and drops invalid entries", () => {
    expect(parseTickersParam(" aapl, msft ,, brk.b, ../bad, 9x ")).toEqual([
      "AAPL",
      "MSFT",
      "BRK.B",
    ]);
  });

  it("returns empty for empty input", () => {
    expect(parseTickersParam("")).toEqual([]);
  });
});
