// Alpaca TRADING API client — account, positions, orders, market calendar.
//
// Separate from src/lib/alpaca.ts, which is market data only (data.alpaca.markets).
// This module talks to the trading host, so it carries the paper-only guard.
//
// `placeOrder` and `cancelOrder` are the only mutators, and both call
// assertPaperHost() before anything leaves the process. getOrderByClientId is
// the defence against the double-fill bug — on a POST timeout the executor looks
// the order up and re-submits only if it is genuinely absent. Never retry a
// POST /orders.
//
// Real capital, if it ever happens, gets its OWN module with its own opt-in and
// its own tests. Inverting this guard in a shared module is how a config typo
// becomes a real-money order.

import { ALPACA_TRADING_BASE, isPaperTradingHost } from "@/lib/alpaca";
import { fetchWithRetry } from "@/lib/fetchRetry";

const TIMEOUT_MS = 10_000;

// Read lazily rather than at module load: a const captured at import freezes the
// value for the life of the process, which makes the module untestable and means
// a rotated key needs a restart to take effect.
function creds(): { key: string | undefined; secret: string | undefined } {
  return { key: process.env.ALPACA_API_KEY, secret: process.env.ALPACA_API_SECRET };
}

export class AlpacaTradingError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string
  ) {
    super(message);
    this.name = "AlpacaTradingError";
  }
}

/**
 * Refuse to act unless the configured trading host is Alpaca's paper sandbox.
 * Every mutator calls this first. Exported so Phase 1's order path and its tests
 * share exactly one definition of "is this safe".
 */
export function assertPaperHost(base: string = ALPACA_TRADING_BASE): void {
  if (!isPaperTradingHost(base)) {
    throw new AlpacaTradingError(
      `Refusing to trade against a non-paper host (${base}). ` +
        `Finava Live is paper-only; set ALPACA_BASE_URL to the paper sandbox.`
    );
  }
}

/** Keys present AND pointed at paper. Routes 503 when false. */
export function alpacaTradingConfigured(base: string = ALPACA_TRADING_BASE): boolean {
  const { key, secret } = creds();
  return Boolean(key && secret) && isPaperTradingHost(base);
}

function authHeaders(): Record<string, string> {
  const { key, secret } = creds();
  return {
    "APCA-API-KEY-ID": key ?? "",
    "APCA-API-SECRET-KEY": secret ?? "",
    accept: "application/json",
  };
}

