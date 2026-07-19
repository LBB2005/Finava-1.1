import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  whereGet: vi.fn(),
  docSet: vi.fn(),
  stripeConfigured: vi.fn(),
  retrieve: vi.fn(),
  mapSubscriptionToPlan: vi.fn(),
  periodEndISO: vi.fn(),
  deleteField: { __delete: true },
}));

vi.mock("firebase-admin", () => ({
  firestore: { FieldValue: { delete: vi.fn(() => deps.deleteField) } },
}));

vi.mock("@/lib/firebase-admin", () => ({
  db: {
    collection: vi.fn(() => ({
      where: vi.fn(() => ({ limit: vi.fn(() => ({ get: deps.whereGet })) })),
    })),
  },
}));

vi.mock("@/lib/stripe", () => ({
  stripeConfigured: deps.stripeConfigured,
  stripe: { subscriptions: { retrieve: deps.retrieve } },
  mapSubscriptionToPlan: deps.mapSubscriptionToPlan,
  periodEndISO: deps.periodEndISO,
}));

import { GET } from "./route";

const SECRET = "cron-secret-xyz";

function cronRequest(secret: string | null = SECRET) {
  return new Request("http://test.local/api/cron/reconcile-subscriptions", {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

function doc(id: string, data: Record<string, unknown>) {
  return { id, data: () => data, ref: { set: deps.docSet } };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", SECRET);
  deps.stripeConfigured.mockReturnValue(true);
  deps.mapSubscriptionToPlan.mockReturnValue({ plan: "Pro", subscriptionStatus: "active" });
  deps.periodEndISO.mockReturnValue("2027-01-15T08:00:00.000Z");
  deps.retrieve.mockResolvedValue({ id: "sub_1", cancel_at_period_end: false });
  deps.whereGet.mockResolvedValue({ docs: [] });
});

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/cron/reconcile-subscriptions", () => {
  it("401s without a valid CRON_SECRET bearer token", async () => {
    const res = await GET(cronRequest(null));
    expect(res.status).toBe(401);
    expect(deps.whereGet).not.toHaveBeenCalled();
  });

  it("401s on a wrong secret", async () => {
    const res = await GET(cronRequest("wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("503s when Stripe is not configured", async () => {
    deps.stripeConfigured.mockReturnValue(false);
    const res = await GET(cronRequest());
    expect(res.status).toBe(503);
  });

  it("rewrites Firestore when it has drifted from Stripe", async () => {
    // Firestore says active/Pro; Stripe now reports the subscription canceled.
    deps.whereGet.mockResolvedValueOnce({
      docs: [doc("u1", { plan: "Pro", subscriptionStatus: "active", stripeSubscriptionId: "sub_1", currentPeriodEnd: "2026-01-01T00:00:00.000Z" })],
    });
    deps.mapSubscriptionToPlan.mockReturnValueOnce({ plan: "Free", subscriptionStatus: "canceled" });
    deps.periodEndISO.mockReturnValueOnce(null);

    const res = await GET(cronRequest());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ checked: 1, updated: 1 });
    expect(deps.docSet).toHaveBeenCalledWith(
      {
        plan: "Free",
        subscriptionStatus: "canceled",
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        pastDueSince: deps.deleteField,
      },
      { merge: true }
    );
  });

  it("does not write when Firestore already matches Stripe", async () => {
    deps.whereGet.mockResolvedValueOnce({
      docs: [doc("u1", { plan: "Pro", subscriptionStatus: "active", stripeSubscriptionId: "sub_1", currentPeriodEnd: "2027-01-15T08:00:00.000Z" })],
    });

    const res = await GET(cronRequest());

    await expect(res.json()).resolves.toMatchObject({ checked: 1, updated: 0 });
    expect(deps.docSet).not.toHaveBeenCalled();
  });

  it("resets to Free when the subscription no longer exists at Stripe", async () => {
    deps.whereGet.mockResolvedValueOnce({
      docs: [doc("u1", { plan: "Quant", subscriptionStatus: "past_due", stripeSubscriptionId: "sub_gone" })],
    });
    deps.retrieve.mockRejectedValueOnce({ code: "resource_missing" });

    const res = await GET(cronRequest());

    await expect(res.json()).resolves.toMatchObject({ updated: 1 });
    expect(deps.docSet).toHaveBeenCalledWith(
      {
        plan: "Free",
        subscriptionStatus: "canceled",
        stripeSubscriptionId: deps.deleteField,
        pastDueSince: deps.deleteField,
      },
      { merge: true }
    );
  });
});
