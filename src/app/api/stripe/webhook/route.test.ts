import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  createEventDoc: vi.fn(),
  setUserSettings: vi.fn(),
  getUserSettingsQuery: vi.fn(),
  whereUserSettings: vi.fn(),
  stripeConfigured: vi.fn(),
  constructEvent: vi.fn(),
  retrieveSubscription: vi.fn(),
  retrieveCustomer: vi.fn(),
  mapSubscriptionToPlan: vi.fn(),
  periodEndISO: vi.fn(),
  deleteField: { __delete: true },
}));

vi.mock("firebase-admin", () => ({
  firestore: {
    FieldValue: {
      delete: vi.fn(() => deps.deleteField),
    },
  },
}));

vi.mock("@/lib/firebase-admin", () => ({
  db: {
    collection: vi.fn((name: string) => {
      if (name === "stripeEvents") {
        return {
          doc: vi.fn(() => ({ create: deps.createEventDoc })),
        };
      }
      if (name === "userSettings") {
        return {
          doc: vi.fn((id: string) => ({ id, set: deps.setUserSettings })),
          where: deps.whereUserSettings,
        };
      }
      throw new Error(`unexpected collection ${name}`);
    }),
  },
}));

vi.mock("@/lib/stripe", () => ({
  stripeConfigured: deps.stripeConfigured,
  stripe: {
    webhooks: { constructEvent: deps.constructEvent },
    subscriptions: { retrieve: deps.retrieveSubscription },
    customers: { retrieve: deps.retrieveCustomer },
  },
  mapSubscriptionToPlan: deps.mapSubscriptionToPlan,
  periodEndISO: deps.periodEndISO,
}));

import { POST } from "./route";

function webhookRequest(body = "{}", signature = "sig_test") {
  return new Request("http://test.local/api/stripe/webhook", {
    method: "POST",
    headers: signature ? { "stripe-signature": signature } : {},
    body,
  });
}

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_123",
    status: "active",
    cancel_at_period_end: false,
    items: { data: [{ price: { id: "price_pro" }, current_period_end: 1_800_000_000 }] },
    customer: "cus_123",
    metadata: { firebaseUid: "user_123" },
    ...overrides,
  };
}

function event(type: string, object: Record<string, unknown>, id = `evt_${type}`) {
  return { id, type, data: { object } };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  deps.stripeConfigured.mockReturnValue(true);
  deps.constructEvent.mockReturnValue(event("customer.subscription.updated", subscription()));
  deps.createEventDoc.mockResolvedValue(undefined);
  deps.setUserSettings.mockResolvedValue(undefined);
  deps.mapSubscriptionToPlan.mockReturnValue({
    plan: "Pro",
    subscriptionStatus: "active",
  });
  deps.periodEndISO.mockReturnValue("2027-01-15T08:00:00.000Z");
  deps.retrieveSubscription.mockResolvedValue(subscription());
  deps.retrieveCustomer.mockResolvedValue({
    deleted: false,
    metadata: { firebaseUid: "user_from_customer" },
  });
  deps.getUserSettingsQuery.mockResolvedValue({ empty: true, docs: [] });
  deps.whereUserSettings.mockReturnValue({
    limit: vi.fn(() => ({ get: deps.getUserSettingsQuery })),
  });
});

