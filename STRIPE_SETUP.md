# Stripe Setup — Lucra Billing

This is the operator runbook for wiring Lucra's subscription billing to Stripe.
The app code is already written against these env vars; this doc gets you from a
fresh Stripe account to a working **test-mode** charge flow, then to live.

Everything below is in **Test mode** until the final "Going live" section. The
**Test mode** toggle is in the top-right of the Stripe dashboard.

---

## 1. Get your API keys

1. Create an account at <https://stripe.com> (or log in).
2. Confirm **Test mode** is ON (top-right toggle).
3. **Developers → API keys**. Copy into `.env.local`:
   - **Publishable key** (`pk_test_…`) → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - **Secret key** (`sk_test_…`) → `STRIPE_SECRET_KEY`

## 2. Create the Products & Prices

Create **3 active** products and **1 inactive** (Quant — waitlist). Each product
gets a **monthly** and an **annual** recurring price.

**Products → Add product** for each:

| Product | Monthly price | Annual price | Active? |
| ------- | ------------- | ------------ | ------- |
| Lucra Analyst | $20.00 / month | $200.00 / year | ✅ Active |
| Lucra Pro | $60.00 / month | $600.00 / year | ✅ Active |
| Lucra Quant | $100.00 / month | $1000.00 / year | ⬜ **Inactive** (archive/keep unpublished) |

> Free is not a Stripe object — it's the default app-side tier.

After creating each price, click it and copy the **Price ID** (`price_…`) into
`.env.local`:

```
STRIPE_PRICE_ANALYST_MONTHLY=price_...
STRIPE_PRICE_ANALYST_ANNUAL=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_ANNUAL=price_...
STRIPE_PRICE_QUANT_MONTHLY=price_...   # still create it; checkout is blocked app-side
STRIPE_PRICE_QUANT_ANNUAL=price_...
```

**price → plan mapping** (what the webhook uses, derived from the env above):

| Price id env | Plan | Cadence |
| ------------ | ---- | ------- |
| `STRIPE_PRICE_ANALYST_MONTHLY` | Analyst | monthly |
| `STRIPE_PRICE_ANALYST_ANNUAL` | Analyst | annual |
| `STRIPE_PRICE_PRO_MONTHLY` | Pro | monthly |
| `STRIPE_PRICE_PRO_ANNUAL` | Pro | annual |
| `STRIPE_PRICE_QUANT_*` | Quant | (not sellable yet) |

## 3. Configure the Customer Portal

**Settings → Billing → Customer portal** (or **Developers → … → Portal** in newer
dashboards):

- **Cancellations**: allow, and set **cancel at end of billing period** (so users
  keep access until the period ends — the app assumes this).
- **Subscriptions → Switch plans**: enable, and add the Analyst + Pro prices so
  users can upgrade/downgrade themselves (Stripe handles proration).
- **Invoice history**: enable (powers the "View history" button).
- Save.

## 4. Local webhook testing (Stripe CLI)

Install + log in:

```bash
brew install stripe/stripe-cli/stripe
stripe login
```

With the dev server running (`npm run dev`), in a second terminal:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

It prints a signing secret like `whsec_…`. Put it in `.env.local`:

```
STRIPE_WEBHOOK_SECRET=whsec_...
```

Restart the dev server so it picks up the new env var. Leave `stripe listen`
running while you test — it forwards live Stripe events to your local route.

## 5. End-to-end test

1. In the app: **Settings → Billing → Change plan → Analyst (monthly) → Continue**.
   You're redirected to Stripe Checkout.
2. Pay with test card **`4242 4242 4242 4242`**, any future expiry, any CVC/ZIP.
3. Watch `stripe listen` forward `checkout.session.completed` and
   `customer.subscription.created`. Back in the app, Settings should now show
   **Analyst**, and `userSettings/{uid}` in Firestore should have `plan: "Analyst"`,
   `stripeCustomerId`, `subscriptionStatus: "active"`.

**Trigger lifecycle events manually:**

```bash
stripe trigger invoice.payment_failed       # → subscriptionStatus "past_due", plan retained
stripe trigger customer.subscription.deleted # → plan "Free"
```

**Failure cards:**

- `4000 0000 0000 0341` — attaches but fails on the first charge.
- `4000 0000 0000 9995` — insufficient funds.

**Idempotency check:** resend a delivered event from the dashboard
(**Developers → Events → … → Resend**) or `stripe events resend <evt_id>` — the app
records each `event.id` in the `stripeEvents` Firestore collection and short-circuits
duplicates, so nothing double-applies.

**Portal check:** Settings → **Manage billing** opens the Customer Portal. Cancel a
subscription → the app keeps you on the paid plan until `currentPeriodEnd`, then a
`customer.subscription.deleted` flips you to Free.

## 6. Existing-user migration (one-time, optional)

The app is **non-destructive**: `resolvePlan()` only falls back to `Free` when a
`userSettings` doc has no `plan` field, and every new field is read as `?? null`.
So nothing breaks without a migration.

If you want a clean slate (reset all current testers — who may have a stale
`plan: "Pro"` — to Free), run a one-off admin script against Firestore that, for
every `userSettings/{uid}`, sets `plan: "Free"` and `subscriptionStatus: "none"`.
Do **not** add this as an app route. Grandfathering (leaving existing `plan` values
alone) is also fine for a small beta.

## 7. Going live

1. Flip the dashboard to **Live mode** and repeat steps 1–3 with live keys
   (`sk_live_…`, `pk_live_…`) and live Price ids.
2. **Developers → Webhooks → Add endpoint**: `https://YOUR_DOMAIN/api/stripe/webhook`,
   subscribe to: `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`,
   `invoice.payment_failed`. Copy the endpoint's signing secret into the production
   `STRIPE_WEBHOOK_SECRET`.
3. Set `NEXT_PUBLIC_APP_URL` to the production URL and all the live env vars in your
   host (Vercel project env).
4. Set `ADMIN_UIDS` to your own Firebase UID(s) so you retain full (Quant) access.

---

### Env var checklist

```
NEXT_PUBLIC_APP_URL
STRIPE_SECRET_KEY
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_ANALYST_MONTHLY
STRIPE_PRICE_ANALYST_ANNUAL
STRIPE_PRICE_PRO_MONTHLY
STRIPE_PRICE_PRO_ANNUAL
STRIPE_PRICE_QUANT_MONTHLY
STRIPE_PRICE_QUANT_ANNUAL
ADMIN_UIDS
```
