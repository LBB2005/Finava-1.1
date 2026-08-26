import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFirestoreMock } from "@/test/mocks/firestore";

// ── Mocks at the boundary ────────────────────────────────────────────────────
// firebase-admin: only FieldValue sentinels are used by usage.ts.
vi.mock("firebase-admin", () => ({
  firestore: {
    FieldValue: {
      increment: (n: number) => ({ __inc: n }),
      delete: () => ({ __del: true }),
    },
  },
}));

const fs = makeFirestoreMock();
vi.mock("@/lib/firebase-admin", () => ({ db: fs.db }));

const resolvePlan = vi.fn();
vi.mock("@/lib/entitlements", () => ({ resolvePlan: (id: string) => resolvePlan(id) }));

// Helper: a plan-resolution result of the shape usage.ts consumes.
const plan = (over: Record<string, unknown> = {}) => ({
  plan: "free",
  source: "subscription",
  degraded: false,
  trialEndsAt: null,
  config: {
    daily: 100,
    weekly: 500,
    monthly: 1500,
    deepResearchPerMonth: 5,
  },
  ...over,
});

beforeEach(() => {
  fs.store.clear();
  resolvePlan.mockReset();
  resolvePlan.mockResolvedValue(plan());
});

const today = new Date().toISOString().slice(0, 10);

describe("creditsFor (pure cost-weighting)", () => {
  it("weights output tokens higher than input for a known model", async () => {
    const { creditsFor } = await import("./usage");
    // sonnet: in $3/M, out $15/M → (1000*3 + 1000*15)/1e6 = 0.018 USD → 18 credits.
    expect(creditsFor("anthropic/claude-sonnet-4.6", 1000, 1000)).toBe(18);
  });
  it("discounts cached input tokens to 10% of fresh input", async () => {
    const { creditsFor } = await import("./usage");
    // 1000 in (500 cached): (500*3 + 500*3*0.1 + 1000*15)/1e6 = 0.01665 → 16.65.
    expect(creditsFor("anthropic/claude-sonnet-4.6", 1000, 1000, 500)).toBeCloseTo(16.65, 6);
  });
  it("falls back to the most-expensive tier for an unknown model", async () => {
    const { creditsFor } = await import("./usage");
    // fallback price equals sonnet → same 18 credits, never under-charges.
    expect(creditsFor("totally-unknown-model", 1000, 1000)).toBe(18);
  });
  it("tolerates slug/id drift (anthropic/ prefix)", async () => {
    const { creditsFor } = await import("./usage");
    expect(creditsFor("claude-sonnet-4-6", 1000, 1000)).toBe(18);
    expect(creditsFor("anthropic/claude-sonnet-4-6", 1000, 1000)).toBe(18);
  });
});

describe("recordUsage", () => {
  it("no-ops when there is no userId in scope", async () => {
    const { recordUsage } = await import("./usage");
    await recordUsage({ model: "anthropic/claude-sonnet-4.6", inputTokens: 10, outputTokens: 10 });
    expect(fs.store.size).toBe(0);
  });
  it("no-ops when all token counts are zero", async () => {
    const { recordUsage } = await import("./usage");
    await recordUsage({ userId: "u1", model: "anthropic/claude-sonnet-4.6", inputTokens: 0, outputTokens: 0 });
    expect(fs.store.size).toBe(0);
  });
  it("writes a credit increment under today's bucket for the user", async () => {
    const { recordUsage } = await import("./usage");
    await recordUsage({ userId: "u1", model: "anthropic/claude-sonnet-4.6", inputTokens: 1000, outputTokens: 1000 });
    const doc = fs.store.get("userUsage/u1") as { days?: Record<string, unknown> };
    expect(doc?.days?.[today]).toBeDefined();
  });
  it("honors flatCredits, bypassing token math", async () => {
    const { recordUsage } = await import("./usage");
    await recordUsage({ userId: "u2", model: "sonar", flatCredits: 7 });
    expect(fs.store.get("userUsage/u2")).toBeDefined();
  });
});

describe("checkUsageLimit", () => {
  it("returns null (allow) on a degraded plan read — fail open", async () => {
    resolvePlan.mockResolvedValue(plan({ degraded: true }));
    const { checkUsageLimit } = await import("./usage");
    expect(await checkUsageLimit("u1")).toBeNull();
  });
  it("returns null (allow) for admin/dev source — uncapped", async () => {
    resolvePlan.mockResolvedValue(plan({ source: "admin" }));
    const { checkUsageLimit } = await import("./usage");
    expect(await checkUsageLimit("admin-uid")).toBeNull();
  });
  it("returns null when the user is under their daily cap", async () => {
    fs.store.set("userUsage/u1", { days: { [today]: 10 } });
    const { checkUsageLimit } = await import("./usage");
    expect(await checkUsageLimit("u1")).toBeNull();
  });
  it("returns a 429 when the user is at/over their daily cap", async () => {
    fs.store.set("userUsage/u1", { days: { [today]: 100 } }); // cap is 100
    const { checkUsageLimit } = await import("./usage");
    const res = await checkUsageLimit("u1");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    const body = await res!.json();
    expect(body.error).toBe("limit_reached");
    expect(body.scope).toBe("daily");
  });
  it("fails OPEN for a paid user when the Firestore read throws", async () => {
    // Default plan mock is a paid subscription — a Firestore blip must not lock
    // out a payer, so the read-error path allows the request.
    const { checkUsageLimit } = await import("./usage");
    const spy = vi.spyOn(fs.db, "collection").mockImplementationOnce(() => {
      throw new Error("boom");
    });
    expect(await checkUsageLimit("u1")).toBeNull();
    spy.mockRestore();
  });

  it("fails CLOSED (503) for a free/anon user when the Firestore read throws", async () => {
    // Bounds COGS: an unmetered free user is soft-blocked rather than allowed
    // unbounded spend during a read outage.
    resolvePlan.mockResolvedValue(plan({ source: "free", plan: "Free" }));
    const { checkUsageLimit } = await import("./usage");
    const spy = vi.spyOn(fs.db, "collection").mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const res = await checkUsageLimit("u1");
    expect(res!.status).toBe(503);
    expect((await res!.json()).error).toBe("usage_unavailable");
    spy.mockRestore();
  });
});

describe("getUsageSummary", () => {
  it("reports used vs limit and a 30-day series", async () => {
    fs.store.set("userUsage/u1", { days: { [today]: 25 } });
    const { getUsageSummary } = await import("./usage");
    const s = await getUsageSummary("u1");
    expect(s.plan).toBe("free");
    expect(s.daily.used).toBe(25);
    expect(s.daily.limit).toBe(100);
    expect(s.series).toHaveLength(30);
    expect(s.series[s.series.length - 1].date).toBe(today);
  });
  it("surfaces unlimited caps for admin/dev", async () => {
    resolvePlan.mockResolvedValue(plan({ source: "admin" }));
    fs.store.set("userUsage/u1", { days: { [today]: 25 } });
    const { getUsageSummary } = await import("./usage");
    const s = await getUsageSummary("u1");
    expect(s.daily.limit).toBeNull(); // jsonLimit(Infinity) → null
  });
});
