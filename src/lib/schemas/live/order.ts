// Order intents and fills.
//
// `clientOrderId` is the idempotency key and it is deterministic: a replayed
// GitHub Actions step produces the same id, Alpaca 422s on the duplicate, and
// the executor resolves that to the existing order instead of double-filling.
// Never retry a POST /orders — look the order up and re-submit only if absent.

import { z } from "zod";

export const OrderIntentSchema = z.object({
  intentId: z.string().min(1),
  decisionId: z.string().min(1),
  runId: z.string().min(1),
  tradingDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),

  ticker: z.string().min(1).max(10),
  side: z.enum(["buy", "sell"]),
  /** Fractional. See the plan: true MOO rejects fractions and would bias the universe. */
  qty: z.number().positive(),
  notionalPctOfEquity: z.number().min(0).max(12),
  type: z.literal("market"),
  /** "day" submitted seconds after the open; "opg" reserved for whole-share MOO. */
  timeInForce: z.enum(["day", "opg"]),

  /** Shadow intents are recorded and priced against the official open, never sent. */
  shadow: z.boolean(),
  clientOrderId: z.string().min(1).max(48),
  createdAt: z.string(),
});
export type OrderIntent = z.infer<typeof OrderIntentSchema>;

export const FillRecordSchema = z.object({
  fillId: z.string().min(1),
  intentId: z.string().min(1),
  runId: z.string().min(1),
  tradingDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),

  ticker: z.string().min(1).max(10),
  side: z.enum(["buy", "sell"]),
  filledQty: z.number().min(0),
  filledAvgPrice: z.number().nullable(),

  /** The session's official opening print, so slippage is measured, not asserted. */
  officialOpen: z.number().nullable(),
  slippageBps: z.number().nullable(),

  /** True when synthesised from the open during shadow mode rather than broker-filled. */
  synthetic: z.boolean(),
  brokerOrderId: z.string().nullable(),
  status: z.string().max(40),
  submittedAt: z.string().nullable(),
  filledAt: z.string().nullable(),
  createdAt: z.string(),
});
export type FillRecord = z.infer<typeof FillRecordSchema>;
