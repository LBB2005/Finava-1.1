import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { consumeToken, clientKey, rateLimitGuard, _resetBuckets } from "./rateLimit";

beforeEach(() => {
  _resetBuckets();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("consumeToken", () => {
  it("allows up to capacity calls in a burst, then denies", () => {
    const opts = { capacity: 3, refillPerSec: 1 };
    expect(consumeToken("k", opts)).toBe(true);
    expect(consumeToken("k", opts)).toBe(true);
    expect(consumeToken("k", opts)).toBe(true);
    expect(consumeToken("k", opts)).toBe(false);
  });

  it("refills over time", () => {
    const opts = { capacity: 2, refillPerSec: 1 };
    consumeToken("k", opts);
    consumeToken("k", opts);
    expect(consumeToken("k", opts)).toBe(false);
    vi.advanceTimersByTime(1500);
    expect(consumeToken("k", opts)).toBe(true);
    expect(consumeToken("k", opts)).toBe(false);
  });

  it("never refills past capacity", () => {
    const opts = { capacity: 2, refillPerSec: 10 };
    consumeToken("k", opts);
    vi.advanceTimersByTime(60_000);
    expect(consumeToken("k", opts)).toBe(true);
    expect(consumeToken("k", opts)).toBe(true);
    expect(consumeToken("k", opts)).toBe(false);
  });

  it("tracks keys independently", () => {
    const opts = { capacity: 1, refillPerSec: 0.1 };
    expect(consumeToken("a", opts)).toBe(true);
    expect(consumeToken("a", opts)).toBe(false);
    expect(consumeToken("b", opts)).toBe(true);
  });
});

describe("clientKey", () => {
  it("uses the first hop of x-forwarded-for", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(clientKey(req)).toBe("1.2.3.4");
  });

  it("falls back to a shared key without the header", () => {
    expect(clientKey(new Request("http://x"))).toBe("anonymous");
  });
});

describe("rateLimitGuard", () => {
  it("returns null while allowed, then a 429 with Retry-After", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "9.9.9.9" } });
    const opts = { capacity: 1, refillPerSec: 0.01 };
    expect(rateLimitGuard(req, "quotes", opts)).toBeNull();
    const res = rateLimitGuard(req, "quotes", opts);
    expect(res?.status).toBe(429);
    expect(res?.headers.get("Retry-After")).toBe("10");
  });

  it("scopes limits per route", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "9.9.9.9" } });
    const opts = { capacity: 1, refillPerSec: 0.01 };
    expect(rateLimitGuard(req, "quotes", opts)).toBeNull();
    expect(rateLimitGuard(req, "stock", opts)).toBeNull();
  });
});
