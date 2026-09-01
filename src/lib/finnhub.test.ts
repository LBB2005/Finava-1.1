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
      asOfSource: "exchange",
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://finnhub.io/api/v1/quote?symbol=AAPL&token=fh_key",
      expect.objectContaining({ next: { revalidate: 30 } })
    );
  });

  it("marks an undated quote as fetch-timed, not exchange-timed", async () => {
    // Finnhub omits `t`. The fallback timestamp is a statement about when we
    // asked, not about the price, and anything reasoning about what was knowable
    // at a point in time must be able to tell the two apart.
    process.env.FINNHUB_API_KEY = "fh_key";
    const { getQuote } = await loadFinnhub();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ c: 195, d: 2, dp: 1.04 }));

    const quote = await getQuote("AAPL");
    expect(quote.asOfSource).toBe("fetch");
    // Still populated, because the UI reads it either way.
    expect(quote.asOf).toBe("2026-06-15T12:00:00.000Z");
  });

  it("treats a zero exchange timestamp as undated rather than the epoch", async () => {
    process.env.FINNHUB_API_KEY = "fh_key";
    const { getQuote } = await loadFinnhub();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ c: 195, t: 0 }));

    const quote = await getQuote("AAPL");
    expect(quote.asOfSource).toBe("fetch");
    expect(quote.asOf).toBe("2026-06-15T12:00:00.000Z");
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

describe("getSnapshots", () => {
  it("short-circuits an empty ticker list without calling out", async () => {
    process.env.FINNHUB_API_KEY = "fh_key";
    const { getSnapshots } = await loadFinnhub();
    await expect(getSnapshots([])).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("drops the tickers whose quote failed rather than surfacing $0", async () => {
    process.env.FINNHUB_API_KEY = "fh_key";
    const { getSnapshots } = await loadFinnhub();
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ c: 195, d: 2, dp: 1, h: 1, l: 1, o: 1, pc: 193, t: 1 }))
      .mockResolvedValueOnce(new Response("nope", { status: 404 }));

    const out = await getSnapshots(["AAPL", "BADD"]);
    expect(out.map((s) => s.ticker)).toEqual(["AAPL"]);
  });
});

describe("the ownership / peers / search endpoints", () => {
  const url = () => vi.mocked(fetch).mock.calls.at(-1)![0];

  beforeEach(() => {
    process.env.FINNHUB_API_KEY = "fh_key";
    // A Response body can only be read once, so build a fresh one per call.
    vi.mocked(fetch).mockImplementation(async () => Response.json({}));
  });

  it("fetches peers on the default cache window", async () => {
    const { getPeers } = await loadFinnhub();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(["MSFT", "GOOGL"]));
    await expect(getPeers("AAPL")).resolves.toEqual(["MSFT", "GOOGL"]);
    expect(url()).toBe("https://finnhub.io/api/v1/stock/peers?symbol=AAPL&token=fh_key");
  });

  it("caches 13F-derived ownership for 12h — it moves on a quarterly cadence", async () => {
    const { getOwnership, getFundOwnership } = await loadFinnhub();
    await getOwnership("AAPL");
    expect(url()).toContain("/stock/ownership?symbol=AAPL&limit=20");
    expect(vi.mocked(fetch).mock.calls.at(-1)![1]).toMatchObject({ next: { revalidate: 43200 } });

    await getFundOwnership("AAPL");
    expect(url()).toContain("/stock/fund-ownership?symbol=AAPL&limit=20");
    expect(vi.mocked(fetch).mock.calls.at(-1)![1]).toMatchObject({ next: { revalidate: 43200 } });
  });

  it("url-encodes a symbol search and caches it for a day", async () => {
    const { searchSymbol } = await loadFinnhub();
    await searchSymbol("Taiwan Semiconductor & Co");
    expect(url()).toContain("/search?q=Taiwan%20Semiconductor%20%26%20Co");
    expect(vi.mocked(fetch).mock.calls.at(-1)![1]).toMatchObject({ next: { revalidate: 86400 } });
  });

  it("getMarketSnapshot quotes SPY plus the sector ETFs", async () => {
    const { getMarketSnapshot } = await loadFinnhub();
    vi.mocked(fetch).mockImplementation(async () =>
      Response.json({ c: 100, d: 0, dp: 0, h: 1, l: 1, o: 1, pc: 100, t: 1 }),
    );
    await expect(getMarketSnapshot()).resolves.toHaveLength(10);
  });
});

