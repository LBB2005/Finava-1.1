import { describe, it, expect, beforeEach, vi } from "vitest";

const getQuote = vi.hoisted(() => vi.fn());
const getBasicFinancials = vi.hoisted(() => vi.fn());
const getEarningsCalendar = vi.hoisted(() => vi.fn());

vi.mock("@/lib/finnhub", () => ({ getQuote, getBasicFinancials, getEarningsCalendar }));

// Sector comes from the factor universe, which fans ~500 tickers when cold.
const getFactorUniverse = vi.hoisted(() => vi.fn());
vi.mock("@/lib/factorUniverse", () => ({ getFactorUniverse }));

import { candidateFacts } from "./candidateFacts";

beforeEach(() => {
  getQuote.mockReset().mockResolvedValue({ ticker: "NVDA", price: 100 });
  getBasicFinancials
    .mockReset()
    .mockResolvedValue({
      metric: {
        marketCapitalization: 3_000_000,
        // Finnhub's real key, in MILLIONS of shares.
        "10DayAverageTradingVolume": 50,
        shortInterestPct: 1.2,
      },
    });
  getEarningsCalendar.mockReset().mockResolvedValue({ earningsCalendar: [] });
  getFactorUniverse.mockReset().mockResolvedValue({
    stocks: [
      { ticker: "NVDA", sector: "Information Technology" },
      { ticker: "GOOGL", sector: "Communication Services" },
    ],
  });
});

describe("candidateFacts", () => {
  it("converts Finnhub's millions into dollars", async () => {
    const f = await candidateFacts("nvda");
    expect(f.marketCapUsd).toBe(3_000_000 * 1e6);
    expect(f.ticker).toBe("NVDA");
  });

  it("derives dollar volume from average shares and price, in millions", async () => {
    // 50 million shares at $100 = $5bn/day. Reading the wrong key here made this
    // null for every candidate, so the ADV rail rejected NVDA for illiquidity —
    // a rail that refuses everything looks exactly like a rail that works.
    const f = await candidateFacts("NVDA");
    expect(f.avgDollarVolumeUsd).toBe(50 * 1e6 * 100);
  });

  it("records a gap when the volume field is absent, rather than reporting zero", async () => {
    getBasicFinancials.mockResolvedValue({ metric: { marketCapitalization: 3_000_000 } });
    const f = await candidateFacts("NVDA");
    expect(f.avgDollarVolumeUsd).toBeNull();
    expect(f.dataGaps).toContainEqual({
      field: "avgDollarVolumeUsd",
      status: "unavailable",
      source: "finnhub_basic_financials",
    });
  });

  it("clears the real-world liquidity floor for a mega-cap", async () => {
    // Regression against the actual production values: NVDA trades ~141m shares
    // a day, which must pass a $10m ADV floor by four orders of magnitude.
    getBasicFinancials.mockResolvedValue({
      metric: { marketCapitalization: 5_422_978, "10DayAverageTradingVolume": 141.635 },
    });
    getQuote.mockResolvedValue({ ticker: "NVDA", price: 180 });
    const f = await candidateFacts("NVDA");
    expect(f.avgDollarVolumeUsd).toBeGreaterThan(10_000_000);
  });

  it("reports a missing market cap as null, never zero", async () => {
    // A zero would fail the $2bn floor for the wrong reason and read in the log
    // as a fact we established.
    getBasicFinancials.mockResolvedValue({ metric: {} });
    const f = await candidateFacts("NVDA");
    expect(f.marketCapUsd).toBeNull();
    expect(f.dataGaps).toContainEqual({
      field: "marketCapUsd",
      status: "unavailable",
      source: "finnhub_basic_financials",
    });
  });

  it("records a fetch failure as failed, distinct from unavailable", async () => {
    getBasicFinancials.mockRejectedValue(new Error("429"));
    const f = await candidateFacts("NVDA");
    expect(f.marketCapUsd).toBeNull();
    expect(f.dataGaps.find((g) => g.field === "marketCapUsd")?.status).toBe("failed");
  });

  it("leaves dollar volume null when the price could not be read", async () => {
    getQuote.mockRejectedValue(new Error("timeout"));
    const f = await candidateFacts("NVDA");
    expect(f.avgDollarVolumeUsd).toBeNull();
    expect(f.dataGaps.find((g) => g.field === "price")?.status).toBe("failed");
  });

  it("returns days to the soonest upcoming report", async () => {
    const inTenDays = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const inThirty = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    getEarningsCalendar.mockResolvedValue({
      earningsCalendar: [{ date: inThirty }, { date: inTenDays }],
    });
    const f = await candidateFacts("NVDA");
    expect(f.daysToNextEarnings).toBeGreaterThanOrEqual(9);
    expect(f.daysToNextEarnings).toBeLessThanOrEqual(10);
  });

  it("returns null when the calendar lists nothing", async () => {
    const f = await candidateFacts("NVDA");
    expect(f.daysToNextEarnings).toBeNull();
  });

  it("ignores reports already in the past", async () => {
    const lastMonth = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    getEarningsCalendar.mockResolvedValue({ earningsCalendar: [{ date: lastMonth }] });
    expect((await candidateFacts("NVDA")).daysToNextEarnings).toBeNull();
  });

  it("flags leveraged and inverse ETFs", async () => {
    expect((await candidateFacts("TQQQ")).isLeveragedOrInverseEtf).toBe(true);
    expect((await candidateFacts("SOXL")).isLeveragedOrInverseEtf).toBe(true);
    expect((await candidateFacts("NVDA")).isLeveragedOrInverseEtf).toBe(false);
  });

  it("flags an option symbol by its length", async () => {
    expect((await candidateFacts("NVDA260116C00100000")).isOption).toBe(true);
    expect((await candidateFacts("GOOGL")).isOption).toBe(false);
  });

  it("survives every source failing at once", async () => {
    getQuote.mockRejectedValue(new Error("x"));
    getBasicFinancials.mockRejectedValue(new Error("x"));
    getEarningsCalendar.mockRejectedValue(new Error("x"));
    const f = await candidateFacts("NVDA");
    expect(f.marketCapUsd).toBeNull();
    expect(f.dataGaps).toHaveLength(3);
  });
});

describe("sector resolution", () => {
  it("resolves the sector the concentration rail needs", async () => {
    expect((await candidateFacts("NVDA")).sector).toBe("Information Technology");
  });

  it("leaves sector null for a name absent from the universe, and records the gap", async () => {
    // Never guessed: a wrong sector silently moves capital between buckets and
    // the concentration rail would then be enforcing a fiction.
    const f = await candidateFacts("ZZZZ");
    expect(f.sector).toBeNull();
    expect(f.dataGaps).toContainEqual({
      field: "sector",
      status: "unavailable",
      source: "factor_universe",
    });
  });

  it("distinguishes a universe FAILURE from a name simply being absent", async () => {
    getFactorUniverse.mockRejectedValue(new Error("timeout"));
    const f = await candidateFacts("NVDA");
    expect(f.sector).toBeNull();
    expect(f.dataGaps.find((g) => g.field === "sector")?.status).toBe("failed");
  });
});
