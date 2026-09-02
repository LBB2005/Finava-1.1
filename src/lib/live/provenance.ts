// How well a decision's evidence can be dated — the counterpart to as-of stamping.
//
// Stamping made "what was this decision entitled to know" recordable. This turns
// the stamps into a number, so the question the whole exercise is meant to answer
// becomes answerable across a run of decisions rather than one at a time: how
// often did an UNDATED fact carry a decision?
//
// Deliberately DERIVED, not stored. Every input is already on the decision record
// (`evidence` and `dataGaps`), so a reader can recompute this from the published
// files and check it rather than trusting a number we wrote down. Storing it
// would add a schema version, invite the stored copy to drift from the stamps it
// summarises, and buy nothing — a figure only we can compute is exactly the kind
// of claim this project exists to avoid.
//
// It is a MEASUREMENT, not a grade. Most decisions today will read "weak", and
// that is the finding rather than a bug: Finnhub's basic-financials payload
// carries no publication timestamp, so every fundamental behind a decision is
// undated by construction. A metric that flattered the current data would hide
// the thing worth knowing.

import type { FactStamp } from "./asOf";

/** The gap vocabulary from DecisionRecordSchema, structurally. */
export interface ProvenanceGap {
  field: string;
  status: "unavailable" | "failed" | "excluded_post_asof";
  source: string;
}

export type ProvenanceStanding = "verifiable" | "weak" | "unverifiable";

export interface ProvenanceScore {
  /** Facts stamped for this decision, whatever their standing. */
  factsTotal: number;
  /** Dated by their source, and at or before the run's as-of. */
  clean: number;
  /** Held, but with no source timestamp to check them against. */
  undated: number;
  /**
   * Stamped as post-as-of. Expected to be 0 in a live-forward run and non-zero
   * on a replay, where it is the rail visibly doing its job.
   */
  postAsOf: number;
  /** Fields withheld because the source dated them after the as-of. */
  withheldFields: string[];
  /** clean / factsTotal, or 0 when nothing was stamped. */
  verifiableShare: number;
  standing: ProvenanceStanding;
}

/**
 * Thresholds are coarse on purpose.
 *
 * A finer scale would imply a precision the inputs do not have — the denominator
 * is a handful of facts, so one field moving swings any percentage wildly. Three
 * buckets are enough to segment a calibration table by, which is the only thing
 * this number is for.
 */
const WEAK_FLOOR = 0.5;

export function scoreProvenance(
  evidence: FactStamp[],
  dataGaps: ProvenanceGap[] = []
): ProvenanceScore {
  const factsTotal = evidence.length;
  let clean = 0;
  let undated = 0;
  let postAsOf = 0;

  for (const stamp of evidence) {
    if (stamp.standing === "clean") clean++;
    else if (stamp.standing === "undated") undated++;
    else postAsOf++;
  }

  const withheldFields = dataGaps
    .filter((g) => g.status === "excluded_post_asof")
    .map((g) => g.field);

  const verifiableShare = factsTotal === 0 ? 0 : clean / factsTotal;

  // A decision with no stamps at all is unverifiable rather than clean: an empty
  // evidence array means nothing was recorded, not that nothing was wrong.
  const standing: ProvenanceStanding =
    factsTotal === 0 || clean === 0
      ? "unverifiable"
      : verifiableShare >= WEAK_FLOOR
        ? "verifiable"
        : "weak";

  return {
    factsTotal,
    clean,
    undated,
    postAsOf,
    withheldFields,
    verifiableShare,
    standing,
  };
}

export interface ProvenanceSummary {
  decisions: number;
  /** Decisions by standing, so a day can be read at a glance. */
  verifiable: number;
  weak: number;
  unverifiable: number;
  /** Mean verifiable share across the day's decisions. */
  meanVerifiableShare: number;
  /** Decisions where at least one fact was withheld as post-as-of. */
  withheldOn: number;
}

/**
 * Roll a day's decisions into one line for the published summary.
 *
 * The mean is over DECISIONS, not over facts: a name with twenty stamped fields
 * should not outweigh one with six when the question is "how many of today's
 * calls rested on evidence we could date".
 */
export function summariseProvenance(scores: ProvenanceScore[]): ProvenanceSummary {
  const decisions = scores.length;
  const summary: ProvenanceSummary = {
    decisions,
    verifiable: 0,
    weak: 0,
    unverifiable: 0,
    meanVerifiableShare: 0,
    withheldOn: 0,
  };
  if (!decisions) return summary;

  let shareTotal = 0;
  for (const s of scores) {
    summary[s.standing]++;
    shareTotal += s.verifiableShare;
    if (s.withheldFields.length) summary.withheldOn++;
  }
  summary.meanVerifiableShare = shareTotal / decisions;
  return summary;
}
