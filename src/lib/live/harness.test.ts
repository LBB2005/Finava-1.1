import { describe, it, expect, beforeEach, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, Record<string, unknown>>());

// Firestore merges nested MAPS field-by-field rather than replacing them; the
// mock has to do the same or it would mask (or invent) clobbering bugs.
function mergeDoc(
  prior: Record<string, unknown> | undefined,
  next: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(prior ?? {}) };
  for (const [k, v] of Object.entries(next)) {
    const existing = out[k];
    out[k] =
      v && typeof v === "object" && !Array.isArray(v) &&
      existing && typeof existing === "object" && !Array.isArray(existing)
        ? mergeDoc(existing as Record<string, unknown>, v as Record<string, unknown>)
        : v;
  }
  return out;
}

vi.mock("@/lib/firebase-admin", () => {
  const ref = (path: string) => ({
    path,
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
    set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
      store.set(path, mergeDoc(opts?.merge ? store.get(path) : undefined, data));
    },
  });
  return {
    db: {
      collection: (col: string) => ({ doc: (id: string) => ref(`${col}/${id}`) }),
      runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          get: async (r: { path: string }) => ({
            exists: store.has(r.path),
            data: () => store.get(r.path),
          }),
          set: (r: { path: string }, data: Record<string, unknown>) =>
            void store.set(r.path, mergeDoc(store.get(r.path), data)),
          create: (r: { path: string }, data: Record<string, unknown>) => store.set(r.path, data),
        };
        return fn(tx);
      },
    },
  };
});

const requireAdmin = vi.hoisted(() => vi.fn(async () => ({ error: new Response("no") })));
vi.mock("@/lib/requireAdmin", () => ({ requireAdmin }));
vi.mock("@/lib/runContext", async () => {
  const actual = await vi.importActual<typeof import("@/lib/runContext")>("@/lib/runContext");
  return { ...actual, currentRunCredits: () => 1 };
});

import {
  authorizeHarness,
  liveHarnessConfigured,
  easternDay,
  easternMinutes,
  runStep,
} from "./harness";

const SECRET = "s3cret-harness-value";

beforeEach(() => {
  store.clear();
  process.env.LIVE_HARNESS_SECRET = SECRET;
  process.env.LIVE_DAILY_CREDIT_CAP = "1000";
  requireAdmin.mockReset();
  requireAdmin.mockResolvedValue({ error: new Response("no") });
});

function req(headers: Record<string, string> = {}) {
  return new Request("https://finava.ai/api/live/decide", { method: "POST", headers });
}

describe("liveHarnessConfigured", () => {
  it("is false with no secret set", () => {
    delete process.env.LIVE_HARNESS_SECRET;
    expect(liveHarnessConfigured()).toBe(false);
  });

  it("is true once the secret is set", () => {
    expect(liveHarnessConfigured()).toBe(true);
  });
});

describe("authorizeHarness", () => {
  it("503s when the deployment has not opted in", async () => {
    delete process.env.LIVE_HARNESS_SECRET;
    const res = await authorizeHarness(req({ "x-live-secret": SECRET }));
    expect(res?.status).toBe(503);
  });

  it("accepts the shared secret in x-live-secret", async () => {
    expect(await authorizeHarness(req({ "x-live-secret": SECRET }))).toBeNull();
  });

  it("accepts the shared secret as a Bearer token", async () => {
    expect(await authorizeHarness(req({ authorization: `Bearer ${SECRET}` }))).toBeNull();
  });

  it("401s on a wrong secret", async () => {
    const res = await authorizeHarness(req({ "x-live-secret": "wrong-but-same-length!!" }));
    expect(res?.status).toBe(401);
  });

  it("401s with no credentials at all", async () => {
    expect((await authorizeHarness(req()))?.status).toBe(401);
  });

  it("does not accept a prefix of the real secret", async () => {
    const res = await authorizeHarness(req({ "x-live-secret": SECRET.slice(0, 5) }));
    expect(res?.status).toBe(401);
  });

  it("falls through to an admin session when the secret is absent", async () => {
    requireAdmin.mockResolvedValue({ userId: "admin-1" } as never);
    expect(await authorizeHarness(req())).toBeNull();
  });
});

