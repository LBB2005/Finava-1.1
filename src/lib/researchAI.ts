// Shared client⇄server types for the AI research lenses (Compare, Screen
// commentary, Themes, Signals). Pure types + small helpers, no runtime deps on
// server-only modules so both sides can import freely.

import type { FactorKey } from "@/lib/research";

// ── Compare ────────────────────────────────────────────────────────────────
/** A stock as sent to /api/research/compare (already scored client-side). */
export interface CompareStock {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  chg: number;
  pe?: number | null;
  marketCap?: number | null;
  f: Record<FactorKey, number>;
}

export interface ComparePerStock {
  ticker: string;
  oneLiner: string; // one-sentence characterisation
  bullCase: string;
  bearCase: string;
}

export interface CompareVerdict {
  winner: string; // ticker the AI judges strongest, or "" if a genuine toss-up
  summary: string; // 2–3 sentence head-to-head read
  perStock: ComparePerStock[];
}

// ── Screen commentary ────────────────────────────────────────────────────────
export interface ScreenCommentary {
  commentary: string; // what the basket has in common
  standout: string; // the single most interesting name + why
  watchout: string; // the main risk / caveat for the group
}

export interface SuggestedScreen {
  label: string; // short chip label
  rationale: string; // one line on why it's timely
  query: string; // NL query that runs when clicked
}

// ── Themes ───────────────────────────────────────────────────────────────────
export interface Theme {
  key: string;
  name: string;
  thesis: string; // 1–2 sentence rationale
  tickers: string[]; // validated against the S&P 500 universe
}

// ── Signals ───────────────────────────────────────────────────────────────────
export type SignalCategory =
  | "mover"
  | "volume"
  | "breakout"
  | "analyst"
  | "value"
  | "grade";

export const SIGNAL_CATEGORY_LABEL: Record<SignalCategory, string> = {
  mover: "Big Move",
  volume: "Volume Spike",
  breakout: "Momentum Breakout",
  analyst: "Analyst Skew",
  value: "Deep Value",
  grade: "Top Grade",
};

/** A raw, data-derived event sent up for narration (client-computed). */
export interface SignalEvent {
  ticker: string;
  name: string;
  sector: string;
  category: SignalCategory;
  /** Compact fact string for the model to narrate (e.g. "+6.1% today, RVOL 3.2x"). */
  fact: string;
  /** Heuristic bull/bear lean from the data, -1..1. */
  lean: number;
}

export interface SignalFeedItem {
  ticker: string;
  category: SignalCategory;
  headline: string; // short, punchy
  take: string; // 1–2 sentence narration
  sentiment: "bullish" | "neutral" | "bearish";
}
