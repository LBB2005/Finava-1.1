import { describe, expect, it } from "vitest";
import { parseBrokerCsv } from "./csv-parser";

describe("parseBrokerCsv", () => {
  it("parses a canonical broker export", () => {
    const csv = [
      "Symbol,Quantity,Avg Cost,Name,Sector",
      "AAPL,10,150.25,Apple Inc.,Technology",
      "MSFT,5,300.00,Microsoft Corp,Technology",
    ].join("\n");

    expect(parseBrokerCsv(csv)).toEqual([
      { ticker: "AAPL", shares: 10, avgCost: 150.25, companyName: "Apple Inc.", sector: "Technology" },
      { ticker: "MSFT", shares: 5, avgCost: 300, companyName: "Microsoft Corp", sector: "Technology" },
    ]);
  });

  it("matches headers case-insensitively and by alias", () => {
    const csv = "TICKER,UNITS,COST BASIS\naapl,3,100\n";
    expect(parseBrokerCsv(csv)).toEqual([
      { ticker: "AAPL", shares: 3, avgCost: 100, companyName: undefined, sector: undefined },
    ]);
  });

  it("falls back to a partial header match", () => {
    // "Stock Symbol (US)" contains the alias "stock symbol" but is not an exact match.
    const csv = "Stock Symbol (US),Share Quantity Held\nNVDA,2\n";
    const [row] = parseBrokerCsv(csv);
    expect(row).toMatchObject({ ticker: "NVDA", shares: 2 });
  });

  it("strips commas and dollar signs from numbers", () => {
    const csv = 'Symbol,Shares,Avg Price\nBRK.B,"1,200","$1,234.50"\n';
    expect(parseBrokerCsv(csv)[0]).toMatchObject({
      ticker: "BRK.B",
      shares: 1200,
      avgCost: 1234.5,
    });
  });

  it("keeps dots in the ticker but strips other punctuation", () => {
    const csv = "Symbol,Shares\n brk.b* ,1\n";
    expect(parseBrokerCsv(csv)[0].ticker).toBe("BRK.B");
  });

  it("defaults avgCost to 0 when the cost column is absent", () => {
    const csv = "Symbol,Shares\nAAPL,4\n";
    expect(parseBrokerCsv(csv)[0].avgCost).toBe(0);
  });

  it("defaults avgCost to 0 when the cost cell is unparseable", () => {
    const csv = "Symbol,Shares,Avg Cost\nAAPL,4,N/A\n";
    expect(parseBrokerCsv(csv)[0].avgCost).toBe(0);
  });

  it("skips rows with no ticker, a too-long ticker, or non-positive shares", () => {
    const csv = [
      "Symbol,Shares",
      ",10", // no ticker
      "TOOLONGTICKER,10", // >6 chars after cleaning
      "AAPL,0", // zero shares
      "MSFT,-3", // negative shares
      "GOOG,abc", // NaN shares
      "NVDA,7", // the only keeper
    ].join("\n");

    expect(parseBrokerCsv(csv)).toEqual([
      { ticker: "NVDA", shares: 7, avgCost: 0, companyName: undefined, sector: undefined },
    ]);
  });

  it("treats a missing shares cell as 0 and skips the row", () => {
    const csv = "Symbol,Shares,Avg Cost\nAAPL,,150\n";
    expect(parseBrokerCsv(csv)).toEqual([]);
  });

  it("throws when there is no data row", () => {
    expect(() => parseBrokerCsv("Symbol,Shares\n")).toThrow(/at least a header row/);
  });

  it("throws when the ticker column is missing", () => {
    expect(() => parseBrokerCsv("Quantity,Avg Cost\n10,150\n")).toThrow(/ticker\/symbol column/);
  });

  it("throws when the shares column is missing", () => {
    expect(() => parseBrokerCsv("Symbol,Avg Cost\nAAPL,150\n")).toThrow(/shares\/quantity column/);
  });
});
