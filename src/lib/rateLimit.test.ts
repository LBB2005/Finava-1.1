import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetBuckets, clientKey, consumeToken, rateLimitGuard, userRateLimit } from "./rateLimit";

beforeEach(() => {
  _resetBuckets();
  vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
});

describe("rateLimit", () => {
  it("consumes burst tokens and refills over elapsed time", () => {
    expect(consumeToken("quotes:ip", { capacity: 2, refillPerSec: 1 })).toBe(true);
    expect(consumeToken("quotes:ip", { capacity: 2, refillPerSec: 1 })).toBe(true);
    expect(consumeToken("quotes:ip", { capacity: 2, refillPerSec: 1 })).toBe(false);

    vi.setSystemTime(new Date("2026-06-15T12:00:01Z"));

    expect(consumeToken("quotes:ip", { capacity: 2, refillPerSec: 1 })).toBe(true);
  });

  it("keys anonymous requests from the first forwarded IP", () => {
    const req = new Request("http://localhost/api/quotes", {
      headers: { "x-forwarded-for": " 203.0.113.5, 10.0.0.2 " },
    });

    expect(clientKey(req)).toBe("203.0.113.5");
    expect(clientKey(new Request("http://localhost/api/quotes"))).toBe("anonymous");
  });

  it("returns retryable 429 responses for exhausted user and request buckets", async () => {
    expect(await userRateLimit("user_123", "agent", { capacity: 1, refillPerSec: 0 })).toBeNull();
    const userBlocked = await userRateLimit("user_123", "agent", { capacity: 1, refillPerSec: 0 });

    expect(userBlocked?.status).toBe(429);
    expect(userBlocked?.headers.get("Retry-After")).toBe("10");
    await expect(userBlocked?.json()).resolves.toEqual({
      error: "Too many requests — slow down and try again shortly.",
    });

    const req = new Request("http://localhost/api/quotes", {
      headers: { "x-forwarded-for": "203.0.113.9" },
    });
    expect(await rateLimitGuard(req, "quotes", { capacity: 1, refillPerSec: 0 })).toBeNull();
    expect((await rateLimitGuard(req, "quotes", { capacity: 1, refillPerSec: 0 }))?.status).toBe(429);
  });
});
