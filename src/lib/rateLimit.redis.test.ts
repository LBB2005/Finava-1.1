// The shared-store path. rateLimit.ts constructs its Redis client once at module
// load from env, so each case re-imports the module with the env it needs. The
// property that matters most: an unreachable Redis degrades to per-instance
// throttling rather than dropping the guard.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  redisCtor: vi.fn(),
  limit: vi.fn(),
  tokenBucket: vi.fn((refillRate: number, interval: string, maxTokens: number) => ({
    __bucket: { refillRate, interval, maxTokens },
  })),
  ratelimitCtor: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor(opts: { url: string; token: string }) {
      deps.redisCtor(opts);
    }
  },
}));

vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    static tokenBucket = deps.tokenBucket;
    limit = deps.limit;
    constructor(opts: unknown) {
      deps.ratelimitCtor(opts);
    }
  }
  return { Ratelimit, default: Ratelimit };
});

/** Import fresh so the module-level Redis singleton is rebuilt from env. */
async function loadRateLimit(env: { url?: string; token?: string } = {}) {
  vi.resetModules();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", env.url);
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", env.token);
  return import("./rateLimit");
}

const CONFIGURED = { url: "https://x.upstash.io", token: "tok" };

beforeEach(() => {
  vi.clearAllMocks();
  deps.limit.mockResolvedValue({ success: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("usingSharedStore", () => {
  it("is true when both Upstash vars are set", async () => {
    const { usingSharedStore } = await loadRateLimit(CONFIGURED);
    expect(usingSharedStore()).toBe(true);
    expect(deps.redisCtor).toHaveBeenCalledWith(CONFIGURED);
  });

  it("is false when either var is missing", async () => {
    expect((await loadRateLimit({})).usingSharedStore()).toBe(false);
    expect((await loadRateLimit({ url: CONFIGURED.url })).usingSharedStore()).toBe(false);
    expect((await loadRateLimit({ token: CONFIGURED.token })).usingSharedStore()).toBe(false);
    expect(deps.redisCtor).not.toHaveBeenCalled();
  });
});

describe("the shared-store limiter", () => {
  it("allows a request the shared store permits", async () => {
    const { userRateLimit } = await loadRateLimit(CONFIGURED);
    await expect(userRateLimit("u1", "chat")).resolves.toBeNull();
    expect(deps.limit).toHaveBeenCalledTimes(1);
  });

  it("429s a request the shared store refuses", async () => {
    const { userRateLimit } = await loadRateLimit(CONFIGURED);
    deps.limit.mockResolvedValueOnce({ success: false });
    const res = await userRateLimit("u1", "chat");
    expect(res!.status).toBe(429);
  });

  it("maps (capacity, refillPerSec) onto a token bucket over a fixed 10s window", async () => {
    const { userRateLimit } = await loadRateLimit(CONFIGURED);
    await userRateLimit("u1", "chat", { capacity: 20, refillPerSec: 2 });
    expect(deps.tokenBucket).toHaveBeenCalledWith(20, "10 s", 20);
  });

  it("floors the refill rate at 1 so a sub-1/s limit still refills", async () => {
    const { userRateLimit } = await loadRateLimit(CONFIGURED);
    await userRateLimit("u1", "chat", { capacity: 5, refillPerSec: 0.01 });
    expect(deps.tokenBucket).toHaveBeenCalledWith(1, "10 s", 5);
  });

  it("reuses one limiter per distinct bucket shape", async () => {
    const { userRateLimit } = await loadRateLimit(CONFIGURED);
    await userRateLimit("u1", "chat", { capacity: 10, refillPerSec: 1 });
    await userRateLimit("u2", "agent", { capacity: 10, refillPerSec: 1 });
    expect(deps.ratelimitCtor).toHaveBeenCalledTimes(1);

    await userRateLimit("u3", "agent", { capacity: 99, refillPerSec: 1 });
    expect(deps.ratelimitCtor).toHaveBeenCalledTimes(2);
  });

  it("namespaces keys by route and disables analytics", async () => {
    const { userRateLimit } = await loadRateLimit(CONFIGURED);
    await userRateLimit("u1", "chat");
    expect(deps.ratelimitCtor).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: "rl", analytics: false }),
    );
    expect(deps.limit).toHaveBeenCalledWith(expect.stringContaining("chat"));
  });

  it("degrades to per-instance throttling when Redis errors, rather than dropping the guard", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { userRateLimit, _resetBuckets } = await loadRateLimit(CONFIGURED);
    _resetBuckets();
    deps.limit.mockRejectedValue(new Error("ECONNRESET"));

    const opts = { capacity: 2, refillPerSec: 0 };
    await expect(userRateLimit("u1", "chat", opts)).resolves.toBeNull();
    await expect(userRateLimit("u1", "chat", opts)).resolves.toBeNull();
    // The in-memory bucket held: the third call is refused.
    expect((await userRateLimit("u1", "chat", opts))!.status).toBe(429);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("logs and falls back when the Redis client cannot be constructed", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    deps.redisCtor.mockImplementationOnce(() => {
      throw new Error("bad url");
    });
    const { usingSharedStore } = await loadRateLimit(CONFIGURED);
    expect(usingSharedStore()).toBe(false);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("uses the in-memory bucket when the shared store is not configured", async () => {
    const { userRateLimit, _resetBuckets } = await loadRateLimit({});
    _resetBuckets();
    await expect(userRateLimit("u1", "chat", { capacity: 1, refillPerSec: 0 })).resolves.toBeNull();
    expect((await userRateLimit("u1", "chat", { capacity: 1, refillPerSec: 0 }))!.status).toBe(429);
    expect(deps.limit).not.toHaveBeenCalled();
  });
});
