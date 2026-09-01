// The decision record — the unit of the Finava Live ledger and the unit of eval.
//
// One schema covers entries, exits, holds AND rejections. A rejected candidate
// is `kind: "reject"` with `targetWeightPct: 0` and a full stated confidence +
// invalidation set. That is deliberate: it means the counterfactual cohort runs
// through the same scorer and the same calibration pipeline as the book, which
// is what separates selection skill from market beta. Rejections are not a
// second-class record.

import { z } from "zod";
import { InvalidationConditionSchema } from "./invalidation";

/**
 * 2 — added `asOf` and `evidence`. A v1 record states what the crew concluded;
 * a v2 record also states the information set it was entitled to see, which is
 * what makes "the model already knew the answer" a checkable claim rather than
 * an accusation. The bump is deliberate: a reader must be able to tell a record
 * that was never stamped from one whose evidence happened to be empty.
 */
export const DECISION_SCHEMA_VERSION = 2;

/** Horizons are a closed set — an unscored horizon can never mature. */
export const DecisionHorizonSchema = z.union([
  z.literal(5),
  z.literal(21),
  z.literal(63),
  z.literal(126),
]);
export type DecisionHorizon = z.infer<typeof DecisionHorizonSchema>;

export const StatedConfidenceSchema = z.object({
  /**
   * Snapped to a 0.05 grid. A free float gives ~250 unique values across the
   * whole run and zero bucketing power; ten buckets is what makes a reliability
   * curve readable. Clamped away from 0 and 1 because a Brier score punishes
   * certainty infinitely and the crew should never claim it.
   */
  probability: z
    .number()
    .min(0.05)
    .max(0.95)
    .refine((p) => Math.abs(p * 20 - Math.round(p * 20)) < 1e-9, {
      message: "probability must be a multiple of 0.05",
    }),
  horizonDays: DecisionHorizonSchema,
  expectedReturnPct: z.number().min(-100).max(500),
});
export type StatedConfidence = z.infer<typeof StatedConfidenceSchema>;

/** One agent's position in the debate. Dissent is recorded, never summarised away. */
export const AgentVoteSchema = z.object({
  agent: z.string().min(1).max(60),
  role: z.enum(["bull", "bear", "neutral"]),
  stance: z.enum(["buy", "hold", "sell", "abstain"]),
  confidence: z.number().min(0).max(1),
  summary: z.string().max(2000),
  citations: z.array(z.string().max(300)).max(20).default([]),
});
export type AgentVote = z.infer<typeof AgentVoteSchema>;

export const DecisionKindSchema = z.enum([
  "entry",
  "add",
  "trim",
  "exit",
  "hold",
  "reject",
]);
export type DecisionKind = z.infer<typeof DecisionKindSchema>;

/** A metric the crew wanted but could not get, and why. Never silently dropped. */
export const DataGapSchema = z.object({
  field: z.string().max(60),
  /**
   * "unavailable" = the source has no such value; "failed" = transport blip;
   * "excluded_post_asof" = we HAD the value and withheld it, because the source
   * dates it after the run's as-of. The third is not a failure — it is the rail
   * working, and it must not read in the log as data we could not obtain.
   */
  status: z.enum(["unavailable", "failed", "excluded_post_asof"]),
  source: z.string().max(60),
});

/** When a fact was read, and when its source says it is from. */
export const FactStampSchema = z.object({
  field: z.string().max(60),
  source: z.string().max(60),
  observedAt: z.string(),
  /** Null when the provider will not date its payload. */
  sourceAsOf: z.string().nullable(),
  standing: z.enum(["clean", "undated", "post_asof"]),
});

export const DecisionRecordSchema = z.object({
  schemaVersion: z.literal(DECISION_SCHEMA_VERSION),
  decisionId: z.string().min(1),
  runId: z.string().min(1),
  /** ET calendar day, not a timestamp — the join key for the whole ledger. */
  tradingDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ticker: z.string().min(1).max(10),
  kind: DecisionKindSchema,

  /** True when the prior thesis was withheld from the crew (consistency eval). */
  blindReunderwrite: z.boolean().default(false),
  /** The decision this supersedes, for re-underwrites and exits. */
  priorDecisionId: z.string().nullable().default(null),

  thesis: z.string().min(1).max(6000),
  stated: StatedConfidenceSchema,
  invalidation: z.array(InvalidationConditionSchema).min(1).max(5),

  votes: z.array(AgentVoteSchema).min(1),
  /** The strongest bear point, mandatory even on a unanimous book. */
  dissent: z.string().max(2000),

  targetWeightPct: z.number().min(0).max(12),
  /** Which mandate rails were evaluated and what they said. */
  mandateChecks: z.array(
    z.object({
      rule: z.string().max(60),
      passed: z.boolean(),
      detail: z.string().max(200),
    })
  ),
  dataGaps: z.array(DataGapSchema).default([]),

  /**
   * The instant the crew was entitled to know things as of, minted once at
   * session open. Distinct from `createdAt`, which is when the record was
   * written: the gap between them is how long the run took, and conflating the
   * two is what makes look-ahead invisible.
   */
  asOf: z.string(),
  /** Per-fact provenance behind this decision. */
  evidence: z.array(FactStampSchema).default([]),

  /** Dated agent/prompt version, so performance segments by version. */
  agentVersion: z.string().min(1).max(30),
  /** sha256 of the system prompts actually used for this run. */
  promptHash: z.string().length(64),
  transcriptRef: z.string().min(1),
  createdAt: z.string(),
});
export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;

/**
 * The subset of a decision the CREW actually authors.
 *
 * Everything else on DecisionRecord — ids, runId, tradingDay, hashes,
 * transcriptRef, createdAt, agentVersion — is supplied by the harness and must
 * never be extractable from model output. Splitting them is not tidiness: if the
 * model could emit `decisionId` or `promptHash` it could, in a bad run, hand the
 * ledger a doc id that collides with an existing record or a hash that does not
 * describe the prompts actually used, and the append-only guarantee would be
 * asserting something untrue. The crew states a view; the harness states the facts.
 */
export const CrewDecisionSchema = DecisionRecordSchema.pick({
  ticker: true,
  kind: true,
  thesis: true,
  stated: true,
  invalidation: true,
  votes: true,
  dissent: true,
  targetWeightPct: true,
});
export type CrewDecision = z.infer<typeof CrewDecisionSchema>;
