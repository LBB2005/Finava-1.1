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
  getQuote
    .mockReset()
    .mockResolvedValue({ ticker: "NVDA", price: 100, asOfSource: "fetch" });
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

/** A fixed run as-of, so a stamped fact's standing is deterministic. */
const AS_OF = "2026-09-08T13:15:00.000Z";

describe("candidateFacts", () => {
  it("converts Finnhub's millions into dollars", async () => {
    const f = await candidateFacts("nvda", AS_OF);
    expect(f.marketCapUsd).toBe(3_000_000 * 1e6);
    expect(f.ticker).toBe("NVDA");
  });

  it("derives dollar volume from average shares and price, in millions", async () => {
    // 50 million shares at $100 = $5bn/day. Reading the wrong key here made this
    // null for every candidate, so the ADV rail rejected NVDA for illiquidity —
    // a rail that refuses everything looks exactly like a rail that works.
    const f = await candidateFacts("NVDA", AS_OF);
    expect(f.avgDollarVolumeUsd).toBe(50 * 1e6 * 100);
  });

  it("records a gap when the volume field is absent, rather than reporting zero", async () => {
    getBasicFinancials.mockResolvedValue({ metric: { marketCapitalization: 3_000_000 } });
    const f = await candidateFacts("NVDA", AS_OF);
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
    const f = await candidateFacts("NVDA", AS_OF);
    expect(f.avgDollarVolumeUsd).toBeGreaterThan(10_000_000);
  });

  it("reports a missing market cap as null, never zero", async () => {
    // A zero would fail the $2bn floor for the wrong reason and read in the log
    // as a fact we established.
    getBasicFinancials.mockResolvedValue({ metric: {} });
    const f = await candidateFacts("NVDA", AS_OF);
    expect(f.marketCapUsd).toBeNull();
    expect(f.dataGaps).toContainEqual({
      field: "marketCapUsd",
      status: "unavailable",
      source: "finnhub_basic_financials",
    });
  });

  it("records a fetch failure as failed, distinct from unavailable", async () => {
    getBasicFinancials.mockRejectedValue(new Error("429"));
    const f = await candidateFacts("NVDA", AS_OF);
    expect(f.marketCapUsd).toBeNull();
    expect(f.dataGaps.find((g) => g.field === "marketCapUsd")?.status).toBe("failed");
  });

  it("leaves dollar volume null when the price could not be read", async () => {
    getQuote.mockRejectedValue(new Error("timeout"));
    const f = await candidateFacts("NVDA", AS_OF);
    expect(f.avgDollarVolumeUsd).toBeNull();
    expect(f.dataGaps.find((g) => g.field === "price")?.status).toBe("failed");
  });

  it("returns days to the soonest upcoming report", async () => {
    const inTenDays = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const inThirty = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    getEarningsCalendar.mockResolvedValue({
      earningsCalendar: [{ date: inThirty }, { date: inTenDays }],
    });
    const f = await candidateFacts("NVDA", AS_OF);
    expect(f.daysToNextEarnings).toBeGreaterThanOrEqual(9);
    expect(f.daysToNextEarnings).toBeLessThanOrEqual(10);
  });

  it("returns null when the calendar lists nothing", async () => {
    const f = await candidateFacts("NVDA", AS_OF);
    expect(f.daysToNextEarnings).toBeNull();
  });

  it("ignores reports already in the past", async () => {
    const lastMonth = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    getEarningsCalendar.mockResolvedValue({ earningsCalendar: [{ date: lastMonth }] });
    expect((await candidateFacts("NVDA", AS_OF)).daysToNextEarnings).toBeNull();
  });

  it("flags leveraged and inverse ETFs", async () => {
    expect((await candidateFacts("TQQQ", AS_OF)).isLeveragedOrInverseEtf).toBe(true);
    expect((await candidateFacts("SOXL", AS_OF)).isLeveragedOrInverseEtf).toBe(true);
    expect((await candidateFacts("NVDA", AS_OF)).isLeveragedOrInverseEtf).toBe(false);
  });

  it("flags an option symbol by its length", async () => {
    expect((await candidateFacts("NVDA260116C00100000", AS_OF)).isOption).toBe(true);
    expect((await candidateFacts("GOOGL", AS_OF)).isOption).toBe(false);
  });

  it("survives every source failing at once", async () => {
    getQuote.mockRejectedValue(new Error("x"));
    getBasicFinancials.mockRejectedValue(new Error("x"));
    getEarningsCalendar.mockRejectedValue(new Error("x"));
    const f = await candidateFacts("NVDA", AS_OF);
    expect(f.marketCapUsd).toBeNull();
    expect(f.dataGaps).toHaveLength(3);
  });
});

