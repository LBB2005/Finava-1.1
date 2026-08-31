// Step 5 — one deterministic crew wave per invocation.
//
// The bash loop in the workflow calls this once per waveIndex. One wave (≤5
// tickers, 8 batch agents + macro + 6 valuation agents on the top 3) is the
// largest unit that reliably fits in 300s, which is why the loop lives in the
// runner rather than here.
//
// No LLM runs in a wave — the agents only gather evidence. The single model pass
// is the synthesis in step 6.

import { NextResponse } from "next/server";
import { z } from "zod";
import { withHarness, runStep, easternDay } from "@/lib/live/harness";
import { runDiscoveryWave } from "@/agents/discovery";
import { planWaves } from "@/lib/discoveryRun";
import { collector } from "@/lib/live/collect";
import { getStepResult } from "@/lib/live/runState";
import { apiError } from "@/lib/apiError";
import type { ScoutPick } from "@/lib/scoutTypes";

export const maxDuration = 300;

const BodySchema = z.object({
  runId: z.string().min(1).optional(),
  waveIndex: z.number().int().min(0).max(20),
});

export const POST = withHarness(async (req) => {
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiError("validation_error", "Invalid body", 400, z.flattenError(parsed.error));
  }

  const tradingDay = easternDay();
  const runId = parsed.data.runId ?? tradingDay;
  const { waveIndex } = parsed.data;

  // The wave plan is re-derived from the stored shortlist rather than passed in
  // by the runner. planWaves is deterministic, so this cannot disagree with what
  // the scout step planned — and it means the runner cannot accidentally hand a
  // wave a ticker the scout never picked.
  const scout = await getStepResult<{ picks: ScoutPick[] }>(runId, "scout");
  if (!scout) {
    return apiError("out_of_order", "Run the scout step before requesting a wave", 409);
  }

  const waves = planWaves(scout.picks);
  const waveReq = waves[waveIndex];
  if (!waveReq) {
    return apiError(
      "out_of_range",
      `waveIndex ${waveIndex} does not exist; this run planned ${waves.length} waves`,
      400
    );
  }

  const { result, replayed } = await runStep(runId, `wave_${waveIndex}`, async () => {
    const { emit, collected } = collector();
    await runDiscoveryWave(waveReq, emit);

    const waveResult = collected.first("wave_result");
    if (!waveResult) throw new Error(`Wave ${waveIndex} produced no evidence`);

    return { runId, tradingDay, waveIndex, totalWaves: waves.length, wave: waveResult.wave };
  });

  return NextResponse.json({ ...result, replayed });
});
