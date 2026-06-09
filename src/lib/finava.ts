// Shared types + protocol for the Finava Analysis tab. The POST
// /api/stock/[ticker]/finava-analysis route streams these as `data:` SSE lines;
// finavaStore parses them back into a FinavaAnalysis on the client.

export type SignalKey = "fundamentals" | "momentum" | "sentiment" | "analyst" | "insider";

export type Stance = "bullish" | "neutral" | "bearish";

export interface FinavaSignal {
  key: SignalKey;
  label: string;
  score: number; // 0–100 (50 = neutral)
  stance: Stance;
  headline: string; // one short line
  detail: string; // 1–2 sentences
}

export interface FinavaVerdict {
  score: number; // 0–100 overall Finava score
  stance: string; // human label, e.g. "Moderately Bullish"
  confidence: "Low" | "Moderate" | "High";
  fairValue: number | null; // Finava's own fair value estimate
  upsidePct: number | null; // vs current price
  take: string; // 2–3 sentence written verdict
  catalysts: string[];
  risks: string[];
  comparison: {
    finava: number | null;
    street: number | null; // analyst mean target
    dcf: number | null; // model fair value under default assumptions
  };
}

export interface FinavaAnalysis {
  signals: FinavaSignal[];
  verdict: FinavaVerdict | null;
}

// ── SSE wire protocol ────────────────────────────────────────────────────────
export type FinavaEvent =
  | { type: "signal"; signal: FinavaSignal }
  | { type: "verdict"; verdict: FinavaVerdict }
  | { type: "error"; message: string };

export const SIGNAL_LABELS: Record<SignalKey, string> = {
  fundamentals: "Fundamentals",
  momentum: "Momentum",
  sentiment: "Sentiment",
  analyst: "Analyst",
  insider: "Insider Flow",
};

export const SIGNAL_ORDER: SignalKey[] = [
  "fundamentals",
  "momentum",
  "sentiment",
  "analyst",
  "insider",
];

export function stanceFromScore(score: number): Stance {
  if (score >= 60) return "bullish";
  if (score <= 40) return "bearish";
  return "neutral";
}

/** Map an overall 0–100 score to the verdict label shown on the badge. */
export function verdictLabel(score: number): string {
  if (score >= 78) return "Bullish";
  if (score >= 60) return "Moderately Bullish";
  if (score > 40) return "Neutral";
  if (score > 22) return "Moderately Bearish";
  return "Bearish";
}