describe("getPeerMetrics", () => {
  beforeEach(() => {
    process.env.FINNHUB_API_KEY = "fh_key";
  });

  /** Reply to /peers with `peers`, then to each /metric call in order. */
  function scriptPeers(peers: string[], metrics: (Record<string, number> | null)[]) {
    const f = vi.mocked(fetch);
    f.mockResolvedValueOnce(Response.json(peers));
    for (const m of metrics) {
      f.mockResolvedValueOnce(
        m === null ? new Response("nope", { status: 403 }) : Response.json({ metric: m }),
      );
    }
  }

  it("takes the median peer P/E and P/S", async () => {
    const { getPeerMetrics } = await loadFinnhub();
    scriptPeers(["MSFT", "GOOGL", "AMZN"], [
      { peTTM: 20, psTTM: 4 },
      { peTTM: 30, psTTM: 6 },
      { peTTM: 40, psTTM: 8 },
    ]);
    await expect(getPeerMetrics("AAPL")).resolves.toEqual({ peerPe: 30, peerPs: 6 });
  });

  it("averages the middle pair for an even peer count", async () => {
    const { getPeerMetrics } = await loadFinnhub();
    scriptPeers(["MSFT", "GOOGL"], [
      { peTTM: 20, psTTM: 4 },
      { peTTM: 30, psTTM: 6 },
    ]);
    await expect(getPeerMetrics("AAPL")).resolves.toEqual({ peerPe: 25, peerPs: 5 });
  });

  it("excludes the subject and caps the peer set at eight", async () => {
    const { getPeerMetrics } = await loadFinnhub();
    const peers = ["AAPL", ...Array.from({ length: 12 }, (_, i) => `P${i}`)];
    scriptPeers(peers, Array.from({ length: 12 }, () => ({ peTTM: 10, psTTM: 2 })));
    await getPeerMetrics("AAPL");
    // 1 peers call + 8 metric calls.
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(9);
    expect(vi.mocked(fetch).mock.calls.slice(1).map((c) => String(c[0]))).not.toContain(
      expect.stringContaining("symbol=AAPL"),
    );
  });

  it("ignores a peer whose metrics failed", async () => {
    const { getPeerMetrics } = await loadFinnhub();
    scriptPeers(["MSFT", "GOOGL"], [null, { peTTM: 30, psTTM: 6 }]);
    await expect(getPeerMetrics("AAPL")).resolves.toEqual({ peerPe: 30, peerPs: 6 });
  });

  it("ignores non-positive and missing metric values", async () => {
    const { getPeerMetrics } = await loadFinnhub();
    scriptPeers(["MSFT", "GOOGL"], [{ peTTM: -5 }, { peTTM: 30, psTTM: 6 }]);
    await expect(getPeerMetrics("AAPL")).resolves.toEqual({ peerPe: 30, peerPs: 6 });
  });

  it("returns nulls when every peer metric is unusable", async () => {
    const { getPeerMetrics } = await loadFinnhub();
    scriptPeers(["MSFT"], [null]);
    await expect(getPeerMetrics("AAPL")).resolves.toEqual({ peerPe: null, peerPs: null });
  });

  it("returns nulls when the peers lookup fails", async () => {
    const { getPeerMetrics } = await loadFinnhub();
    vi.mocked(fetch).mockResolvedValueOnce(new Response("nope", { status: 403 }));
    await expect(getPeerMetrics("AAPL")).resolves.toEqual({ peerPe: null, peerPs: null });
  });

  it("returns nulls when the ticker has no peers", async () => {
    const { getPeerMetrics } = await loadFinnhub();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json([]));
    await expect(getPeerMetrics("AAPL")).resolves.toEqual({ peerPe: null, peerPs: null });
  });

  it("tolerates a non-array peers payload", async () => {
    const { getPeerMetrics } = await loadFinnhub();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: "premium" }));
    await expect(getPeerMetrics("AAPL")).resolves.toEqual({ peerPe: null, peerPs: null });
  });
});

describe("the Polygon candle fallback", () => {
  beforeEach(() => {
    process.env.POLYGON_API_KEY = "poly_key";
    // No Finnhub key and no Alpaca → straight to Polygon.
    delete process.env.FINNHUB_API_KEY;
    deps.hasAlpacaData.mockReturnValue(false);
  });

  it("maps W and M resolutions onto Polygon timespans", async () => {
    const { getCandles } = await loadFinnhub();
    deps.getAggregates.mockResolvedValue({ results: [] });

    await getCandles("AAPL", "W", 0, 86_400);
    expect(deps.getAggregates).toHaveBeenLastCalledWith("AAPL", 1, "week", expect.any(String), expect.any(String));

    await getCandles("AAPL", "M", 0, 86_400);
    expect(deps.getAggregates).toHaveBeenLastCalledWith("AAPL", 1, "month", expect.any(String), expect.any(String));
  });

  it("maps a numeric resolution onto minute bars", async () => {
    const { getCandles } = await loadFinnhub();
    deps.getAggregates.mockResolvedValue({ results: [] });
    await getCandles("AAPL", "15", 0, 86_400);
    expect(deps.getAggregates).toHaveBeenLastCalledWith("AAPL", 15, "minute", expect.any(String), expect.any(String));
  });

  it("falls back to daily bars for an unparseable resolution", async () => {
    const { getCandles } = await loadFinnhub();
    deps.getAggregates.mockResolvedValue({ results: [] });
    await getCandles("AAPL", "weekly-ish", 0, 86_400);
    expect(deps.getAggregates).toHaveBeenLastCalledWith("AAPL", 1, "day", expect.any(String), expect.any(String));
  });

  it("reports no_data when Polygon returns no bars", async () => {
    const { getCandles } = await loadFinnhub();
    deps.getAggregates.mockResolvedValue({});
    await expect(getCandles("AAPL", "D", 0, 86_400)).resolves.toEqual({
      s: "no_data", c: [], o: [], h: [], l: [], v: [], t: [],
    });
  });
});