async function tradingGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const { key, secret } = creds();
  if (!key || !secret) {
    throw new AlpacaTradingError("Alpaca trading credentials are not configured");
  }
  const url = new URL(`${ALPACA_TRADING_BASE}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);

  const res = await fetchWithRetry(
    url.toString(),
    { headers: authHeaders() },
    { timeoutMs: TIMEOUT_MS }
  );
  if (!res.ok) {
    throw new AlpacaTradingError(
      `Alpaca ${path} failed: ${res.status}`,
      res.status,
      await res.text().catch(() => "")
    );
  }
  return (await res.json()) as T;
}

/**
 * POST to the trading host.
 *
 * Separate from tradingGet rather than a `method` parameter on it, so that every
 * call site that can CHANGE something is visibly distinct from one that reads.
 * Deliberately has no retry: fetchWithRetry would re-send a create, and a
 * re-sent order is the exact failure this module is built to avoid. A caller
 * that times out must look the order up, never repeat the POST.
 */
async function tradingPost<T>(path: string, body: unknown): Promise<T> {
  const { key, secret } = creds();
  if (!key || !secret) {
    throw new AlpacaTradingError("Alpaca trading credentials are not configured");
  }
  const res = await fetch(`${ALPACA_TRADING_BASE}${path}`, {
    method: "POST",
    headers: { ...authHeaders(), "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new AlpacaTradingError(
      `Alpaca POST ${path} failed: ${res.status}`,
      res.status,
      await res.text().catch(() => "")
    );
  }
  return (await res.json()) as T;
}

/**
 * Alpaca returns every number as a string. A bad parse must surface as null, not
 * as 0 — a fabricated zero in a book is worse than a missing value, the same
 * discipline getQuote already applies to prices.
 */
export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Same, but for fields where absence genuinely means zero (share counts, P&L). */
function numOr0(value: unknown): number {
  return num(value) ?? 0;
}

export interface AlpacaAccount {
  equity: number;
  lastEquity: number;
  cash: number;
  buyingPower: number;
  portfolioValue: number;
  daytradeCount: number;
  accountBlocked: boolean;
  tradingBlocked: boolean;
  patternDayTrader: boolean;
}

export function parseAccount(raw: Record<string, unknown>): AlpacaAccount {
  return {
    equity: numOr0(raw.equity),
    lastEquity: numOr0(raw.last_equity),
    cash: numOr0(raw.cash),
    buyingPower: numOr0(raw.buying_power),
    portfolioValue: numOr0(raw.portfolio_value),
    daytradeCount: numOr0(raw.daytrade_count),
    accountBlocked: raw.account_blocked === true,
    tradingBlocked: raw.trading_blocked === true,
    patternDayTrader: raw.pattern_day_trader === true,
  };
}

export async function getAccount(): Promise<AlpacaAccount> {
  return parseAccount(await tradingGet<Record<string, unknown>>("/v2/account"));
}

export interface AlpacaPosition {
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  marketValue: number;
  costBasis: number;
  unrealizedPl: number;
  unrealizedPlPct: number;
  currentPrice: number;
  side: "long" | "short";
}

export function parsePosition(raw: Record<string, unknown>): AlpacaPosition {
  return {
    symbol: String(raw.symbol ?? "").toUpperCase(),
    qty: numOr0(raw.qty),
    avgEntryPrice: numOr0(raw.avg_entry_price),
    marketValue: numOr0(raw.market_value),
    costBasis: numOr0(raw.cost_basis),
    unrealizedPl: numOr0(raw.unrealized_pl),
    // Alpaca reports this as a ratio (0.14), the book reports percent (14).
    unrealizedPlPct: numOr0(raw.unrealized_plpc) * 100,
    currentPrice: numOr0(raw.current_price),
    side: raw.side === "short" ? "short" : "long",
  };
}

export async function getPositions(): Promise<AlpacaPosition[]> {
  const raw = await tradingGet<Record<string, unknown>[]>("/v2/positions");
  return raw.map(parsePosition);
}

export interface AlpacaOrder {
  id: string;
  clientOrderId: string;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  filledQty: number;
  filledAvgPrice: number | null;
  status: string;
  submittedAt: string | null;
  filledAt: string | null;
}

export function parseOrder(raw: Record<string, unknown>): AlpacaOrder {
  return {
    id: String(raw.id ?? ""),
    clientOrderId: String(raw.client_order_id ?? ""),
    symbol: String(raw.symbol ?? "").toUpperCase(),
    side: raw.side === "sell" ? "sell" : "buy",
    qty: numOr0(raw.qty),
    filledQty: numOr0(raw.filled_qty),
    // Null until there is a fill — never coerce to 0, that would fake a $0 fill.
    filledAvgPrice: num(raw.filled_avg_price),
    status: String(raw.status ?? "unknown"),
    submittedAt: (raw.submitted_at as string | null) ?? null,
    filledAt: (raw.filled_at as string | null) ?? null,
  };
}

/**
 * Look one order up by its deterministic client id. This is the double-fill
 * defence: after a POST timeout the executor asks "did it actually land?"
 * rather than blindly re-submitting.
 */
export async function getOrderByClientId(clientOrderId: string): Promise<AlpacaOrder | null> {
  try {
    const raw = await tradingGet<Record<string, unknown>>("/v2/orders:by_client_order_id", {
      client_order_id: clientOrderId,
    });
    return parseOrder(raw);
  } catch (err) {
    if (err instanceof AlpacaTradingError && err.status === 404) return null;
    throw err;
  }
}

export async function listOrders(
  opts: { after?: string; status?: "open" | "closed" | "all"; limit?: number } = {}
): Promise<AlpacaOrder[]> {
  const params: Record<string, string> = { status: opts.status ?? "all" };
  if (opts.after) params.after = opts.after;
  if (opts.limit) params.limit = String(opts.limit);
  const raw = await tradingGet<Record<string, unknown>[]>("/v2/orders", params);
  return raw.map(parseOrder);
}

export interface CalendarDay {
  /** YYYY-MM-DD in ET. */
  date: string;
  /** "09:30" */
  open: string;
  /** "16:00" — early closes really are shorter, which is why we read this. */
  close: string;
}

export async function getCalendar(start: string, end: string): Promise<CalendarDay[]> {
  const raw = await tradingGet<Record<string, unknown>[]>("/v2/calendar", { start, end });
  return raw.map((d) => ({
    date: String(d.date ?? ""),
    open: String(d.open ?? ""),
    close: String(d.close ?? ""),
  }));
}

export interface MarketClock {
  timestamp: string;
  isOpen: boolean;
  nextOpen: string;
  nextClose: string;
}

export async function getClock(): Promise<MarketClock> {
  const raw = await tradingGet<Record<string, unknown>>("/v2/clock");
  return {
    timestamp: String(raw.timestamp ?? ""),
    isOpen: raw.is_open === true,
    nextOpen: String(raw.next_open ?? ""),
    nextClose: String(raw.next_close ?? ""),
  };
}

/**
 * Is `tradingDay` a session? The GitHub Actions cron is UTC and drifts across
 * DST, so the run must gate on the exchange calendar rather than on the clock
 * that triggered it.
 */
export function isTradingDay(calendar: CalendarDay[], tradingDay: string): boolean {
  return calendar.some((d) => d.date === tradingDay);
}

// ── Mutators ─────────────────────────────────────────────────────────────────
// Everything below can change the account. assertPaperHost() first, every time.

export interface PlaceOrderInput {
  symbol: string;
  side: "buy" | "sell";
  /** Fractional. Whole-share market-on-open would bias the book toward cheap names. */
  qty: number;
  timeInForce: "day" | "opg";
  /** Deterministic idempotency key, derived from the decision it executes. */
  clientOrderId: string;
}

/**
 * Submit one market order.
 *
 * Returns the existing order when Alpaca rejects the client id as a duplicate,
 * which is what makes a replayed run safe: the second submission of the same
 * decision resolves to the first order instead of doubling the position. A
 * duplicate is a SUCCESS here, not an error — the desired state is "this
 * decision has exactly one order", and it already holds.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<AlpacaOrder> {
  assertPaperHost();
  if (!(input.qty > 0)) {
    throw new AlpacaTradingError(`Refusing to place a non-positive quantity (${input.qty})`);
  }
  try {
    const raw = await tradingPost<Record<string, unknown>>("/v2/orders", {
      symbol: input.symbol.toUpperCase(),
      qty: String(input.qty),
      side: input.side,
      type: "market",
      time_in_force: input.timeInForce,
      client_order_id: input.clientOrderId,
    });
    return parseOrder(raw);
  } catch (err) {
    if (err instanceof AlpacaTradingError && err.status === 422) {
      const existing = await getOrderByClientId(input.clientOrderId);
      if (existing) return existing;
    }
    throw err;
  }
}

/** Cancel a working order. A 404 or 422 means it is already gone or filled. */
export async function cancelOrder(orderId: string): Promise<void> {
  assertPaperHost();
  const { key, secret } = creds();
  if (!key || !secret) {
    throw new AlpacaTradingError("Alpaca trading credentials are not configured");
  }
  const res = await fetch(`${ALPACA_TRADING_BASE}/v2/orders/${encodeURIComponent(orderId)}`, {
    method: "DELETE",
    headers: authHeaders(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok && res.status !== 404 && res.status !== 422) {
    throw new AlpacaTradingError(
      `Alpaca cancel ${orderId} failed: ${res.status}`,
      res.status,
      await res.text().catch(() => "")
    );
  }
}
