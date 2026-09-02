// Step 8 — the deterministic decision engine. NO LLM runs here.
//
// Everything before this step formed views; this step applies rules. The split
// is deliberate and load-bearing: the mandate is a frozen, published document,
// so whether a decision was permitted must be reproducible by anyone reading the
// log, with no model in the loop. If this step called an LLM, "the rails held"
// would be an assertion instead of a fact.
//
// Every debated candidate produces a DecisionRecord — including the refused
// ones, on the identical schema with kind:"reject" and targetWeightPct 0. That
// is what makes the counterfactual cohort free: the names the book passed on are
// scored by the same pipeline as the names it bought, and the difference between
// the two is the only evidence that separates selection skill from market beta.

import { NextResponse } from "next/server";
import { z } from "zod";
import { withHarness, runStep, easternDay } from "@/lib/live/harness";
import { checkEntry, checkExit, type BookState } from "@/lib/live/mandate";
import { MANDATE_V1, type BookSnapshot } from "@/lib/schemas/live/snapshot";
import {
  DECISION_SCHEMA_VERSION,
  DecisionRecordSchema,
  type CrewDecision,
  type DecisionRecord,
} from "@/lib/schemas/live/decision";
import { appendDecision, appendEvent, decisionId, LedgerConflictError } from "@/lib/live/ledger";
import { getRunState } from "@/lib/live/runState";
import { transcriptId, transcriptRef } from "@/lib/live/transcripts";
import { candidateFacts, type CandidateFactsWithGaps } from "@/lib/live/candidateFacts";
import { AGENT_VERSION } from "@/lib/live/version";
import { promptHash } from "@/lib/live/promptHash";
import { apiError } from "@/lib/apiError";
import { logger } from "@/lib/logger";

const log = logger("live:decide");

export const maxDuration = 300;

const BodySchema = z.object({ runId: z.string().min(1).optional() });

interface DebateStep {
  ticker: string;
  mode: "entry" | "exit" | "blind";
  blind: boolean;
  /** Where the transcript was stored. Optional: steps recorded before
      transcripts moved out of the run document carry no reference. */
  transcriptRef?: string;
  decision: CrewDecision | null;
  extractionIssues: string[];
}

