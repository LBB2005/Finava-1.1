import { beforeEach, describe, expect, it, vi } from "vitest";
import aaplFacts from "@/test/fixtures/edgar-companyfacts-aapl.json";
import proxyFacts from "@/test/fixtures/edgar-companyfacts-proxy-fcf.json";
import {
  extractFinancialMetrics,
  extractFundamentalTimeSeries,
  getCikByTicker,
  getCompanyFacts,
  searchRecentForm4,
} from "./edgar";

describe("EDGAR facts extraction", () => {
  it("extracts the latest annual financial metrics with share units", () => {
    expect(extractFinancialMetrics(aaplFacts)).toEqual({
      revenue: 394328000000,
      netIncome: 93736000000,
      totalAssets: 364980000000,
      totalDebt: 85750000000,
      cash: 29943000000,
      operatingCashFlow: 118254000000,
      capex: 9447000000,
      sharesOutstanding: 15116786000,
    });
  });

  it("tolerates missing optional facts so the DCF route can use proxy FCF", () => {
    expect(extractFinancialMetrics(proxyFacts)).toMatchObject({
      revenue: 1000000000,
      operatingCashFlow: 125000000,
      capex: null,
      sharesOutstanding: null,
    });
  });

  it("stitches revenue tags by freshest concept and trims to the requested years", () => {
    const series = extractFundamentalTimeSeries(aaplFacts, 3);

    expect(series.revenue).toEqual([
      { year: 2022, value: 394328000000 },
      { year: 2023, value: 383285000000 },
      { year: 2024, value: 391035000000 },
    ]);
    expect(series.operatingCashFlow).toEqual([
      { year: 2023, value: 110543000000 },
      { year: 2024, value: 118254000000 },
    ]);
  });
});

describe("EDGAR fetch wrappers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("company_tickers.json")) {
          return Response.json({
            "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
          });
        }
        if (url.includes("companyfacts")) {
          return Response.json(aaplFacts);
        }
        if (url.includes("search-index")) {
          return Response.json({
            hits: {
              hits: [
                {
                  _id: "0000320193-25-000001:primary_doc.xml",
                  _source: {
                    display_names: [
                      "Jane Insider (CIK 0001111111)",
                      "Apple Inc. (CIK 0000320193)",
                    ],
                    ciks: ["0001111111", "0000320193"],
                    file_date: "2025-01-03",
                    period_ending: "2025-01-02",
                    adsh: "0000320193-25-000001",
                  },
                },
              ],
            },
          });
        }
        return new Response("not found", { status: 404 });
      })
    );
  });

  it("loads and caches SEC ticker CIK mappings", async () => {
    await expect(getCikByTicker("aapl")).resolves.toBe("0000320193");
    await expect(getCikByTicker("AAPL")).resolves.toBe("0000320193");

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "https://www.sec.gov/files/company_tickers.json",
      expect.objectContaining({
        headers: { "User-Agent": expect.stringContaining("Finava App") },
      })
    );
  });

  it("fetches company facts with a padded CIK", async () => {
    await expect(getCompanyFacts("320193")).resolves.toEqual(aaplFacts);

    expect(fetch).toHaveBeenCalledWith(
      "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json",
      expect.objectContaining({
        headers: { "User-Agent": expect.stringContaining("Finava App") },
      })
    );
  });

  it("maps recent Form 4 hits to insider filing summaries", async () => {
    await expect(searchRecentForm4("AAPL", 1, 1)).resolves.toEqual([
      {
        entityName: "Jane Insider",
        filedAt: "2025-01-03",
        periodOfReport: "2025-01-02",
        accessionNo: "0000320193-25-000001",
        cik: "0001111111",
      },
    ]);
  });
});
