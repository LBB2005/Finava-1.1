// The prompt-facing rendering of CrewDecisionSchema.
//
// Generated from the Zod enums rather than hand-written, because a hand-written
// contract drifts. If someone adds an invalidation metric to the schema and the
// prompt still lists the old set, the model keeps emitting the old vocabulary
// and every extraction quietly fails validation — or worse, the new metric is
// never used and nobody notices the evaluator has a blind spot. Deriving it
// means the two cannot disagree.

import {
  InvalidationMetricSchema,
  InvalidationOperatorSchema,
  InvalidationSourceSchema,
} from "@/lib/schemas/live/invalidation";
import { DecisionKindSchema } from "@/lib/schemas/live/decision";

/** Allowed stated-confidence probabilities: the 0.05 grid, clamped off 0 and 1. */
export function confidenceGrid(): number[] {
  const grid: number[] = [];
  for (let i = 1; i <= 19; i++) grid.push(Math.round(i * 5) / 100);
  return grid;
}

function list(values: readonly string[]): string {
  return values.join(" | ");
}

/**
 * The schema as the model sees it. Deliberately terse — the closed enums are the
 * part that carries information, the field descriptions are there to stop the
 * model guessing at intent.
 */
export function buildDecisionContract(): string {
  return [
    "{",
    '  "ticker": string (uppercase, as traded on a US exchange),',
    `  "kind": ${list(DecisionKindSchema.options)},`,
    '  "thesis": string (<=6000 chars) — the argument the crew actually made,',
    '  "stated": {',
    `    "probability": one of ${confidenceGrid().join(", ")}`,
    "       — the crew's honest probability that the thesis is right by the horizon.",
    "       Not a score, not a confidence adjective. It is scored against reality,",
    "       so a well-calibrated 0.6 beats an overstated 0.9.",
    '    "horizonDays": 5 | 21 | 63 | 126,',
    '    "expectedReturnPct": number (-100..500)',
    "  },",
    '  "invalidation": array of 1-5 MACHINE-CHECKABLE conditions:',
    "  {",
    '    "id": short stable string (e.g. "inv1"),',
    `    "metric": ${list(InvalidationMetricSchema.options)},`,
    `    "operator": ${list(InvalidationOperatorSchema.options)},`,
    '    "threshold": number,',
    '    "unit": usd | pct | ratio | days | score,',
    `    "source": ${list(InvalidationSourceSchema.options)},`,
    '    "consecutive": integer 1-10 (how many consecutive checks must hold before it fires),',
    '    "statement": string (<=300 chars) — the same condition in plain English,',
    '    "horizonDays": integer 1-730',
    "  },",
    '  "votes": array (>=1) of { "agent": string, "role": bull|bear|neutral,',
    '     "stance": buy|hold|sell|abstain, "confidence": 0..1,',
    '     "summary": string, "citations": string[] },',
    '  "dissent": string — the strongest argument AGAINST this decision. Required',
    "     even when the crew agreed; if nobody dissented, state the best bear case",
    "     that was raised and why it was set aside. Never empty, never 'none'.",
    '  "targetWeightPct": number 0-12 (0 for a rejection)',
    "}",
    "",
    "Each invalidation condition must be something a program can check daily",
    "against the named source with no human judgement. A condition that needs",
    "someone to read the news and decide is NOT admissible — replace it with the",
    "measurable consequence the crew would expect to see.",
  ].join("\n");
}
