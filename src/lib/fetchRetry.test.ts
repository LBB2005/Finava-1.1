import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "./fetchRetry";

// baseDelayMs: 1 keeps the real backoff sleeps sub-millisecond so the suite stays fast
// while still exercising the retry loop end to end.
const fast = { baseDelayMs: 1, timeoutMs: 50 };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchWithRetry", () => {
  it("returns a 2xx response without retrying", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ok: 1 }));
    const res = await fetchWithRetry("https://x/y", {}, fast);
    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 then succeeds", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(Response.json({ ok: 1 }));
    const res = await fetchWithRetry("https://x/y", {}, fast);
    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries 5xx and returns the last response when retries are exhausted", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("boom", { status: 503 }));
    const res = await fetchWithRetry("https://x/y", {}, { ...fast, retries: 3 });
    expect(res.status).toBe(503); // surfaced for the caller to throw on
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry an authoritative 403 or 404 — returns it on the first try", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("nope", { status: 403 }));
    const res = await fetchWithRetry("https://x/y", {}, fast);
    expect(res.status).toBe(403);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries a network error (TypeError) then succeeds", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(Response.json({ ok: 1 }));
    const res = await fetchWithRetry("https://x/y", {}, fast);
    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries a timeout (TimeoutError) and rethrows if it never clears", async () => {
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    vi.mocked(fetch).mockRejectedValue(timeout);
    await expect(fetchWithRetry("https://x/y", {}, { ...fast, retries: 2 })).rejects.toBe(timeout);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a non-transient thrown error (rethrows immediately)", async () => {
    const boom = new Error("403 premium gated");
    vi.mocked(fetch).mockRejectedValueOnce(boom);
    await expect(fetchWithRetry("https://x/y", {}, fast)).rejects.toBe(boom);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("honours a Retry-After header on 429", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("wait", { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(Response.json({ ok: 1 }));
    const res = await fetchWithRetry("https://x/y", {}, fast);
    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("owns the timeout signal per attempt (caller need not pass one)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ok: 1 }));
    await fetchWithRetry("https://x/y", { headers: { "X-Test": "1" } }, fast);
    const init = vi.mocked(fetch).mock.calls[0][1]!;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect((init.headers as Record<string, string>)["X-Test"]).toBe("1");
  });
});
