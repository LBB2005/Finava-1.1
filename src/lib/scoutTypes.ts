// Shared shapes for the chat discovery funnel — imported by the scout agent, the
// /api/agent route, the discovery wave runner, and the client wave driver. Keeping
// them in one lib module (no React/server-only imports) avoids a circular dep
// between @/types/chat (events) and the agent code.

import type { FactorScores } from "@/lib/research";

export type DiscoverTier = "quick" | "deep";

/** One candidate the scout surfaced. Compact — never the full Stock. */
export interface ScoutPick {
  ticker: string;
  name: string;
  sector: string;
  /** Factor composite (0–100) — the numeric backbone, used for display + tie-breaks. */
  score: number;
  grade: string;
  /** 1-based rank in the LLM's query-fit ordering (the primary order). */
  fitRank: number;
  /** Six factor sub-scores, for the radar / candidate cards. */
  f: FactorScores;
  /** One-line LLM rationale for why this name fits the query. */
  reason: string;
  marketCap?: number | null;
  pe?: number | null;
  price?: number;
}

/** What the scout produced for a given query. */
export interface ScoutResult {
  tier: DiscoverTier;
  asOf: string;
  query: string;
  /** Plain-English restatement of how the query was interpreted. */
  interpretation: string;
  /** Coverage of the underlying universe (how many names had real data). */
  coverage?: { total: number; fundamentals: number; analyst: number; momentum: number; priced: number };
  picks: ScoutPick[];
}

/**
 * One wave's crew evidence. Batch agents (risk/news/technical/…) each return a
 * single output covering all of the wave's tickers → stored once under `batch`.
 * Valuation agents (dcf/graham/…) are single-name → stored per ticker.
 */
export interface WaveEvidence {
  waveIndex: number;
  tickers: string[];
  valuationTickers: string[];
  /** Batch-agent outputs covering this wave: agentName → output (may be an error string). */
  batch: Record<string, string>;
  /** Per-ticker single-name valuation: ticker → agentName → output. */
  valuation: Record<string, Record<string, string>>;
}

/** Accumulated evidence across all waves, handed to the synthesis pass. */
export interface DiscoverEvidence {
  waves: WaveEvidence[];
  /** Merged per-ticker valuation across waves (convenience for synthesis). */
  valuation: Record<string, Record<string, string>>;
}

export function emptyEvidence(): DiscoverEvidence {
  return { waves: [], valuation: {} };
}

/** Body the client POSTs to run one deterministic crew wave. */
export interface WaveRequest {
  tickers: string[];
  sectors: string[];
  waveIndex: number;
  totalWaves: number;
  /** The ≤3 tickers in this wave that get the heavy valuation agents (top by fit). */
  valuationTickers: string[];
}

/** Body the client POSTs to run the single final synthesis pass. */
export interface SynthesizeRequest {
  synthesize: true;
  query: string;
  picks: ScoutPick[];
  evidence: DiscoverEvidence;
}

/**
 * Discover messages are stored as JSON in ChatMessage.content with a `kind`
 * discriminator and rendered via the same JSON-in-content pattern as backtests.
 */
export type DiscoverMessageContent =
  | { kind: "shortlist"; tier: DiscoverTier; query: string; framing?: string; picks: ScoutPick[] }
  | { kind: "wave"; wave: WaveEvidence; totalWaves: number }
  | { kind: "final"; report: string };

/** Chunk the shortlist into waves of ≤5 (the news-agent hard cap). */
export const WAVE_SIZE = 5;
/** Heavy valuation agents run on this many top-by-fit names per wave. */
export const VALUATION_PER_WAVE = 3;
