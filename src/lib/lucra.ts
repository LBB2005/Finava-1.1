// Shared types + protocol for the Lucra Analysis tab. The POST
// /api/stock/[ticker]/lucra-analysis route streams these as `data:` SSE lines;
// lucraStore parses them back into a LucraAnalysis on the client.

export type SignalKey = "fundamentals" | "momentum" | "sentiment" | "analyst" | "insider";

export type Stance = "bullish" | "neutral" | "bearish";

export interface LucraSignal {
  key: SignalKey;
  label: string;
  score: number; // 0–100 (50 = neutral)
  stance: Stance;
  headline: string; // one short line
  detail: string; // 1–2 sentences
}

export interface LucraVerdict {
  score: number; // 0–100 overall Lucra score
  stance: string; // human label, e.g. "Moderately Bullish"
  confidence: "Low" | "Moderate" | "High";
  fairValue: number | null; // Lucra's own fair value estimate
  upsidePct: number | null; // vs current price
  take: string; // 2–3 sentence written verdict
  catalysts: string[];
  risks: string[];
  comparison: {
    lucra: number | null;
    street: number | null; // analyst mean target
    dcf: number | null; // model fair value under default assumptions
  };
}

export interface LucraAnalysis {
  signals: LucraSignal[];
  verdict: LucraVerdict | null;
}

// ── SSE wire protocol ────────────────────────────────────────────────────────
export type LucraEvent =
  | { type: "signal"; signal: LucraSignal }
  | { type: "verdict"; verdict: LucraVerdict }
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
