// The run's as-of instant, and the vocabulary for stamping evidence against it.
//
// The claim Finava Live makes is that a reader can check what the crew knew when
// it decided. Today nothing in the record supports that: every step calls
// `new Date()` independently, so "when" is whenever each fetch happened to land,
// and a decision cannot be replayed against the information set that produced it.
// An LLM that has already read that NVDA rallied is not being tested; it is being
// asked to remember. Stamping is what makes the difference detectable.
//
// Three ideas, deliberately separate:
//
//  1. THE RUN HAS ONE AS-OF. Established once at session_open and read by every
//     later step. Because `runStep` persists step results, a replayed workflow
//     returns the SAME instant rather than minting a new one — the reproducibility
//     property falls out of machinery that already exists.
//
//  2. OBSERVED-AT IS NOT SOURCE-AS-OF. `observedAt` is when we read a value and is
//     always knowable. `sourceAsOf` is when the provider says the value is from,
//     and is frequently unknowable. Collapsing them is how look-ahead hides: a
//     figure fetched at 09:15 may be a revision published at 16:00 the day after
//     the decision it is about.
//
//  3. UNDATED IS ITS OWN STATE. A fact whose source will not say when it is from
//     is not clean and not excluded — it is unverifiable, and the record says so.
//     This extends the vocabulary `candidateFacts` already uses, where a null is
//     "we could not verify this" and never zero.

/** Where a stamped fact sits relative to the run's as-of. */
export type FactStandingKind = "clean" | "undated" | "post_asof";

export interface FactStamp {
  /** The CandidateFacts field this describes, e.g. "marketCapUsd". */
  field: string;
  /** The provider, matching the `source` vocabulary used by dataGaps. */
  source: string;
  /** When we read the value. Always known, because we did the reading. */
  observedAt: string;
  /** When the provider says the value is from. Null when it will not say. */
  sourceAsOf: string | null;
  standing: FactStandingKind;
}

/** A run's as-of instant. ISO 8601 UTC, matching every other timestamp in the ledger. */
export function establishAsOf(at: Date = new Date()): string {
  return at.toISOString();
}

function parse(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Does this value come from after the moment the crew was supposed to know it?
 *
 * An unparseable or absent `sourceAsOf` is NOT post-dating — it is undated, which
 * `standingOf` reports separately. Returning true here for a missing timestamp
 * would quietly discard every fact from a provider that does not date its
 * payloads, which is most of them.
 */
export function postDatesAsOf(sourceAsOf: string | null | undefined, asOf: string): boolean {
  const source = parse(sourceAsOf);
  const cutoff = parse(asOf);
  if (source === null || cutoff === null) return false;
  return source > cutoff;
}

/**
 * Classify a value against the run's as-of.
 *
 * An unparseable `asOf` yields "undated" rather than "clean": if we cannot read
 * our own cutoff we cannot claim anything was observed before it, and the honest
 * report is that the standing is unknown.
 */
export function standingOf(
  sourceAsOf: string | null | undefined,
  asOf: string
): FactStandingKind {
  if (parse(asOf) === null) return "undated";
  if (parse(sourceAsOf) === null) return "undated";
  return postDatesAsOf(sourceAsOf, asOf) ? "post_asof" : "clean";
}

export function stampFact(params: {
  field: string;
  source: string;
  sourceAsOf: string | null | undefined;
  asOf: string;
  observedAt?: string;
}): FactStamp {
  return {
    field: params.field,
    source: params.source,
    observedAt: params.observedAt ?? new Date().toISOString(),
    sourceAsOf: params.sourceAsOf ?? null,
    standing: standingOf(params.sourceAsOf, params.asOf),
  };
}

/**
 * Should this value be withheld from the crew?
 *
 * Only "post_asof" is withheld. Undated values are still shown, because refusing
 * everything a provider declines to date would empty the evidence bundle and
 * replace a measurable weakness with a silent one. The stamp records the
 * weakness; the eval can then ask how often an undated fact carried a decision.
 */
export function shouldWithhold(stamp: FactStamp): boolean {
  return stamp.standing === "post_asof";
}

/** The stamps that kept a decision from being fully verifiable. */
export function unverifiableStamps(stamps: FactStamp[]): FactStamp[] {
  return stamps.filter((s) => s.standing !== "clean");
}
