import { describe, it, expect, beforeEach, vi } from "vitest";

const getQuote = vi.hoisted(() => vi.fn());
const getBasicFinancials = vi.hoisted(() => vi.fn());
const getEarningsCalendar = vi.hoisted(() => vi.fn());

vi.mock("@/lib/finnhub", () => ({ getQuote, getBasicFinancials, getEarningsCalendar }));

import { candidateFacts } from "./candidateFacts";

beforeEach(() => {
  getQuote.mockReset().mockResolvedValue({ ticker: "NVDA", price: 100 });
  getBasicFinancials
    .mockReset()
    .mockResolvedValue({ metric: { marketCapitalization: 3_000_000, avgVolume10Day: 50, shortInterestPct: 1.2 } });
  getEarningsCalendar.mockReset().mockResolvedValue({ earningsCalendar: [] });
});

describe("candidateFacts", () => {
  it("converts Finnhub's millions into dollars", async () => {
    const f = await candidateFacts("nvda");
    expect(f.marketCapUsd).toBe(3_000_000 * 1e6);
    expect(f.ticker).toBe("NVDA");
  });

  it("derives dollar volume from average shares and price", async () => {
    const f = await candidateFacts("NVDA");
    expect(f.avgDollarVolumeUsd).toBe(50 * 100);
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
