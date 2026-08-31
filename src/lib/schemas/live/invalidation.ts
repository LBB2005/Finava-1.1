// Machine-checkable invalidation conditions for Finava Live.
//
// The crew writes a thesis in prose, but it must ALSO express what would prove
// that thesis wrong in a form a daily evaluator can execute without an LLM.
// `metric` and `source` are closed enums on purpose: a free-text metric field
// just produces prose again, and prose can't be checked. A decision whose
// invalidation set fails this schema is rejected and re-requested — and that
// rejection is itself logged, because a thesis the crew cannot express as a
// checkable condition is a data point about the crew.

import { z } from "zod";

/** Everything the daily evaluator knows how to observe. Closed by design. */
export const InvalidationMetricSchema = z.enum([
  // price / trend — alpaca_snapshot, factor_universe
  "price",
  "price_vs_entry_pct",
  "price_vs_sma200_pct",
  // fundamentals — finnhub_basic_financials, edgar_xbrl, polygon_financials
  "revenue_yoy_pct",
  "gross_margin_pct",
  "operating_margin_pct",
  "eps_ttm",
  "fcf_ttm",
  // market structure — finnhub_*
  "analyst_skew",
  "short_interest_pct",
  "days_to_next_earnings",
  // Finava's own factor engine — factor_universe
  "factor_composite",
  "factor_mom",
  "factor_growth",
  "factor_quality",
  "factor_value",
  "factor_health",
]);
export type InvalidationMetric = z.infer<typeof InvalidationMetricSchema>;

/**
 * `crosses_below` / `crosses_above` need the previous observation, so they
 * evaluate to `indeterminate` on the first check for a condition.
 */
export const InvalidationOperatorSchema = z.enum([
  "lt",
  "lte",
  "gt",
  "gte",
  "crosses_below",
  "crosses_above",
]);
export type InvalidationOperator = z.infer<typeof InvalidationOperatorSchema>;

/** Which provider answers for this metric. Recorded so a data gap is attributable. */
export const InvalidationSourceSchema = z.enum([
  "alpaca_snapshot",
  "finnhub_basic_financials",
  "finnhub_recommendation",
  "finnhub_earnings_calendar",
  "edgar_xbrl",
  "polygon_financials",
  "factor_universe",
]);
export type InvalidationSource = z.infer<typeof InvalidationSourceSchema>;

export const InvalidationConditionSchema = z.object({
  /** Stable within a decision, so daily evaluations can be joined across days. */
  id: z.string().min(1).max(20),
  metric: InvalidationMetricSchema,
  operator: InvalidationOperatorSchema,
  threshold: z.number().finite(),
  unit: z.enum(["usd", "pct", "ratio", "days", "score"]),
  source: InvalidationSourceSchema,
  /** Debounce: the condition must hold this many consecutive checks to fire. */
  consecutive: z.number().int().min(1).max(10).default(1),
  /** Human-readable restatement. Rendered in the UI, NEVER executed. */
  statement: z.string().min(1).max(300),
  /** After this many days the condition stops being checked. */
  horizonDays: z.number().int().min(1).max(730),
});
export type InvalidationCondition = z.infer<typeof InvalidationConditionSchema>;
