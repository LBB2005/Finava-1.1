// Wave planning + evidence merging for the discovery funnel.
//
// This logic used to live inline in ChatEngine.tsx (twice — once in the live
// wave loop, once in the resume-from-stored-messages path). Both the chat client
// and the Finava Live harness need to chunk a shortlist into waves the same way,
// so it lives here: pure, no React, no server-only imports, and testable.
//
// The transport loop stays with each caller — the chat client streams waves over
// SSE for progress and cancel, the harness runs one wave per HTTP invocation to
// stay under Vercel's maxDuration. Only the chunking and the merge are shared.

import {
  WAVE_SIZE,
  VALUATION_PER_WAVE,
  emptyEvidence,
  type ScoutPick,
  type WaveRequest,
  type WaveEvidence,
  type DiscoverEvidence,
} from "@/lib/scoutTypes";

/**
 * Chunk a shortlist into deterministic crew waves of ≤WAVE_SIZE.
 *
 * Each wave carries its own index and the total, because the wave runner emits
 * progress against them. `valuationTickers` is the wave's top-VALUATION_PER_WAVE
 * by fit — picks arrive already fit-ordered from the scout, so slicing the head
 * of the wave is the selection.
 */
export function planWaves(picks: ScoutPick[]): WaveRequest[] {
  const totalWaves = Math.ceil(picks.length / WAVE_SIZE);
  const waves: WaveRequest[] = [];
  for (let w = 0; w < totalWaves; w++) {
    const wavePicks = picks.slice(w * WAVE_SIZE, (w + 1) * WAVE_SIZE);
    waves.push({
      tickers: wavePicks.map((p) => p.ticker),
      sectors: [...new Set(wavePicks.map((p) => p.sector))],
      waveIndex: w,
      totalWaves,
      valuationTickers: wavePicks.slice(0, VALUATION_PER_WAVE).map((p) => p.ticker),
    });
  }
  return waves;
}

/**
 * Fold one wave's evidence into the accumulator. Pure — returns a new object so
 * a caller can't accidentally share mutable state across two runs.
 *
 * Per-ticker valuation is merged agent-by-agent rather than replaced: a ticker
 * can pick up valuation output in more than one wave on a resume, and the later
 * output wins per agent without dropping the earlier agents.
 */
export function mergeWaveEvidence(
  evidence: DiscoverEvidence,
  wave: WaveEvidence
): DiscoverEvidence {
  const valuation: DiscoverEvidence["valuation"] = { ...evidence.valuation };
  for (const [ticker, byAgent] of Object.entries(wave.valuation)) {
    valuation[ticker] = { ...(valuation[ticker] ?? {}), ...byAgent };
  }
  return { waves: [...evidence.waves, wave], valuation };
}

/** Fold a sequence of waves in order. Used by the resume path. */
export function mergeWaves(waves: WaveEvidence[]): DiscoverEvidence {
  return waves.reduce(mergeWaveEvidence, emptyEvidence());
}
