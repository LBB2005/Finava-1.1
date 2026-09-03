import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({ fetchWithRetry: vi.fn() }));
vi.mock("@/lib/fetchRetry", () => ({ fetchWithRetry: deps.fetchWithRetry }));

/** Import fresh so the module-level `KEY = process.env.POLYGON_API_KEY` is re-read. */
async function loadPolygon(key: string | null = "test_key") {
  vi.resetModules();
  // `null` means "unset" — passing `undefined` would re-trigger the default.
  vi.stubEnv("POLYGON_API_KEY", key ?? undefined);
  return import("./polygon");
}

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

/** The URL polyFetch built on the most recent call. */
function lastUrl(): string {
  return deps.fetchWithRetry.mock.calls.at(-1)![0] as string;
}

beforeEach(() => {
  vi.clearAllMocks();
  deps.fetchWithRetry.mockResolvedValue(ok({}));
});

describe("polyFetch (via the exported wrappers)", () => {
  it("appends the api key with `?` when the path has no query string", async () => {
    const { getTickerDetails } = await loadPolygon();
    await getTickerDetails("AAPL");
    expect(lastUrl()).toBe("https://api.polygon.io/v3/reference/tickers/AAPL?apiKey=test_key");
  });

  it("appends the api key with `&` when the path already has a query string", async () => {
    const { getOptionsSnapshot } = await loadPolygon();
    await getOptionsSnapshot("AAPL");
    expect(lastUrl()).toBe(
      "https://api.polygon.io/v3/snapshot/options/AAPL?limit=250&apiKey=test_key",
    );
  });

  it("defaults to a 30s revalidate window", async () => {
    const { getTickerDetails } = await loadPolygon();
    await getTickerDetails("AAPL");
    expect(deps.fetchWithRetry.mock.calls.at(-1)![1]).toEqual({ next: { revalidate: 30 } });
  });

  it("caches annual financials for an hour so the S&P sweep can't re-hammer the API", async () => {
    const { getAnnualFinancials } = await loadPolygon();
    await getAnnualFinancials("AAPL");
    expect(deps.fetchWithRetry.mock.calls.at(-1)![1]).toEqual({ next: { revalidate: 3600 } });
  });

  it("throws with the status and path on a non-ok response", async () => {
    const { getTickerDetails } = await loadPolygon();
    deps.fetchWithRetry.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) });
    await expect(getTickerDetails("AAPL")).rejects.toThrow(
      "Polygon 429: /v3/reference/tickers/AAPL",
    );
  });
});

describe("getSnapshots", () => {
  it("short-circuits on an empty ticker list without calling the API", async () => {
    const { getSnapshots } = await loadPolygon();
    await expect(getSnapshots([])).resolves.toEqual([]);
    expect(deps.fetchWithRetry).not.toHaveBeenCalled();
  });

  it("maps the snapshot payload and comma-joins the tickers", async () => {
    const { getSnapshots } = await loadPolygon();
    deps.fetchWithRetry.mockResolvedValueOnce(
      ok({
        tickers: [
          {
            ticker: "AAPL",
            day: { c: 190.5, v: 1_000_000 },
            todaysChange: 2.5,
            todaysChangePerc: 1.33,
            updated: 1700,
          },
        ],
      }),
    );
    await expect(getSnapshots(["AAPL", "MSFT"])).resolves.toEqual([
      { ticker: "AAPL", price: 190.5, change: 2.5, changePct: 1.33, volume: 1_000_000, timestamp: 1700 },
    ]);
    expect(lastUrl()).toContain("tickers=AAPL,MSFT");
  });

  it("falls back to the last trade price when the day bar has no close", async () => {
    const { getSnapshots } = await loadPolygon();
    deps.fetchWithRetry.mockResolvedValueOnce(
      ok({ tickers: [{ ticker: "AAPL", day: {}, lastTrade: { p: 188 } }] }),
    );
    const [snap] = await getSnapshots(["AAPL"]);
    expect(snap.price).toBe(188);
  });

  it("zero-fills price, change and volume when nothing is reported", async () => {
    const { getSnapshots } = await loadPolygon();
    deps.fetchWithRetry.mockResolvedValueOnce(ok({ tickers: [{ ticker: "AAPL" }] }));
    const [snap] = await getSnapshots(["AAPL"]);
    expect(snap).toMatchObject({ price: 0, change: 0, changePct: 0, volume: 0 });
    expect(typeof snap.timestamp).toBe("number");
  });

  it("returns [] when the payload carries no tickers array", async () => {
    const { getSnapshots } = await loadPolygon();
    deps.fetchWithRetry.mockResolvedValueOnce(ok({}));
    await expect(getSnapshots(["AAPL"])).resolves.toEqual([]);
  });
});

describe("the remaining endpoint wrappers", () => {
  it("builds the aggregates range path", async () => {
    const { getAggregates } = await loadPolygon();
    await getAggregates("AAPL", 1, "day", "2026-01-01", "2026-02-01");
    expect(lastUrl()).toContain("/v2/aggs/ticker/AAPL/range/1/day/2026-01-01/2026-02-01");
    expect(lastUrl()).toContain("adjusted=true&sort=asc&limit=500");
  });

  it("repeats the ticker param for each name in a news query", async () => {
    const { getNews } = await loadPolygon();
    await getNews(["AAPL", "MSFT"], 5);
    expect(lastUrl()).toContain("ticker=AAPL&ticker=MSFT");
    expect(lastUrl()).toContain("limit=5");
  });

  it("defaults the news limit to 20", async () => {
    const { getNews } = await loadPolygon();
    await getNews(["AAPL"]);
    expect(lastUrl()).toContain("limit=20");
  });

  it("requests four annual periods for financials", async () => {
    const { getFinancials } = await loadPolygon();
    await getFinancials("AAPL");
    expect(lastUrl()).toContain("timeframe=annual&limit=4");
  });

  it("getMarketSnapshot asks for SPY plus the sector ETFs in one call", async () => {
    const { getMarketSnapshot } = await loadPolygon();
    deps.fetchWithRetry.mockResolvedValueOnce(ok({ tickers: [] }));
    await getMarketSnapshot();
    expect(deps.fetchWithRetry).toHaveBeenCalledTimes(1);
    expect(lastUrl()).toContain("tickers=SPY,QQQ,IWM,XLK,XLF,XLV,XLE,XLY,XLI,XLP");
  });
});
