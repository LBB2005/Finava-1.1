// Step 7 — one full crew debate per HTTP call.
//
// This is the core chunking decision of the whole harness. A debate is the
// largest indivisible unit of work (the CEO plus its sub-agents, 3-8 minutes),
// and splitting one across invocations would mean serialising mid-crew state.
// So the runner calls this once per subject and the loop lives in the workflow.
//
// Three subject modes, all running the SAME crew:
//   - entry / exit   — full context, the normal path
//   - blind          — a re-underwrite with the prior thesis withheld
//
// The blind mode is the eval, and it is the subtlest thing in this file. See
// buildBlindPrompt below: withholding the thesis from the prompt is NOT enough
// on its own.

import { NextResponse } from "next/server";
import { z } from "zod";
import { withHarness, runStep, easternDay } from "@/lib/live/harness";
import { runCeoAgent } from "@/agents/ceo";
import { withCacheScope, withRecallAsOf } from "@/lib/agentMemory";
import { getRunAsOf } from "@/lib/live/runState";
import { collector, renderTranscript } from "@/lib/live/collect";
import { extractStructured } from "@/lib/live/extractDecision";
import { buildDecisionContract } from "@/lib/live/decisionContract";
import { CrewDecisionSchema } from "@/lib/schemas/live/decision";
import { apiError } from "@/lib/apiError";
import { logger } from "@/lib/logger";

const log = logger("live:debate");

export const maxDuration = 300;

const BodySchema = z.object({
  runId: z.string().min(1).optional(),
  ticker: z.string().min(1).max(10),
  mode: z.enum(["entry", "exit", "blind"]),
  /** Evidence/ranking context from the discovery funnel, for an entry debate. */
  context: z.string().max(20_000).optional(),
});

/**
 * The prompt for a blind re-underwrite.
 *
 * Withholding the prior thesis is the obvious half. The non-obvious half is that
 * the position itself is inferable — if the crew is told "you hold this", it can
 * reconstruct that a previous run liked it, and a re-underwrite that knows the
 * answer is not blind. So the book context is scrubbed entirely and the name is
 * presented as an ordinary candidate.
 *
 * The other leak is the cache: agentCache is keyed on (agent, input), and the
 * sub-agent inputs for a blind rerun are byte-identical to the original
 * underwrite's. Without a namespace, every sub-agent would replay the first
 * run's output and the consistency number would be measuring the cache. The
 * caller wraps this in withCacheScope for that reason — get it wrong and the
 * headline eval figure is meaningless, and nothing would look broken.
 */
function buildBlindPrompt(ticker: string): string {
  return (
    `Analyse ${ticker} as a candidate for a concentrated long-biased book ` +
    `(8-15 names, weeks-to-months holding period).\n\n` +
    `Reach your own conclusion from current evidence. Do not assume any prior ` +
    `position, view, or history of analysis on this name — treat it as a name ` +
    `you are seeing for the first time.\n\n` +
    `State whether you would enter, at what weight, your probability that the ` +
    `thesis is right by your stated horizon, and what specific measurable ` +
    `conditions would prove you wrong.`
  );
}

function buildPrompt(mode: "entry" | "exit", ticker: string, context?: string): string {
  const head =
    mode === "entry"
      ? `Underwrite ${ticker} as a new position for a concentrated long-biased book ` +
        `(8-15 names, weeks-to-months holding period).`
      : `Review the existing position in ${ticker} and decide whether to hold, trim or exit.`;

  return (
    `${head}\n\n` +
    (context ? `Crew evidence from today's discovery run:\n${context}\n\n` : "") +
    `Argue both sides explicitly. State a target weight, a probability that your ` +
    `thesis is right by a stated horizon, and the specific measurable conditions ` +
    `that would prove you wrong.`
  );
}

export const POST = withHarness(async (req) => {
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiError("validation_error", "Invalid body", 400, z.flattenError(parsed.error));
  }

  const tradingDay = easternDay();
  const { ticker, mode, context } = parsed.data;
  const runId = parsed.data.runId ?? tradingDay;
  const step = `debate_${mode}_${ticker.toUpperCase()}`;

  // Memory recall is clipped to what was knowable when the run opened. Without
  // this, tickerMemory happily injects an insight written after the decision
  // being reconstructed — harmless live, where memory cannot come from the
  // future, and a straight look-ahead leak the first time a day is replayed.
  const asOf = await getRunAsOf(runId);

  const { result, replayed } = await runStep(runId, step, async () => {
    const { emit, collected } = collector();
    const blind = mode === "blind";

    const run = () =>
      runCeoAgent(
        blind ? buildBlindPrompt(ticker) : buildPrompt(mode, ticker, context),
        // Blind runs get NO portfolio context — see buildBlindPrompt.
        "",
        emit,
        { deepResearch: true, holdings: [] }
      );

    // A per-run namespace, so a blind rerun cannot read the original
    // underwrite's sub-agent outputs, and its own outputs never overwrite the
    // shared cache other callers read.
    const scoped = () =>
      blind ? withCacheScope(`blind:${runId}:${ticker}`, run) : run();
    await (asOf ? withRecallAsOf(asOf, scoped) : scoped());

    const transcript = renderTranscript(collected.events);

    const extraction = await extractStructured({
      schema: CrewDecisionSchema,
      report: transcript,
      target: `the ${mode} decision the crew reached for ${ticker}`,
      contract: buildDecisionContract(),
      guidance:
        `The ticker is ${ticker}. ` +
        (mode === "exit"
          ? `This is a review of an existing position, so "kind" must be one of trim, exit or hold.`
          : `If the crew concluded the name is not worth owning, that is kind:"reject" with ` +
            `targetWeightPct 0 — a rejection is a real, recorded decision, not a non-answer.`),
    });

    if (!extraction.ok) {
      // Not an error to swallow. A crew that cannot state a checkable thesis is
      // a finding about the crew, so it is recorded and the day continues.
      log.warn("debate produced no schema-valid decision", { ticker, mode, issues: extraction.issues });
    }

    return {
      runId,
      tradingDay,
      ticker: ticker.toUpperCase(),
      mode,
      blind,
      transcript,
      decision: extraction.ok ? extraction.value : null,
      extractionIssues: extraction.ok ? [] : extraction.issues,
      extractionAttempts: extraction.attempts,
    };
  });

  return NextResponse.json({ ...result, replayed });
});
