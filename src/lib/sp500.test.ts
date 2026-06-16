import { describe, expect, it } from "vitest";
import { SP500, SP500_BY_TICKER, SP500_SECTORS } from "./sp500";

describe("S&P 500 universe", () => {
  it("exposes a normalized scan universe with core mega-cap constituents", () => {
    expect(SP500.length).toBeGreaterThan(450);
    expect(SP500_BY_TICKER.get("AAPL")).toEqual({
      ticker: "AAPL",
      name: "Apple Inc.",
      sector: "Information Technology",
    });
    expect(SP500_BY_TICKER.get("JPM")).toMatchObject({
      ticker: "JPM",
      sector: "Financials",
    });
    expect(SP500_BY_TICKER.size).toBe(SP500.length);
  });

  it("keeps sorted GICS sectors for filter controls", () => {
    expect(SP500_SECTORS).toEqual([...SP500_SECTORS].sort());
    expect(SP500_SECTORS).toEqual(
      expect.arrayContaining([
        "Communication Services",
        "Consumer Discretionary",
        "Consumer Staples",
        "Energy",
        "Financials",
        "Health Care",
        "Industrials",
        "Information Technology",
        "Materials",
        "Real Estate",
        "Utilities",
      ])
    );
  });
});
