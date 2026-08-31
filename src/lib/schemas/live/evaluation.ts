// Daily evaluation of one invalidation condition.
//
// Three-valued on purpose. `SourceStatus` from @/lib/fetchRetry threads all the
// way through to here so that "we couldn't reach the source" is never recorded
// as "the condition is false". Collapsing those two is exactly the bug
// fetchRetry was written to prevent, and here it would let the book silently
// hold a position whose thesis nobody can actually check.

import { z } from "zod";

/** Mirrors SourceStatus in @/lib/fetchRetry — kept in sync by evaluation.test.ts. */
export const SourceStatusSchema = z.enum(["ok", "unavailable", "failed"]);

/**
 * - `breached`  — observed, and the condition is true.
 * - `holding`   — observed, and the condition is false. The thesis survives.
 * - `indeterminate` — NOT observed. Never counts as `holding`.
 */
export const ConditionStatusSchema = z.enum([
  "breached",
  "holding",
  "indeterminate",
]);
export type ConditionStatus = z.infer<typeof ConditionStatusSchema>;

export const ConditionEvalSchema = z.object({
  conditionId: z.string().min(1),
  decisionId: z.string().min(1),
  ticker: z.string().min(1).max(10),
  tradingDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),

  status: ConditionStatusSchema,
  /** The value we read, or null when we couldn't read one. */
  observed: z.number().nullable(),
  /** ok → breached|holding. unavailable|failed → indeterminate. Always recorded. */
  sourceStatus: SourceStatusSchema,

  /** Consecutive `breached` days, for the condition's `consecutive` debounce. */
  consecutiveTrue: z.number().int().min(0),
  /** Consecutive `failed` days — three raises a data_gap flag on the position. */
  consecutiveFailed: z.number().int().min(0),
  /** True once consecutiveTrue >= the condition's `consecutive`. */
  fired: z.boolean(),

  /** Freshness of the underlying observation, not of this evaluation. */
  asOf: z.string(),
  note: z.string().max(200).optional(),
  createdAt: z.string(),
});
export type ConditionEval = z.infer<typeof ConditionEvalSchema>;
