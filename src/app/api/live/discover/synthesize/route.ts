// Step 6 — the single LLM ranking pass over all wave evidence.
//
// One model call for the whole funnel. Everything before it was deterministic
// data-gathering; this is where a view is formed, which is exactly why it is
// isolated in its own step and its own transcript.
//
// The output ranks candidates. It does NOT decide the book — that is step 8, and
// it is deterministic. Keeping ranking and allocation apart is what makes the
// rejected cohort meaningful: a name can rank well and still be refused by a
// rail, and both facts are recorded.

import { NextResponse } from "next/server";
import { z } from "zod";
import { withHarness, runStep, easternDay } from "@/lib/live/harness";
import { runDiscoverySynthesis } from "@/agents/discovery";
import { collector, renderTranscript } from "@/lib/live/collect";
import { getStepResult } from "@/lib/live/runState";
import { mergeWaves } from "@/lib/discoveryRun";
import { extractStructured } from "@/lib/live/extractDecision";
import { RankedCandidatesSchema, RANKED_CONTRACT, MAX_DEBATE_SUBJECTS } from "@/lib/live/ranking";
import { apiError } from "@/lib/apiError";
import type { ScoutPick, WaveEvidence } from "@/lib/scoutTypes";

export const maxDuration = 300;

const BodySchema = z.object({ runId: z.string().min(1).optional() });

export const POST = withHarness(async (req) => {
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiError("validation_error", "Invalid body", 400, z.flattenError(parsed.error));
  }

  const tradingDay = easternDay();
  const runId = parsed.data.runId ?? tradingDay;

  const scout = await getStepResult<{ picks: ScoutPick[]; query: string; totalWaves: number }>(
    runId,
    "scout"
  );
  if (!scout) return apiError("out_of_order", "Run the scout step first", 409);

  // Gather every completed wave. A missing wave is reported rather than skipped:
  // synthesising over partial evidence would produce a ranking that looks
  // complete and silently never saw some of the shortlist.
  const waves: WaveEvidence[] = [];
  const missing: number[] = [];
  for (let i = 0; i < scout.totalWaves; i++) {
    const w = await getStepResult<{ wave: WaveEvidence }>(runId, `wave_${i}`);
    if (w?.wave) waves.push(w.wave);
    else missing.push(i);
  }
  if (missing.length) {
    return apiError("incomplete_evidence", `Waves not yet run: ${missing.join(", ")}`, 409, {
      missing,
    });
  }

  const { result, replayed } = await runStep(runId, "synthesize", async () => {
    const { emit, collected } = collector();
    await runDiscoverySynthesis(
      { synthesize: true, query: scout.query, picks: scout.picks, evidence: mergeWaves(waves) },
      emit
    );

    const transcript = renderTranscript(collected.events);

    // Pull the ranking out as data so the runner can loop debates over it.
    // Extracted from the synthesis the crew already wrote rather than asking a
    // model to rank again — a second ranking pass would be a decision the
    // published transcript does not account for.
    const ranked = await extractStructured({
      schema: RankedCandidatesSchema,
      report: transcript,
      target: "the ranked candidate list the synthesis produced",
      contract: RANKED_CONTRACT,
      guidance:
        `Rank at most ${MAX_DEBATE_SUBJECTS} names, best first, using only tickers ` +
        `that appear in the report. Do not add names the synthesis did not discuss.`,
    });

    // Only names the scout actually shortlisted may proceed. An extraction that
    // hallucinated a ticker must not put an unresearched name into a debate.
    const shortlisted = new Set(scout.picks.map((p) => p.ticker.toUpperCase()));
    const subjects = (ranked.ok ? ranked.value.ranked : [])
      .map((r) => r.ticker.toUpperCase())
      .filter((t) => shortlisted.has(t))
      .slice(0, MAX_DEBATE_SUBJECTS);

    return {
      runId,
      tradingDay,
      transcript,
      events: collected.events.length,
      subjects,
      rankingIssues: ranked.ok ? [] : ranked.issues,
    };
  });

  return NextResponse.json({ ...result, replayed });
});
