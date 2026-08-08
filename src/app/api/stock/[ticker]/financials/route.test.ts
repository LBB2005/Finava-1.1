import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  rateLimitGuard: vi.fn(),
  getCikByTicker: vi.fn(),
  getCompanyFacts: vi.fn(),
  getEarnings: vi.fn(),
}));

// Real extraction functions, mocked network lookups.
vi.mock("@/lib/edgar", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/edgar")>()),
  getCikByTicker: deps.getCikByTicker,
  getCompanyFacts: deps.getCompanyFacts,
}));
vi.mock("@/lib/finnhub", () => ({ getEarnings: deps.getEarnings }));
vi.mock("@/lib/rateLimit", () => ({ rateLimitGuard: deps.rateLimitGuard }));

import { GET } from "./route";

function ctx(ticker: string) {
  return { params: Promise.resolve({ ticker }) };
}

function duration(pairs: Array<[string, number]>) {
  return { units: { USD: pairs.map(([frame, val]) => ({ form: "10-Q", frame, val, end: "" })) } };
}
function instant(triples: Array<[string, number, string]>) {
  return { units: { USD: triples.map(([frame, val, end]) => ({ form: "10-Q", frame, val, end })) } };
}

// 6 revenue quarters 2025Q1..2026Q2; flows for the last 4; fresh balance sheet.
const FACTS = {
  facts: {
    "us-gaap": {
      Revenues: duration([
        ["CY2025Q1", 100],
        ["CY2025Q2", 110],
        ["CY2025Q3", 120],
        ["CY2025Q4", 130],
        ["CY2026Q1", 140],
        ["CY2026Q2", 154],
      ]),
      GrossProfit: duration([["CY2026Q2", 77]]),
      CostOfRevenue: duration([["CY2026Q1", 70]]),
      NetIncomeLoss: duration([
        ["CY2025Q3", 25],
        ["CY2025Q4", 25],
        ["CY2026Q1", 25],
        ["CY2026Q2", 25],
      ]),
      OperatingIncomeLoss: duration([
        ["CY2025Q3", 30],
        ["CY2025Q4", 30],
        ["CY2026Q1", 30],
        ["CY2026Q2", 30],
      ]),
      NetCashProvidedByUsedInOperatingActivities: duration([
        ["CY2025Q3", 40],
        ["CY2025Q4", 40],
        ["CY2026Q1", 40],
        ["CY2026Q2", 40],
      ]),
      PaymentsForRepurchaseOfCommonStock: duration([
        ["CY2025Q3", 10],
        ["CY2025Q4", 10],
        ["CY2026Q1", 10],
        ["CY2026Q2", 10],
      ]),
      CashCashEquivalentsAndShortTermInvestments: instant([["CY2026Q2I", 500, "2026-06-27"]]),
      LongTermDebt: instant([["CY2026Q2I", 100, "2026-06-27"]]),
      Assets: instant([["CY2026Q2I", 2000, "2026-06-27"]]),
      StockholdersEquity: instant([["CY2026Q2I", 800, "2026-06-27"]]),
    },
    dei: {
      EntityCommonStockSharesOutstanding: {
        units: { shares: [{ form: "10-Q", frame: "CY2026Q2I", val: 100, end: "2026-06-27" }] },
      },
    },
  },
};

const EARNINGS = [
  { actual: 1.3, period: "2026-06-27" }, // CY2026Q2
  { actual: 1.2, period: "2026-03-28" }, // CY2026Q1
  { actual: 1.1, period: "2025-12-27" }, // CY2025Q4
  { actual: 1.0, period: "2025-09-27" }, // CY2025Q3
];

beforeEach(() => {
  vi.clearAllMocks();
  deps.rateLimitGuard.mockResolvedValue(null);
  deps.getCikByTicker.mockResolvedValue("0000123456");
  deps.getCompanyFacts.mockResolvedValue(FACTS);
  deps.getEarnings.mockResolvedValue(EARNINGS);
});

describe("GET /api/stock/[ticker]/financials", () => {
  it("404s for tickers without SEC filings or without quarterly revenue", async () => {
    deps.getCikByTicker.mockResolvedValueOnce(null);
    expect((await GET(new Request("http://t"), ctx("SPY"))).status).toBe(404);

    deps.getCompanyFacts.mockResolvedValueOnce({ facts: {} });
    expect((await GET(new Request("http://t"), ctx("NEWCO"))).status).toBe(404);
  });

  it("builds ledger rows with YoY, margin fallback, EPS mapping, and proxy FCF", async () => {
    const res = await GET(new Request("http://t"), ctx("acme"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.ticker).toBe("ACME");
    expect(body.quarters).toHaveLength(6);

    const last = body.quarters.at(-1);
    expect(last).toMatchObject({
      year: 2026,
      quarter: 2,
      revenue: 154,
      epsDiluted: 1.3,
      netIncome: 25,
      fcf: 40, // capex absent → OCF proxy
    });
    expect(last.revenueYoY).toBeCloseTo(0.4, 5); // 154 vs 110
    expect(last.grossMargin).toBeCloseTo(0.5, 5); // GrossProfit 77 / 154

    // Q1 2026 has no GrossProfit tag — falls back to revenue − costOfRevenue.
    const q1 = body.quarters.find(
      (q: { year: number; quarter: number }) => q.year === 2026 && q.quarter === 1
    );
    expect(q1.grossMargin).toBeCloseTo(0.5, 5); // (140 − 70) / 140
    expect(body.fcfIsProxy).toBe(true);
  });

  it("sums TTM flows, maps the balance snapshot, and derives netCash + BVPS", async () => {
    const body = await (await GET(new Request("http://t"), ctx("ACME"))).json();

    expect(body.ttm.income).toMatchObject({
      revenue: 100 + 110 + 120 + 130 + 140 + 154 - 100 - 110, // last 4: 120+130+140+154
      netIncome: 100,
      operatingIncome: 120,
      epsDiluted: 4.6,
    });
    expect(body.ttm.income.grossProfit).toBeNull(); // only one GP quarter — no TTM
    expect(body.ttm.balance).toMatchObject({
      cash: 500,
      totalDebt: 100,
      netCash: 400,
      totalAssets: 2000,
      bookValuePerShare: 8,
    });
    expect(body.ttm.cashflow).toMatchObject({
      operatingCF: 160,
      capex: null,
      fcf: 160,
      buybacks: 40,
    });
    expect(body.ttm.cashflow.fcfMargin).toBeCloseTo(160 / 544, 5);
  });

  it("survives a Finnhub earnings failure (EPS columns null)", async () => {
    deps.getEarnings.mockRejectedValueOnce(new Error("finnhub down"));
    const body = await (await GET(new Request("http://t"), ctx("ACME"))).json();
    expect(body.quarters.at(-1).epsDiluted).toBeNull();
    expect(body.ttm.income.epsDiluted).toBeNull();
  });
});
