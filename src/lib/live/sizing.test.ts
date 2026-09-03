import { describe, expect, it } from "vitest";
import { clientOrderId, MAX_CLIENT_ORDER_ID, orderQty, QTY_DECIMALS, slippageBps } from "./sizing";

describe("orderQty", () => {
  it("sizes a weight against equity at the quoted price", () => {
    // 8% of $10,000 is $800; at $100 that is 8 shares.
    expect(orderQty(8, 10_000, 100)).toBe(8);
  });

  it("returns a fractional quantity rather than rounding to whole shares", () => {
    // 5% of $10,000 is $500; at $219 that is 2.283105… shares.
    expect(orderQty(5, 10_000, 219)).toBeCloseTo(2.283105, 6);
  });

  it("floors rather than rounds, so a weight cap cannot be beaten by rounding", () => {
    const qty = orderQty(12, 10_000, 7)!;
    expect(qty * 7).toBeLessThanOrEqual(1200);
    expect(qty).toBe(Math.floor((1200 / 7) * 10 ** QTY_DECIMALS) / 10 ** QTY_DECIMALS);
  });

  it("distinguishes 'buy nothing' from 'no price available'", () => {
    // The mandate saying zero is a decision; a missing price is an outage. They
    // must not collapse into the same value.
    expect(orderQty(0, 10_000, 100)).toBe(0);
    expect(orderQty(8, 10_000, null)).toBeNull();
  });

  it("refuses prices and equity that cannot produce a real quantity", () => {
    expect(orderQty(8, 10_000, 0)).toBeNull();
    expect(orderQty(8, 10_000, -5)).toBeNull();
    expect(orderQty(8, 10_000, Number.NaN)).toBeNull();
    expect(orderQty(8, 0, 100)).toBeNull();
    expect(orderQty(8, Number.NaN, 100)).toBeNull();
  });
});

describe("clientOrderId", () => {
  it("uses the decision id directly when it fits", () => {
    expect(clientOrderId("2026-09-02-ACGL-entry")).toBe("2026-09-02-ACGL-entry");
  });

  it("is stable, so a replayed run submits the same key", () => {
    expect(clientOrderId("2026-09-02-NEM-entry")).toBe(clientOrderId("2026-09-02-NEM-entry"));
  });

  it("hashes an over-long id instead of truncating it", () => {
    // Truncation could map two different decisions onto one order, which is the
    // exact double-fill this key exists to prevent.
    const a = clientOrderId("2026-09-02-" + "A".repeat(60) + "-entry");
    const b = clientOrderId("2026-09-02-" + "A".repeat(60) + "-exit");
    expect(a).toHaveLength(MAX_CLIENT_ORDER_ID);
    expect(b).toHaveLength(MAX_CLIENT_ORDER_ID);
    expect(a).not.toBe(b);
  });
});

describe("slippageBps", () => {
  it("reports a buy above the open as positive", () => {
    expect(slippageBps("buy", 101, 100)).toBe(100);
  });

  it("reports a sell below the open as positive too — positive is always worse", () => {
    expect(slippageBps("sell", 99, 100)).toBe(100);
    expect(slippageBps("sell", 101, 100)).toBe(-100);
  });

  it("returns null rather than a flattering zero when a price is missing", () => {
    expect(slippageBps("buy", null, 100)).toBeNull();
    expect(slippageBps("buy", 101, null)).toBeNull();
    expect(slippageBps("buy", 101, 0)).toBeNull();
  });
});
