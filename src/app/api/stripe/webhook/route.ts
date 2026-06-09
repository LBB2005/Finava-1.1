/**
 * Stripe webhook — the ONLY writer of plan/subscription state into Firestore.
 *
 * - Verifies the signature against the RAW request body (Next.js App Router:
 *   `await req.text()` gives the raw bytes; no bodyParser config needed).
 * - Idempotent: each `event.id` is recorded in `stripeEvents/{id}` and duplicate
 *   deliveries short-circuit (Stripe retries on any non-2xx).
 * - Maps Stripe subscription status + price id → our plan name + status.
 */
import type Stripe from "stripe";
import * as admin from "firebase-admin";
import { db } from "@/lib/firebase-admin";
import {
  stripe,
  stripeConfigured,
  mapSubscriptionToPlan,
  periodEndISO,
} from "@/lib/stripe";

export const runtime = "nodejs";

const FieldValue = admin.firestore.FieldValue;

export async function POST(req: Request) {
  if (!stripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return new Response("Billing not configured", { status: 503 });
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "bad signature";
    console.error("[stripe/webhook] signature verification failed:", msg);
    return new Response(`Webhook error: ${msg}`, { status: 400 });
  }

  // ── Idempotency: record-once, short-circuit duplicates ──
  try {
    await db.collection("stripeEvents").doc(event.id).create({
      type: event.type,
      receivedAt: new Date().toISOString(),
    });
  } catch (e) {
    // ALREADY_EXISTS (gRPC code 6) → we've already handled this event.
    if ((e as { code?: number }).code === 6) {
      return new Response("Duplicate, ignored", { status: 200 });
    }
    console.error("[stripe/webhook] idempotency write failed:", e);
    // Fall through and still try to handle — a 500 would make Stripe retry.
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const uid = await resolveUid({
          firebaseUid:
            (session.client_reference_id as string | null) ??
            (session.metadata?.firebaseUid as string | undefined),
          customerId: asId(session.customer),
        });
        if (!uid) break;

        const patch: Record<string, unknown> = {
          stripeCustomerId: asId(session.customer),
          stripeSubscriptionId: asId(session.subscription),
          // Paid now supersedes any running trial.
          trialEndsAt: null,
        };
        const subId = asId(session.subscription);
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          Object.assign(patch, subscriptionPatch(sub));
        }
        await writeSettings(uid, patch);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const uid = await resolveUid({
          firebaseUid: sub.metadata?.firebaseUid,
          customerId: asId(sub.customer),
        });
        if (!uid) break;
        await writeSettings(uid, {
          stripeSubscriptionId: sub.id,
          ...subscriptionPatch(sub),
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const uid = await resolveUid({
          firebaseUid: sub.metadata?.firebaseUid,
          customerId: asId(sub.customer),
        });
        if (!uid) break;
        await writeSettings(uid, {
          plan: "Free",
          subscriptionStatus: "canceled",
          stripeSubscriptionId: FieldValue.delete(),
          currentPeriodEnd: FieldValue.delete(),
          cancelAtPeriodEnd: FieldValue.delete(),
        });
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const uid = await resolveUid({ customerId: asId(invoice.customer) });
        if (!uid) break;
        const patch: Record<string, unknown> = { subscriptionStatus: "active" };
        const subId = invoiceSubscriptionId(invoice);
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          patch.currentPeriodEnd = periodEndISO(sub);
        }
        await writeSettings(uid, patch);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const uid = await resolveUid({ customerId: asId(invoice.customer) });
        if (!uid) break;
        await writeSettings(uid, { subscriptionStatus: "past_due" });
        break;
      }

      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break;
    }
  } catch (err) {
    console.error(`[stripe/webhook] handler error (${event.type}):`, err);
    // 500 → Stripe will retry; the idempotency guard makes the retry safe.
    return new Response("Handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalize a Stripe id-or-expanded-object field to its string id (or null). */
function asId(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

/** Extract the subscription id from an invoice across API-version shapes. */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const direct = (invoice as unknown as { subscription?: string | { id: string } })
    .subscription;
  if (direct) return asId(direct);
  const line = invoice.lines?.data?.[0] as
    | { subscription?: string | { id: string } }
    | undefined;
  return line?.subscription ? asId(line.subscription) : null;
}

/** The Firestore patch derived from a subscription object. */
function subscriptionPatch(sub: Stripe.Subscription): Record<string, unknown> {
  const { plan, subscriptionStatus } = mapSubscriptionToPlan(sub);
  return {
    plan,
    subscriptionStatus,
    currentPeriodEnd: periodEndISO(sub),
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
  };
}

async function writeSettings(
  uid: string,
  patch: Record<string, unknown>
): Promise<void> {
  await db.collection("userSettings").doc(uid).set(patch, { merge: true });
}

/**
 * Resolve our Firebase uid from event data. Order: explicit firebaseUid →
 * lookup by stored stripeCustomerId → read it off the Stripe customer metadata.
 */
async function resolveUid(opts: {
  firebaseUid?: string | null;
  customerId?: string | null;
}): Promise<string | null> {
  if (opts.firebaseUid) return opts.firebaseUid;

  if (opts.customerId) {
    const q = await db
      .collection("userSettings")
      .where("stripeCustomerId", "==", opts.customerId)
      .limit(1)
      .get();
    if (!q.empty) return q.docs[0].id;

    try {
      const customer = await stripe.customers.retrieve(opts.customerId);
      if (!customer.deleted) {
        const uid = customer.metadata?.firebaseUid;
        if (uid) return uid;
      }
    } catch (e) {
      console.error("[stripe/webhook] customer lookup failed:", e);
    }
  }

  console.warn("[stripe/webhook] could not resolve uid for event");
  return null;
}
