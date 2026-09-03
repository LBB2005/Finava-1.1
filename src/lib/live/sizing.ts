// Turning an approved decision into an order's numbers.
//
// Pure and separate from the route on purpose. A wrong quantity here is the most
// expensive class of bug in the system — it does not throw, it does not show up
// in a log, it just puts the wrong amount of money into a name and the error
// only surfaces weeks later in a return series nobody can reconstruct. Being
// pure means every branch is testable without a broker, a clock or a database.

import { createHash } from "node:crypto";

/**
 * Alpaca accepts fractional quantities to nine decimal places. Six is plenty for
 * a $10k book — a millionth of a share of a $500 stock is a twentieth of a cent —
 * and it keeps the submitted string short and exact rather than trailing float
 * noise into the order.
 */
export const QTY_DECIMALS = 6;

/**
 * Shares to buy for a target weight, or null when it cannot be computed.
 *
 * Null rather than zero for a bad price: zero is a legitimate answer that means
 * "buy nothing", and conflating "the mandate says no" with "we could not read a
 * price" is how a data outage becomes an invisible decision not to trade.
 */
export function orderQty(
  targetWeightPct: number,
  equity: number,
  price: number | null
): number | null {
  if (price === null || !Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(equity) || equity <= 0) return null;
  if (!Number.isFinite(targetWeightPct) || targetWeightPct <= 0) return 0;

  const notional = (targetWeightPct / 100) * equity;
  const raw = notional / price;
  // Floor, never round: rounding up can ask for marginally more cash than the
  // weight allows, and a rail that says "at most 12%" must not be beaten by a
  // rounding rule nobody reading the mandate would think to check.
  const factor = 10 ** QTY_DECIMALS;
  return Math.floor(raw * factor) / factor;
}

/**
 * The deterministic idempotency key for a decision's order.
 *
 * Deterministic is the whole point: a replayed run submits the same id, Alpaca
 * rejects the duplicate, and the executor resolves it to the order that already
 * exists instead of doubling the position.
 *
 * Alpaca caps client order ids at 48 characters. A decision id is normally well
 * inside that (`2026-09-02-ACGL-entry`), but ticker and kind are not bounded by
 * anything this module controls, so an over-long id degrades to a hash of itself
 * rather than being silently truncated — truncation could collide two different
 * decisions onto one order, which is precisely the bug this key prevents.
 */
export const MAX_CLIENT_ORDER_ID = 48;

export function clientOrderId(decisionId: string): string {
  if (decisionId.length <= MAX_CLIENT_ORDER_ID) return decisionId;
  return createHash("sha256").update(decisionId).digest("hex").slice(0, MAX_CLIENT_ORDER_ID);
}

/**
 * Execution quality against the session's official opening print, in basis
 * points. Positive means the book paid more than the open on a buy.
 *
 * Null when either price is missing: a fabricated zero would read as "executed
 * perfectly", which is the most flattering possible lie about a number whose
 * entire purpose is to be unflattering.
 */
export function slippageBps(
  side: "buy" | "sell",
  filledAvgPrice: number | null,
  officialOpen: number | null
): number | null {
  if (filledAvgPrice === null || officialOpen === null) return null;
  if (!Number.isFinite(filledAvgPrice) || !Number.isFinite(officialOpen)) return null;
  if (officialOpen <= 0) return null;

  const diff = (filledAvgPrice - officialOpen) / officialOpen;
  // A sell that fills BELOW the open is the adverse direction, so flip the sign
  // to keep "positive is worse" true for both sides. One convention, or the
  // published slippage column means two different things in the same table.
  const signed = side === "buy" ? diff : -diff;
  return Math.round(signed * 10_000 * 100) / 100;
}
