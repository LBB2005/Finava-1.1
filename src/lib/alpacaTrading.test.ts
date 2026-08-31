import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertPaperHost,
  alpacaTradingConfigured,
  parseAccount,
  parsePosition,
  parseOrder,
  isTradingDay,
  num,
  AlpacaTradingError,
  getAccount,
  getPositions,
  getOrderByClientId,
  getCalendar,
  getClock,
} from "./alpacaTrading";

const PAPER = "https://paper-api.alpaca.markets";
const LIVE = "https://api.alpaca.markets";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: () => null },
  };
}

beforeEach(() => {
  vi.stubEnv("ALPACA_API_KEY", "k");
  vi.stubEnv("ALPACA_API_SECRET", "s");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("paper-only guard", () => {
  it("allows the paper sandbox", () => {
    expect(() => assertPaperHost(PAPER)).not.toThrow();
  });

  it("refuses the live host", () => {
    // The single most important assertion in this file.
    expect(() => assertPaperHost(LIVE)).toThrow(AlpacaTradingError);
    expect(() => assertPaperHost(LIVE)).toThrow(/paper-only/);
  });

  it("refuses anything that merely looks like paper", () => {
    expect(() => assertPaperHost("https://api.alpaca.markets/paper")).toThrow(AlpacaTradingError);
  });

  it("reports unconfigured when pointed away from paper, even with keys present", () => {
    expect(alpacaTradingConfigured(PAPER)).toBe(true);
    expect(alpacaTradingConfigured(LIVE)).toBe(false);
  });
});

describe("num", () => {
  it.each([
    ["a numeric string", "12.5", 12.5],
    ["a number", 3, 3],
    ["zero", "0", 0],
  ])("parses %s", (_l, input, expected) => {
    expect(num(input)).toBe(expected);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty string", ""],
    ["nonsense", "abc"],
  ])("returns null for %s rather than fabricating a zero", (_l, input) => {
    expect(num(input)).toBeNull();
  });
});

describe("parsers", () => {
  it("parses an account, coercing Alpaca's stringified numbers", () => {
    expect(
      parseAccount({
        equity: "10250.42",
        last_equity: "10100.00",
        cash: "2000",
        buying_power: "4000",
        portfolio_value: "10250.42",
        daytrade_count: "0",
        account_blocked: false,
        trading_blocked: false,
        pattern_day_trader: false,
      })
    ).toMatchObject({ equity: 10250.42, cash: 2000, accountBlocked: false });
  });

  it("surfaces a blocked account rather than silently defaulting to false", () => {
    expect(parseAccount({ trading_blocked: true }).tradingBlocked).toBe(true);
  });

  it("converts position P&L from Alpaca's ratio to the book's percent", () => {
    const p = parsePosition({
      symbol: "nvda",
      qty: "3.5",
      avg_entry_price: "100",
      market_value: "399",
      cost_basis: "350",
      unrealized_pl: "49",
      unrealized_plpc: "0.14",
      current_price: "114",
      side: "long",
    });
    expect(p.symbol).toBe("NVDA");
    expect(p.unrealizedPlPct).toBeCloseTo(14, 6);
    expect(p.qty).toBe(3.5);
  });

  it("reads a short position as short", () => {
    expect(parsePosition({ symbol: "X", side: "short" }).side).toBe("short");
  });

  it("leaves an unfilled order's average price null, never $0", () => {
    const o = parseOrder({
      id: "o1",
      client_order_id: "2026-09-08-NVDA-buy",
      symbol: "NVDA",
      side: "buy",
      qty: "3",
      filled_qty: "0",
      filled_avg_price: null,
      status: "accepted",
      submitted_at: "2026-09-08T13:30:02Z",
      filled_at: null,
    });
    expect(o.filledAvgPrice).toBeNull();
    expect(o.filledQty).toBe(0);
    expect(o.clientOrderId).toBe("2026-09-08-NVDA-buy");
  });
});

describe("isTradingDay", () => {
  const cal = [
    { date: "2026-09-04", open: "09:30", close: "16:00" },
    { date: "2026-09-08", open: "09:30", close: "16:00" },
  ];

  it("accepts a session on the calendar", () => {
    expect(isTradingDay(cal, "2026-09-08")).toBe(true);
  });

  it("rejects a holiday the exchange calendar omits", () => {
    // Labor Day 2026 — the reason we gate on the calendar, not the cron clock.
    expect(isTradingDay(cal, "2026-09-07")).toBe(false);
  });

  it("rejects a weekend", () => {
    expect(isTradingDay(cal, "2026-09-05")).toBe(false);
  });
});

describe("HTTP behaviour", () => {
  it("sends the Alpaca auth headers to the paper host", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ equity: "1" }));
    vi.stubGlobal("fetch", fetchMock);

    await getAccount();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("paper-api.alpaca.markets/v2/account");
    expect((init.headers as Record<string, string>)["APCA-API-KEY-ID"]).toBe("k");
  });

  it("throws with the status on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ message: "forbidden" }, 403)));
    await expect(getAccount()).rejects.toMatchObject({ status: 403 });
  });

  it("maps a 404 client-order lookup to null, not an error", async () => {
    // A missing order is a real answer — it means the POST never landed, which
    // is exactly what the executor needs to know before re-submitting.
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ message: "not found" }, 404)));
    await expect(getOrderByClientId("2026-09-08-NVDA-buy")).resolves.toBeNull();
  });

  it("still throws on a 500 order lookup — unknown is not the same as absent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 500)));
    await expect(getOrderByClientId("x")).rejects.toBeInstanceOf(AlpacaTradingError);
  });

  it("maps a positions list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse([{ symbol: "aapl", qty: "2", side: "long" }]))
    );
    await expect(getPositions()).resolves.toMatchObject([{ symbol: "AAPL", qty: 2 }]);
  });

  it("passes the calendar window as query params", async () => {
    const fetchMock = vi.fn(async () => jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    await getCalendar("2026-09-01", "2026-09-30");
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toContain("start=2026-09-01");
    expect(url).toContain("end=2026-09-30");
  });

  it("reads the market clock", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ timestamp: "t", is_open: false, next_open: "o", next_close: "c" })
      )
    );
    await expect(getClock()).resolves.toMatchObject({ isOpen: false, nextOpen: "o" });
  });

  it("refuses to call out at all when credentials are missing", async () => {
    vi.stubEnv("ALPACA_API_KEY", "");
    vi.stubEnv("ALPACA_API_SECRET", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(getAccount()).rejects.toThrow(/not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
