import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import aaplFacts from "@/test/fixtures/edgar-companyfacts-aapl.json";
import proxyFacts from "@/test/fixtures/edgar-companyfacts-proxy-fcf.json";
import {
  extractFinancialMetrics,
  extractFundamentalTimeSeries,
  getCikByTicker,
  getCompanyFacts,
  getLatest10KText,
  getRecentFilings,
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

describe("EDGAR failure modes", () => {
  afterEach(() => vi.restoreAllMocks());

  it("throws (never silently returns []) when the Form 4 search errors", async () => {
    // The distinction matters: the insider agent treats a thrown error as
    // "lookup UNAVAILABLE" and an empty array as "no activity". They must not blur.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("rate limited", { status: 429 })));
    await expect(searchRecentForm4("AAPL")).rejects.toThrow(/EDGAR FTS 429/);
  });

  it("returns an empty map (not a throw) when the CIK ticker file is unreachable", async () => {
    // Fresh module so CIK_CACHE starts null and the failing fetch is actually hit.
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 500 })));
    const fresh = await import("./edgar");
    // Unknown ticker resolves to null rather than crashing the caller.
    await expect(fresh.getCikByTicker("AAPL")).resolves.toBeNull();
  });

  it("fetches submissions with a zero-padded CIK", async () => {
    const submissions = { filings: { recent: { form: [], accessionNumber: [], primaryDocument: [] } } };
    const spy = vi.fn(async () => Response.json(submissions));
    vi.stubGlobal("fetch", spy);
    await expect(getRecentFilings("320193")).resolves.toEqual(submissions);
    expect(spy).toHaveBeenCalledWith(
      "https://data.sec.gov/submissions/CIK0000320193.json",
      expect.objectContaining({ headers: { "User-Agent": expect.stringContaining("Finava App") } }),
    );
  });
});

describe("getLatest10KText", () => {
  afterEach(() => vi.restoreAllMocks());

  const submissionsWith10K = {
    filings: {
      recent: {
        form: ["8-K", "10-K", "10-Q"],
        accessionNumber: ["0000320193-24-000001", "0000320193-24-000123", "0000320193-24-000200"],
        primaryDocument: ["ev.htm", "aapl-10k.htm", "q.htm"],
      },
    },
  };

  it("fetches the latest 10-K and returns HTML stripped to readable text", async () => {
    const html =
      "<html><head><style>.x{color:red}</style></head>" +
      "<body><script>steal()</script><p>Item&nbsp;1. Business &amp; competition</p></body></html>";
    const spy = vi.fn(async (url: string) => {
      if (url.includes("submissions")) return Response.json(submissionsWith10K);
      return new Response(html); // the primary-document hop
    });
    vi.stubGlobal("fetch", spy);

    const text = await getLatest10KText("320193");
    expect(text).toContain("Item 1. Business & competition");
    expect(text).not.toContain("steal("); // <script> body dropped
    expect(text).not.toContain("<p>"); // tags stripped
    expect(text).not.toContain("color:red"); // <style> body dropped

    // Archives path uses the un-padded CIK and the dash-stripped accession number.
    expect(spy).toHaveBeenCalledWith(
      "https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/aapl-10k.htm",
      expect.anything(),
    );
  });

  it("truncates to maxChars", async () => {
    const html = `<body>${"A".repeat(500)}</body>`;
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.includes("submissions") ? Response.json(submissionsWith10K) : new Response(html),
    ));
    const text = await getLatest10KText("320193", 100);
    expect(text).toHaveLength(100);
  });

  it("returns null when the company has no 10-K on file", async () => {
    const noTenK = { filings: { recent: { form: ["8-K", "10-Q"], accessionNumber: ["a", "b"], primaryDocument: ["x", "y"] } } };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(noTenK)));
    await expect(getLatest10KText("320193")).resolves.toBeNull();
  });

  it("returns null when the 10-K document fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.includes("submissions") ? Response.json(submissionsWith10K) : new Response("gone", { status: 404 }),
    ));
    await expect(getLatest10KText("320193")).resolves.toBeNull();
  });

  it("returns null when the submissions lookup itself throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("err", { status: 500 })));
    await expect(getLatest10KText("320193")).resolves.toBeNull();
  });
});
