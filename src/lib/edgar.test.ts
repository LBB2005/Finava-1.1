import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import aaplFacts from "@/test/fixtures/edgar-companyfacts-aapl.json";
import proxyFacts from "@/test/fixtures/edgar-companyfacts-proxy-fcf.json";
import {
  extractBalanceSnapshot,
  extractFinancialMetrics,
  extractFundamentalTimeSeries,
  extractQuarterlyFundamentals,
  getCikByTicker,
  getCompanyFacts,
  getLatest10KText,
  getRecentFilings,
  searchRecentForm4,
} from "./edgar";

/** Build a duration-concept entry list from [frame, val] pairs. */
function duration(pairs: Array<[string, number]>) {
  return {
    units: { USD: pairs.map(([frame, val]) => ({ form: "10-Q", frame, val, end: "" })) },
  };
}
/** Build an instant-concept entry list from [frame, val, end] triples. */
function instant(triples: Array<[string, number, string]>) {
  return {
    units: { USD: triples.map(([frame, val, end]) => ({ form: "10-Q", frame, val, end })) },
  };
}

const QUARTERLY_FACTS = {
  facts: {
    "us-gaap": {
      // 2024 Q1-Q3 + annual (Q4 must be derived: 450 − 330 = 120); 2025 full
      // via frames+annual; 2026 Q1. Split across the two revenue tags to
      // exercise concept merging (fresh tag wins, old tag back-fills).
      Revenues: duration([
        ["CY2024Q1", 100],
        ["CY2024Q2", 110],
      ]),
      RevenueFromContractWithCustomerExcludingAssessedTax: duration([
        ["CY2024Q3", 120],
        ["CY2024", 450],
        ["CY2025Q1", 130],
        ["CY2025Q2", 140],
        ["CY2025Q3", 150],
        ["CY2025", 580],
        ["CY2026Q1", 170],
      ]),
      GrossProfit: duration([["CY2025Q3", 60]]),
      CostOfRevenue: duration([["CY2026Q1", 68]]),
      NetIncomeLoss: duration([
        ["CY2025Q2", 25],
        ["CY2025Q3", 25],
        ["CY2025Q4", 25],
        ["CY2026Q1", 25],
      ]),
      OperatingIncomeLoss: duration([
        ["CY2025Q2", 30],
        ["CY2025Q3", 30],
        ["CY2025Q4", 30],
        ["CY2026Q1", 30],
      ]),
      NetCashProvidedByUsedInOperatingActivities: duration([
        ["CY2025Q2", 40],
        ["CY2025Q3", 40],
        ["CY2025Q4", 40],
        ["CY2026Q1", 40],
      ]),
      PaymentsForRepurchaseOfCommonStock: duration([
        ["CY2025Q2", 10],
        ["CY2025Q3", 10],
        ["CY2025Q4", 10],
        ["CY2026Q1", 10],
      ]),
      CashCashEquivalentsAndShortTermInvestments: instant([
        ["CY2025Q4I", 480, "2025-12-27"],
        ["CY2026Q1I", 500, "2026-03-28"],
      ]),
      LongTermDebt: instant([["CY2026Q1I", 100, "2026-03-28"]]),
      Assets: instant([["CY2026Q1I", 2000, "2026-03-28"]]),
      StockholdersEquity: instant([["CY2026Q1I", 800, "2026-03-28"]]),
    },
    dei: {
      EntityCommonStockSharesOutstanding: {
        units: { shares: [{ form: "10-Q", frame: "CY2026Q1I", val: 100, end: "2026-03-28" }] },
      },
    },
  },
};

describe("EDGAR quarterly extraction", () => {
  it("extracts discrete quarters, derives Q4 from the annual frame, and merges tags", () => {
    const q = extractQuarterlyFundamentals(QUARTERLY_FACTS, 12);
    expect(q.revenue).toEqual([
      { year: 2024, quarter: 1, value: 100 },
      { year: 2024, quarter: 2, value: 110 },
      { year: 2024, quarter: 3, value: 120 },
      { year: 2024, quarter: 4, value: 120 }, // 450 − (100+110+120)
      { year: 2025, quarter: 1, value: 130 },
      { year: 2025, quarter: 2, value: 140 },
      { year: 2025, quarter: 3, value: 150 },
      { year: 2025, quarter: 4, value: 160 }, // 580 − (130+140+150)
      { year: 2026, quarter: 1, value: 170 },
    ]);
    expect(q.grossProfit).toEqual([{ year: 2025, quarter: 3, value: 60 }]);
    expect(q.costOfRevenue).toEqual([{ year: 2026, quarter: 1, value: 68 }]);
    expect(q.capex).toEqual([]); // absent concept → empty, never invented
  });

  it("trims to the requested number of quarters", () => {
    const q = extractQuarterlyFundamentals(QUARTERLY_FACTS, 4);
    expect(q.revenue).toHaveLength(4);
    expect(q.revenue[0]).toEqual({ year: 2025, quarter: 2, value: 140 });
  });

  it("takes the freshest instant snapshot for the balance sheet (dei shares fallback)", () => {
    expect(extractBalanceSnapshot(QUARTERLY_FACTS)).toEqual({
      cash: 500, // CY2026Q1I beats CY2025Q4I
      totalDebt: 100,
      totalAssets: 2000,
      equity: 800,
      sharesOutstanding: 100,
      asOf: "2026-03-28",
    });
  });

  it("returns empty series and a null snapshot for factless issuers", () => {
    const q = extractQuarterlyFundamentals({ facts: {} }, 8);
    expect(q.revenue).toEqual([]);
    expect(extractBalanceSnapshot({ facts: {} })).toEqual({
      cash: null,
      totalDebt: null,
      totalAssets: null,
      equity: null,
      sharesOutstanding: null,
      asOf: null,
    });
  });
});

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