describe("POST /api/stripe/webhook", () => {
  it("returns 503 when Stripe billing is not configured", async () => {
    deps.stripeConfigured.mockReturnValueOnce(false);

    const res = await POST(webhookRequest());

    expect(res.status).toBe(503);
    await expect(res.text()).resolves.toBe("Billing not configured");
    expect(deps.constructEvent).not.toHaveBeenCalled();
  });

  it("returns 400 when the Stripe signature is missing", async () => {
    const res = await POST(webhookRequest("{}", ""));

    expect(res.status).toBe(400);
    await expect(res.text()).resolves.toBe("Missing signature");
  });

  it("returns 400 when signature verification fails", async () => {
    deps.constructEvent.mockImplementationOnce(() => {
      throw new Error("bad sig");
    });

    const res = await POST(webhookRequest());

    expect(res.status).toBe(400);
    await expect(res.text()).resolves.toBe("Webhook error: bad sig");
    expect(deps.createEventDoc).not.toHaveBeenCalled();
  });

  it("short-circuits duplicate events after idempotency create fails with already exists", async () => {
    deps.createEventDoc.mockRejectedValueOnce({ code: 6 });

    const res = await POST(webhookRequest());

    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toBe("Duplicate, ignored");
    expect(deps.setUserSettings).not.toHaveBeenCalled();
  });

  it("writes subscription state from checkout completion", async () => {
    deps.constructEvent.mockReturnValueOnce(
      event("checkout.session.completed", {
        client_reference_id: "user_checkout",
        customer: "cus_123",
        subscription: "sub_123",
        metadata: {},
      })
    );
    deps.retrieveSubscription.mockResolvedValueOnce(subscription({ id: "sub_123" }));

    const res = await POST(webhookRequest());

    expect(res.status).toBe(200);
    expect(deps.retrieveSubscription).toHaveBeenCalledWith("sub_123");
    expect(deps.setUserSettings).toHaveBeenCalledWith(
      {
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        trialEndsAt: null,
        plan: "Pro",
        subscriptionStatus: "active",
        currentPeriodEnd: "2027-01-15T08:00:00.000Z",
        cancelAtPeriodEnd: false,
      },
      { merge: true }
    );
  });

  it("writes plan and period state from subscription updates", async () => {
    const res = await POST(webhookRequest());

    expect(res.status).toBe(200);
    expect(deps.setUserSettings).toHaveBeenCalledWith(
      {
        stripeSubscriptionId: "sub_123",
        plan: "Pro",
        subscriptionStatus: "active",
        currentPeriodEnd: "2027-01-15T08:00:00.000Z",
        cancelAtPeriodEnd: false,
      },
      { merge: true }
    );
  });

  it("downgrades to Free and deletes subscription fields on subscription deletion", async () => {
    deps.constructEvent.mockReturnValueOnce(
      event("customer.subscription.deleted", subscription({ status: "canceled" }))
    );

    const res = await POST(webhookRequest());

    expect(res.status).toBe(200);
    expect(deps.setUserSettings).toHaveBeenCalledWith(
      {
        plan: "Free",
        subscriptionStatus: "canceled",
        stripeSubscriptionId: deps.deleteField,
        currentPeriodEnd: deps.deleteField,
        cancelAtPeriodEnd: deps.deleteField,
      },
      { merge: true }
    );
  });

  it("refreshes current period end when an invoice is paid", async () => {
    deps.constructEvent.mockReturnValueOnce(
      event("invoice.paid", {
        customer: "cus_123",
        subscription: "sub_invoice",
        lines: { data: [] },
      })
    );
    deps.getUserSettingsQuery.mockResolvedValueOnce({
      empty: false,
      docs: [{ id: "user_by_customer" }],
    });

    const res = await POST(webhookRequest());

    expect(res.status).toBe(200);
    expect(deps.retrieveSubscription).toHaveBeenCalledWith("sub_invoice");
    expect(deps.setUserSettings).toHaveBeenCalledWith(
      {
        subscriptionStatus: "active",
        currentPeriodEnd: "2027-01-15T08:00:00.000Z",
      },
      { merge: true }
    );
  });

  it("marks subscription past_due when an invoice payment fails", async () => {
    deps.constructEvent.mockReturnValueOnce(
      event("invoice.payment_failed", { customer: "cus_123" })
    );
    deps.getUserSettingsQuery.mockResolvedValueOnce({
      empty: false,
      docs: [{ id: "user_by_customer" }],
    });

    const res = await POST(webhookRequest());

    expect(res.status).toBe(200);
    expect(deps.setUserSettings).toHaveBeenCalledWith(
      { subscriptionStatus: "past_due" },
      { merge: true }
    );
  });

  it("returns 500 so Stripe retries when handler logic fails after idempotency", async () => {
    deps.setUserSettings.mockRejectedValueOnce(new Error("write failed"));

    const res = await POST(webhookRequest());

    expect(res.status).toBe(500);
    await expect(res.text()).resolves.toBe("Handler error");
  });
});
