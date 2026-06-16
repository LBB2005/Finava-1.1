import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  getAggregates: vi.fn(),
  getAlpacaBars: vi.fn(),
  hasAlpacaData: vi.fn(),
}));

vi.mock("@/lib/polygon", () => ({
  getAggregates: deps.getAggregates,
}));

vi.mock("@/lib/alpaca", () => ({
  getAlpacaBars: deps.getAlpacaBars,
  hasAlpacaData: deps.hasAlpacaData,
}));

async function loadFinnhub() {
  vi.resetModules();
  return import("./finnhub");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
  vi.clearAllMocks();
  delete process.env.FINNHUB_API_KEY;
  delete process.env.POLYGON_API_KEY;
  deps.hasAlpacaData.mockReturnValue(false);
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Finnhub quote and simple endpoints", () => {
  it("normalizes quote snapshots and preserves quote timestamp freshness", async () => {
    process.env.FINNHUB_API_KEY = "fh_key";
    const { getQuote } = await loadFinnhub();
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ c: 195, d: 2, dp: 1.04, h: 198, l: 190, o: 191, pc: 193, t: 1_800_000_000 })
    );

    await expect(getQuote("AAPL")).resolves.toEqual({
      ticker: "AAPL",
      price: 195,
      change: 2,
      changePct: 1.04,
      volume: 0,
      high: 198,
      low: 190,
      open: 191,
      prevClose: 193,
      asOf: "2027-01-15T08:00:00.000Z",
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://finnhub.io/api/v1/quote?symbol=AAPL&token=fh_key",
      expect.objectContaining({ next: { revalidate: 30 } })
    );
  });

  it("rejects zero-price quotes and drops failed snapshots from batches", async () => {
    process.env.FINNHUB_API_KEY = "fh_key";
    const { getQuote, getSnapshots } = await loadFinnhub();
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ c: 0 }))
      .mockResolvedValueOnce(Response.json({ c: 10, t: 0 }))
      .mockResolvedValueOnce(Response.json({ c: 0 }));

    await expect(getQuote("BAD")).rejects.toThrow("No quote available for BAD");
    await expect(getSnapshots(["OK", "BAD"])).resolves.toEqual([
      expect.objectContaining({ ticker: "OK", price: 10, asOf: "2026-06-15T12:00:00.000Z" }),
    ]);
  });

  it("calls each read-only endpoint with the correct provider path and cache TTL", async () => {
    process.env.FINNHUB_API_KEY = "fh_key";
    const mod = await loadFinnhub();
    vi.mocked(fetch).mockImplementation(async () => Response.json({ ok: true }));

    await mod.getCompanyNews("AAPL", "2026-01-01", "2026-01-31");
    await mod.getMarketNews();
    await mod.getFinancialsReported("AAPL", "quarterly");
    await mod.getBasicFinancials("AAPL");
    await mod.getEarnings("AAPL");
    await mod.getEarningsCalendar("2026-01-01", "2026-01-31", "AAPL");
    await mod.getInsiderTransactions("AAPL");
    await mod.getRecommendationTrends("AAPL");
    await mod.getPriceTarget("AAPL");
    await mod.getCompanyProfile("AAPL");
    await mod.getPeers("AAPL");

    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(urls).toEqual([
      "https://finnhub.io/api/v1/company-news?symbol=AAPL&from=2026-01-01&to=2026-01-31&token=fh_key",
      "https://finnhub.io/api/v1/news?category=general&token=fh_key",
      "https://finnhub.io/api/v1/stock/financials-reported?symbol=AAPL&freq=quarterly&token=fh_key",
      "https://finnhub.io/api/v1/stock/metric?symbol=AAPL&metric=all&token=fh_key",
      "https://finnhub.io/api/v1/stock/earnings?symbol=AAPL&limit=8&token=fh_key",
      "https://finnhub.io/api/v1/calendar/earnings?from=2026-01-01&to=2026-01-31&symbol=AAPL&token=fh_key",
      "https://finnhub.io/api/v1/stock/insider-transactions?symbol=AAPL&token=fh_key",
      "https://finnhub.io/api/v1/stock/recommendation?symbol=AAPL&token=fh_key",
      "https://finnhub.io/api/v1/stock/price-target?symbol=AAPL&token=fh_key",
      "https://finnhub.io/api/v1/stock/profile2?symbol=AAPL&token=fh_key",
      "https://finnhub.io/api/v1/stock/peers?symbol=AAPL&token=fh_key",
    ]);
    expect(vi.mocked(fetch).mock.calls[3][1]).toMatchObject({ next: { revalidate: 3600 } });
    expect(vi.mocked(fetch).mock.calls[7][1]).toMatchObject({ next: { revalidate: 21600 } });
  });
});

describe("Finnhub candle fallback", () => {
  it("uses Finnhub candles when configured and populated", async () => {
    process.env.FINNHUB_API_KEY = "fh_key";
    const { getCandles } = await loadFinnhub();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ s: "ok", c: [1], o: [1], h: [2], l: [1], v: [100], t: [1] }));

    await expect(getCandles("AAPL", "D", 10, 20)).resolves.toMatchObject({ s: "ok", c: [1] });
    expect(deps.getAlpacaBars).not.toHaveBeenCalled();
    expect(deps.getAggregates).not.toHaveBeenCalled();
  });

  it("falls back to Alpaca when Finnhub is empty or errors", async () => {
    process.env.FINNHUB_API_KEY = "fh_key";
    const { getCandles } = await loadFinnhub();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ s: "no_data", c: [] }));
    deps.hasAlpacaData.mockReturnValueOnce(true);
    deps.getAlpacaBars.mockResolvedValueOnce({ s: "ok", c: [2], o: [1], h: [2], l: [1], v: [100], t: [10] });

    await expect(getCandles("AAPL", "5", 10, 20)).resolves.toMatchObject({ s: "ok", c: [2] });
    expect(deps.getAlpacaBars).toHaveBeenCalledWith("AAPL", "5", 10, 20);
  });

  it("falls through to Polygon and reshapes aggregate bars", async () => {
    process.env.FINNHUB_API_KEY = "fh_key";
    process.env.POLYGON_API_KEY = "poly_key";
    const { getCandles } = await loadFinnhub();
    vi.mocked(fetch).mockRejectedValueOnce(new Error("403"));
    deps.hasAlpacaData.mockReturnValueOnce(true);
    deps.getAlpacaBars.mockRejectedValueOnce(new Error("alpaca down"));
    deps.getAggregates.mockResolvedValueOnce({
      results: [{ o: 1, h: 3, l: 0.5, c: 2, v: 1000, t: 1_800_000_000_000 }],
    });

    await expect(getCandles("AAPL", "60", 1_800_000_000, 1_800_086_400)).resolves.toEqual({
      s: "ok",
      c: [2],
      o: [1],
      h: [3],
      l: [0.5],
      v: [1000],
      t: [1_800_000_000],
    });
    expect(deps.getAggregates).toHaveBeenCalledWith("AAPL", 60, "minute", "2027-01-15", "2027-01-16");
  });

  it("returns no_data when no candle source is configured", async () => {
    const { getCandles } = await loadFinnhub();

    await expect(getCandles("AAPL", "D", 10, 20)).resolves.toEqual({
      s: "no_data",
      c: [],
      o: [],
      h: [],
      l: [],
      v: [],
      t: [],
    });
  });
});
