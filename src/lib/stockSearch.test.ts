import { describe, it, expect } from "vitest";
import { searchStocks, sanitizeSymbol } from "@/lib/stockSearch";
import type { Constituent } from "@/lib/sp500";

const UNIVERSE: Constituent[] = [
  { ticker: "AAPL", name: "Apple Inc.", sector: "Information Technology" },
  { ticker: "AAP", name: "Advance Auto Parts", sector: "Consumer Discretionary" },
  { ticker: "MSFT", name: "Microsoft", sector: "Information Technology" },
  { ticker: "BRK.B", name: "Berkshire Hathaway", sector: "Financials" },
  { ticker: "GOOGL", name: "Alphabet", sector: "Communication Services" },
];

describe("searchStocks", () => {
  it("ranks an exact/prefix ticker match first", () => {
    const out = searchStocks("AAP", UNIVERSE, 7);
    expect(out[0].ticker).toBe("AAP"); // exact ticker beats AAPL prefix
    expect(out.map((s) => s.ticker)).toContain("AAPL");
  });

  it("matches on company name substring, case-insensitively", () => {
    const out = searchStocks("apple", UNIVERSE, 7);
    expect(out[0].ticker).toBe("AAPL");
  });

  it("returns [] for empty or whitespace query", () => {
    expect(searchStocks("", UNIVERSE, 7)).toEqual([]);
    expect(searchStocks("   ", UNIVERSE, 7)).toEqual([]);
  });

  it("caps results at the limit", () => {
    const out = searchStocks("a", UNIVERSE, 2); // many names contain "a"
    expect(out.length).toBeLessThanOrEqual(2);
  });
});

describe("sanitizeSymbol", () => {
  it("uppercases, trims, and keeps dotted symbols", () => {
    expect(sanitizeSymbol("  brk.b ")).toBe("BRK.B");
  });
  it("strips invalid characters", () => {
    expect(sanitizeSymbol("aa$pl!")).toBe("AAPL");
  });
});