describe("sector resolution", () => {
  it("resolves the sector the concentration rail needs", async () => {
    expect((await candidateFacts("NVDA", AS_OF)).sector).toBe("Information Technology");
  });

  it("leaves sector null for a name absent from the universe, and records the gap", async () => {
    // Never guessed: a wrong sector silently moves capital between buckets and
    // the concentration rail would then be enforcing a fiction.
    const f = await candidateFacts("ZZZZ", AS_OF);
    expect(f.sector).toBeNull();
    expect(f.dataGaps).toContainEqual({
      field: "sector",
      status: "unavailable",
      source: "factor_universe",
    });
  });

  it("distinguishes a universe FAILURE from a name simply being absent", async () => {
    getFactorUniverse.mockRejectedValue(new Error("timeout"));
    const f = await candidateFacts("NVDA", AS_OF);
    expect(f.sector).toBeNull();
    expect(f.dataGaps.find((g) => g.field === "sector")?.status).toBe("failed");
  });
});

describe("as-of stamping", () => {
  it("withholds a quote the source dates after the run's as-of", async () => {
    // The exchange timestamp is a day past the instant the crew is entitled to.
    getQuote.mockResolvedValue({
      ticker: "NVDA",
      price: 100,
      asOf: "2026-09-09T20:00:00.000Z",
      asOfSource: "exchange",
    });

    const f = await candidateFacts("NVDA", AS_OF);

    expect(f.dataGaps).toContainEqual({
      field: "price",
      status: "excluded_post_asof",
      source: "finnhub_quote",
    });
    expect(f.evidence.find((e) => e.field === "price")?.standing).toBe("post_asof");
    // Withholding the price must take the derived figure with it, or the rail
    // would be checked against a number computed from data the crew never saw.
    expect(f.avgDollarVolumeUsd).toBeNull();
  });

  it("keeps a quote dated at or before the as-of", async () => {
    getQuote.mockResolvedValue({
      ticker: "NVDA",
      price: 100,
      asOf: "2026-09-08T13:00:00.000Z",
      asOfSource: "exchange",
    });

    const f = await candidateFacts("NVDA", AS_OF);

    expect(f.evidence.find((e) => e.field === "price")?.standing).toBe("clean");
    expect(f.avgDollarVolumeUsd).toBe(50 * 1e6 * 100);
    expect(f.dataGaps.some((g) => g.status === "excluded_post_asof")).toBe(false);
  });

  it("marks Finnhub's undated fundamentals as undated rather than clean", async () => {
    // basic-financials carries no publication timestamp, so a revision is
    // indistinguishable from an original. The stamp is what makes that countable.
    const f = await candidateFacts("NVDA", AS_OF);
    const cap = f.evidence.find((e) => e.field === "marketCapUsd");
    expect(cap?.standing).toBe("undated");
    expect(cap?.sourceAsOf).toBeNull();
    // Undated is not excluded — the value still reaches the crew.
    expect(f.marketCapUsd).toBe(3_000_000 * 1e6);
  });

  it("stamps every fact the mandate rails read", async () => {
    const f = await candidateFacts("NVDA", AS_OF);
    expect(f.evidence.map((e) => e.field).sort()).toEqual([
      "avgDollarVolumeUsd",
      "daysToNextEarnings",
      "marketCapUsd",
      "price",
      "sector",
      "shortInterestPct",
    ]);
  });

  it("records observedAt on every stamp, even where the source will not date itself", async () => {
    const f = await candidateFacts("NVDA", AS_OF);
    for (const stamp of f.evidence) {
      expect(Number.isNaN(Date.parse(stamp.observedAt))).toBe(false);
    }
  });

  it("will not treat a fetch-timed quote as provenance", async () => {
    // getQuote fabricates asOf when Finnhub omits `t`. Trusting it would stamp a
    // timestamp that describes our request as though it described the price.
    getQuote.mockResolvedValue({
      ticker: "NVDA",
      price: 100,
      asOf: "2026-09-08T13:14:00.000Z",
      asOfSource: "fetch",
    });

    const f = await candidateFacts("NVDA", AS_OF);
    const price = f.evidence.find((e) => e.field === "price");
    expect(price?.standing).toBe("undated");
    expect(price?.sourceAsOf).toBeNull();
    // Undated still reaches the crew — only post-as-of is withheld.
    expect(f.avgDollarVolumeUsd).toBe(50 * 1e6 * 100);
  });
});