export const POST = withHarness(async (req) => {
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiError("validation_error", "Invalid body", 400, z.flattenError(parsed.error));
  }

  const tradingDay = easternDay();
  const runId = parsed.data.runId ?? tradingDay;

  const state = await getRunState(runId);
  if (!state) return apiError("out_of_order", "No such run — open a session first", 409);

  const reconcile = state.steps.reconcile as
    | { done?: boolean; result?: { snapshot: BookSnapshot; entriesToday: number } }
    | undefined;
  if (!reconcile?.done || !reconcile.result) {
    return apiError("out_of_order", "Run the reconcile step before deciding", 409);
  }
  const { snapshot } = reconcile.result;

  // The as-of minted at session open. Read rather than re-derived: a fresh
  // Date() here would date the evidence to whenever `decide` happened to run,
  // which is exactly the conflation `asOf` exists to prevent. A run whose
  // session_open predates this field has no as-of to stand on, and a decision
  // that cannot say what it was entitled to know is not one we should record.
  const sessionOpen = state.steps.session_open as
    | { done?: boolean; result?: { asOf?: string } }
    | undefined;
  const asOf = sessionOpen?.result?.asOf;
  if (!asOf) {
    return apiError(
      "out_of_order",
      "This run has no as-of instant — re-open the session before deciding",
      409
    );
  }

  const debates = Object.entries(state.steps)
    .filter(([name]) => name.startsWith("debate_"))
    .map(([, v]) => (v as { result?: DebateStep }).result)
    .filter((d): d is DebateStep => Boolean(d));

  const { result, replayed } = await runStep(runId, "decide", async () => {
    const book: BookState = {
      equity: snapshot.equity,
      cashPct: snapshot.cashPct,
      positions: snapshot.positions,
      entriesToday: reconcile.result!.entriesToday,
      entriesFrozen: snapshot.entriesFrozen,
    };

    const records: DecisionRecord[] = [];
    const unscorable: { ticker: string; issues: string[] }[] = [];
    const version = AGENT_VERSION;
    const hash = promptHash();

    for (const debate of debates) {
      if (!debate.decision) {
        // A debate that produced no checkable thesis is recorded as an event
        // rather than silently dropped: "the crew could not state a condition"
        // is one of the things this whole exercise is measuring.
        unscorable.push({ ticker: debate.ticker, issues: debate.extractionIssues });
        continue;
      }

      const crew = debate.decision;
      const facts: CandidateFactsWithGaps = await candidateFacts(crew.ticker, asOf);
      const held = snapshot.positions.find((p) => p.ticker === crew.ticker);

      let verdict;
      if (crew.kind === "exit" || crew.kind === "trim") {
        const heldDays = held?.openedOn ? tradingDaysBetween(held.openedOn, tradingDay) : 0;
        verdict = checkExit(MANDATE_V1, debate.blind ? "reunderwrite" : "invalidation", heldDays);
      } else if (crew.kind === "entry" || crew.kind === "add") {
        verdict = checkEntry(MANDATE_V1, book, facts, crew.targetWeightPct);
      } else {
        // hold / reject need no permission — nothing is being changed.
        verdict = { allowed: true, checks: [], allowedWeightPct: 0 };
      }

      // A rail refusal DOWNGRADES the decision to a rejection rather than
      // discarding it. The crew's view and the reason it was refused both belong
      // in the record — a decision that vanishes because a rail said no is a hole
      // in the counterfactual cohort.
      const effectiveKind = verdict.allowed ? crew.kind : "reject";
      const weight = verdict.allowed ? verdict.allowedWeightPct : 0;

      const record: DecisionRecord = {
        schemaVersion: DECISION_SCHEMA_VERSION,
        decisionId: decisionId(tradingDay, crew.ticker, effectiveKind),
        runId,
        tradingDay,
        ticker: crew.ticker.toUpperCase(),
        kind: effectiveKind,
        blindReunderwrite: debate.blind,
        priorDecisionId: held?.openedByDecisionId ?? null,
        thesis: crew.thesis,
        stated: crew.stated,
        invalidation: crew.invalidation,
        votes: crew.votes,
        dissent: crew.dissent,
        targetWeightPct: weight,
        mandateChecks: verdict.checks,
        dataGaps: facts.dataGaps,
        asOf,
        evidence: facts.evidence,
        agentVersion: version,
        promptHash: hash,
        // The debate step records the reference it actually wrote to; the
        // computed form is the fallback for a step recorded before transcripts
        // moved out of the run document. Two hand-built copies of this path is
        // how the reference came to point at a document nobody wrote.
        transcriptRef:
          debate.transcriptRef ?? transcriptRef(transcriptId(runId, crew.ticker, debate.mode)),
        createdAt: new Date().toISOString(),
      };

      const validated = DecisionRecordSchema.safeParse(record);
      if (!validated.success) {
        unscorable.push({
          ticker: crew.ticker,
          issues: validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        });
        continue;
      }

      try {
        await appendDecision(validated.data);
        records.push(validated.data);
        if (validated.data.kind === "entry") book.entriesToday += 1;
      } catch (err) {
        if (!(err instanceof LedgerConflictError)) throw err;
        log.warn("decision already recorded, keeping the original", {
          decisionId: record.decisionId,
        });
      }
    }

    for (const u of unscorable) {
      await appendEvent({
        eventId: `${tradingDay}-unscorable-${u.ticker}`,
        tradingDay,
        kind: "correction",
        message:
          `The crew's report for ${u.ticker} could not be expressed as a schema-valid ` +
          `decision. Recorded as a data point about the crew, not discarded.`,
        detail: { issues: u.issues },
        createdAt: new Date().toISOString(),
      });
    }

    return {
      runId,
      tradingDay,
      decisions: records,
      entries: records.filter((r) => r.kind === "entry").length,
      rejects: records.filter((r) => r.kind === "reject").length,
      unscorable,
    };
  });

  return NextResponse.json({ ...result, replayed });
});

/**
 * Trading days between two ET dates, weekends excluded.
 *
 * Approximate — it does not know about holidays, so it can over-count by a day
 * around one. That erring direction is deliberate: over-counting can only make
 * the min-hold rail release a position slightly early, whereas under-counting
 * would trap a position the crew wanted out of.
 */
function tradingDaysBetween(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  let days = 0;
  for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) days++;
  }
  return days;
}