describe("eastern clock", () => {
  it("returns the ET calendar day, not the UTC one", () => {
    // 01:30 UTC on 3 Sep is still 21:30 ET on 2 Sep — the case that would
    // silently file a pre-open run under the wrong trading day.
    expect(easternDay(new Date("2026-09-03T01:30:00Z"))).toBe("2026-09-02");
  });

  it("agrees with UTC during the ET afternoon", () => {
    expect(easternDay(new Date("2026-09-02T18:00:00Z"))).toBe("2026-09-02");
  });

  it("handles the EST side of the DST boundary", () => {
    // January: ET is UTC-5, so 13:30 UTC is 08:30 ET the same day.
    expect(easternDay(new Date("2027-01-15T13:30:00Z"))).toBe("2027-01-15");
    expect(easternMinutes(new Date("2027-01-15T13:30:00Z"))).toBe(8 * 60 + 30);
  });

  it("handles the EDT side", () => {
    // September: ET is UTC-4, so 13:30 UTC is 09:30 ET — the open.
    expect(easternMinutes(new Date("2026-09-02T13:30:00Z"))).toBe(9 * 60 + 30);
  });

  it("renders ET midnight as 0 minutes, not 1440", () => {
    expect(easternMinutes(new Date("2026-09-02T04:00:00Z"))).toBe(0);
  });
});

describe("runStep", () => {
  it("runs the body and records the result", async () => {
    const body = vi.fn(async () => ({ picks: 3 }));
    const out = await runStep("2026-09-02", "scout", body);
    expect(out).toEqual({ result: { picks: 3 }, replayed: false });
    expect(body).toHaveBeenCalledTimes(1);
  });

  it("replays a completed step without re-running it", async () => {
    const body = vi.fn(async () => ({ picks: 3 }));
    await runStep("2026-09-02", "scout", body);

    const second = await runStep("2026-09-02", "scout", body);
    expect(second).toEqual({ result: { picks: 3 }, replayed: true });
    // The whole point: "re-run failed jobs" re-runs succeeded jobs too, and a
    // re-spent crew debate would both cost money and duplicate a ledger entry.
    expect(body).toHaveBeenCalledTimes(1);
  });

  it("keeps steps independent within a run", async () => {
    await runStep("2026-09-02", "scout", async () => "a");
    const other = await runStep("2026-09-02", "wave_0", async () => "b");
    expect(other).toEqual({ result: "b", replayed: false });
  });

  it("keeps runs independent from each other", async () => {
    await runStep("2026-09-02", "scout", async () => "a");
    const next = await runStep("2026-09-03", "scout", async () => "b");
    expect(next.replayed).toBe(false);
    expect(next.result).toBe("b");
  });

  it("does not record a step whose body threw, so a retry re-runs it", async () => {
    await expect(
      runStep("2026-09-02", "wave_0", async () => {
        throw new Error("finnhub 429");
      })
    ).rejects.toThrow("finnhub 429");

    const retry = await runStep("2026-09-02", "wave_0", async () => "recovered");
    expect(retry).toEqual({ result: "recovered", replayed: false });
  });

  it("accumulates spend across steps", async () => {
    await runStep("2026-09-02", "scout", async () => "a");
    await runStep("2026-09-02", "synthesize", async () => "b");
    expect(store.get("liveRuns/2026-09-02")?.creditsSpent).toBe(2);
  });

  it("aborts the run once the daily cap is reached", async () => {
    process.env.LIVE_DAILY_CREDIT_CAP = "1";
    await expect(runStep("2026-09-02", "scout", async () => "a")).rejects.toThrow(
      /budget exceeded/i
    );
  });
});
