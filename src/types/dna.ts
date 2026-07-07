import type { FactorKey } from "@/lib/research";

/**
 * Investor DNA — the derived, persistent model of who a user is as an investor.
 *
 * It is computed deterministically from the user's holdings (their real money)
 * crossed with the factor engine (`@/lib/research` + `@/lib/factorUniverse`).
 * No LLM is on the critical path: the "it knows me" read is math, not a guess.
 * See `@/lib/investorDna` for the derivation and `docs`/the design plan for the
 * product rationale.
 */

/** A user's real track record on holdings heavily exposed to one factor. */
export interface TraitRecord {
  factor: FactorKey;
  /** Human label from `FACTORS` (e.g. "Momentum"). */
  label: string;
  /** Share of portfolio value (%) sitting in holdings with high exposure to this factor. */
  exposurePct: number;
  /** Value-weighted return (%) of those holdings — real P&L from `avgCost` vs. live price. */
  avgReturnPct: number;
  /** How many of those holdings are in the green. */
  hits: number;
  /** How many holdings are in the bucket. */
  total: number;
  /** "thin" when `total < 3` — render muted, never as a confident edge. */
  sample: "real" | "thin";
}

/** A behavioural read derived from the portfolio (concentration, factor tilt). */
export interface Tendency {
  key: string;
  label: string;
  detail: string;
}

/** How much of the portfolio the DNA could actually read. */
export interface CoverageInfo {
  /** Positions matched to the universe or an ETF profile. */
  analyzed: number;
  /** Total holdings considered. */
  total: number;
  /** Tickers we couldn't cover yet (non-S&P, crypto, bonds, etc.). */
  uncovered: string[];
}

/** The full derived model, cached at `users/{uid}/investorDNA/current`. */
export interface InvestorDNA {
  /** Each factor 0–100: market-value-weighted average of holdings' factor scores. */
  dnaVector: Record<FactorKey, number>;
  /** Named identity from the top factors, e.g. "Quality compounder". */
  archetype: string;
  /** Nearest Tune preset label, e.g. "Quality Compounder". */
  matchedPreset: string;
  /** The balanced-read editorial sentence (deterministic template). */
  identityLine: string;
  /** Per-factor real track record, sorted by `avgReturnPct` descending. */
  traitRecord: TraitRecord[];
  /** Concentration + factor tilt reads. */
  tendencies: Tendency[];
  /** 0–100 "how well I know you" — scales with holdings + convictions. */
  knownness: number;
  holdingsCount: number;
  /** What fraction of the portfolio the DNA could read, and what it couldn't. */
  coverage: CoverageInfo;
  updatedAt: string;
}

export type ConvictionDirection = "bull" | "bear" | "watching";
export type ConvictionStatus = "forming" | "playing_out" | "broken" | "closed";
export type ConvictionSource = "manual" | "holding" | "chat" | "confirmed";

/** One entry in the Conviction Ledger — a thesis the user holds, with its falsifier. */
export interface Conviction {
  id: string;
  ticker: string;
  direction: ConvictionDirection;
  /** Semantic "voice" of the thesis, e.g. "post-hype reset" (manual in v1, LLM-drafted in v2). */
  thesisTrait: string;
  /** Link back to the measurable skeleton. */
  factorTags: FactorKey[];
  reasoning: string;
  /** What would prove the thesis wrong — the accountability hook. */
  falsifier: string;
  confidence: number;
  status: ConvictionStatus;
  source: ConvictionSource;
  /** Realised/unrealised return (%) since the thesis formed; null until known. */
  outcomePct: number | null;
  createdAt: string;
  updatedAt: string;
}

/** The personalized one-liner the Lens renders on a stock page. */
export type LensTone = "edge" | "caution" | "neutral";
export interface LensLine {
  line: string;
  tone: LensTone;
  href: string;
}
