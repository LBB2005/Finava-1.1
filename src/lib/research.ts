/* ============================================================
   Lucra · Research — scoring engine + seed universe
   ------------------------------------------------------------
   The Lucra Score is a 0–100 composite of six factor sub-scores,
   re-weighted per holding horizon. Same engine, three weightings:
   a stock can grade A for the year but C for the week.

   NOTE: UNIVERSE below is seed/mock data so the page renders end-
   to-end today. The factor sub-scores and prices are placeholders.
   A later phase replaces UNIVERSE with a precomputed S&P 500 feed
   (nightly job → Firestore/API); every function here stays the same.
   ============================================================ */

export type FactorKey = "mom" | "growth" | "quality" | "analyst" | "value" | "health";

export interface Factor {
  key: FactorKey;
  label: string;
  short: string;
  full: string;
}

export type FactorScores = Record<FactorKey, number>;

export type HorizonKey = "week" | "month" | "year";

export interface Horizon {
  key: HorizonKey;
  label: string;
  sub: string;
  tag: string;
}

export interface Stock {
  ticker: string;
  name: string;
  sector: string;
  /** Last price. */
  price: number;
  /** Today's % move. */
  chg: number;
  /** Six factor sub-scores, each 0–100. */
  f: FactorScores;
  /** Actual realised price move (%) over each window — backward-looking. */
  mv: Record<HorizonKey, number>;
  // ── Live market data, overlaid by `overlayLive` from /api/leaderboard. ──
  //    Undefined before the feed loads; null when a source has no value for
  //    this ticker (render as "—", never as a fabricated number). The seed
  //    price/chg above are placeholders the overlay replaces.
  /** Market capitalisation in USD (absolute, not millions). */
  marketCap?: number | null;
  /** Trailing-twelve-month price/earnings ratio. */
  pe?: number | null;
  /** 10-day average daily share volume (absolute shares, consolidated). */
  avgVol?: number | null;
  /** Relative volume: latest session volume ÷ 10-day average (1.4 = 140%). */
  rvol?: number | null;
  /** True once a live quote has been applied (so the UI can stop showing a loading state). */
  live?: boolean;
}

/** Live market-data overlay for one ticker, as returned by /api/leaderboard. */
export interface LiveRow {
  ticker: string;
  price: number | null;
  changePct: number | null;
  marketCap: number | null; // absolute USD
  pe: number | null;
  avgVol: number | null; // absolute shares
  rvol: number | null;
}

export interface RankedStock extends Stock {
  score: number;
  grade: string;
  rank: number;
}

export interface Pick extends RankedStock {
  horizon: Horizon;
  take: string;
}

export interface Mover extends Stock {
  move: number;
}

// Six factor dimensions (each authored 0–100 per stock).
export const FACTORS: Factor[] = [
  { key: "mom", label: "Momentum", short: "MOM", full: "Momentum & Technicals" },
  { key: "growth", label: "Growth", short: "GRW", full: "Growth" },
  { key: "quality", label: "Quality", short: "QAL", full: "Profitability & Quality" },
  { key: "analyst", label: "Analyst", short: "ANL", full: "Analyst Sentiment" },
  { key: "value", label: "Valuation", short: "VAL", full: "Valuation" },
  { key: "health", label: "Health", short: "FIN", full: "Financial Health & Risk" },
];

// Horizon weightings (each sums to 1.0).
export const WEIGHTS: Record<HorizonKey, FactorScores> = {
  week: { mom: 0.4, analyst: 0.22, growth: 0.1, quality: 0.08, health: 0.1, value: 0.1 },
  month: { mom: 0.2, growth: 0.2, quality: 0.16, analyst: 0.18, value: 0.12, health: 0.14 },
  year: { mom: 0.08, growth: 0.24, quality: 0.22, analyst: 0.1, value: 0.18, health: 0.18 },
};

export const HORIZONS: Horizon[] = [
  { key: "week", label: "This Week", sub: "Short-term · momentum-led", tag: "1W" },
  { key: "month", label: "This Month", sub: "Medium-term · blended", tag: "1M" },
  { key: "year", label: "This Year", sub: "Long-term · fundamentals-led", tag: "1Y" },
];

// ── Universe: real S&P 500 tickers, plausible May-2026 prices (seed data) ──
type Row = [string, string, string, number, number, FactorScores, Record<HorizonKey, number>];

const U: Row[] = [
  ["NVDA", "NVIDIA", "Technology", 1342.5, 2.8, { mom: 96, growth: 90, quality: 90, analyst: 95, value: 22, health: 85 }, { week: 5.4, month: 12.1, year: 84.2 }],
  ["MSFT", "Microsoft", "Technology", 478.9, 0.9, { mom: 80, growth: 80, quality: 97, analyst: 90, value: 38, health: 95 }, { week: 1.8, month: 4.6, year: 28.4 }],
  ["META", "Meta Platforms", "Communication Svcs", 612.3, 1.6, { mom: 88, growth: 84, quality: 86, analyst: 90, value: 46, health: 90 }, { week: 3.1, month: 9.2, year: 41.7 }],
  ["AAPL", "Apple", "Technology", 232.18, -0.4, { mom: 72, growth: 58, quality: 95, analyst: 74, value: 42, health: 90 }, { week: 0.6, month: -1.4, year: 9.8 }],
  ["GOOGL", "Alphabet", "Communication Svcs", 192.4, 1.1, { mom: 75, growth: 74, quality: 88, analyst: 86, value: 52, health: 92 }, { week: 2.2, month: 6.0, year: 22.9 }],
  ["AMZN", "Amazon", "Consumer Disc.", 214.75, 0.7, { mom: 78, growth: 80, quality: 76, analyst: 89, value: 40, health: 82 }, { week: 1.9, month: 5.3, year: 31.0 }],
  ["AVGO", "Broadcom", "Technology", 1685.2, 2.1, { mom: 90, growth: 88, quality: 84, analyst: 87, value: 38, health: 76 }, { week: 4.6, month: 10.8, year: 58.3 }],
  ["LLY", "Eli Lilly", "Health Care", 884.6, 1.4, { mom: 70, growth: 96, quality: 90, analyst: 84, value: 30, health: 80 }, { week: 2.0, month: 3.4, year: 18.6 }],
  ["JPM", "JPMorgan Chase", "Financials", 248.9, 0.3, { mom: 74, growth: 56, quality: 82, analyst: 78, value: 70, health: 86 }, { week: 0.9, month: 2.7, year: 24.1 }],
  ["XOM", "Exxon Mobil", "Energy", 118.4, -1.2, { mom: 52, growth: 40, quality: 72, analyst: 60, value: 78, health: 80 }, { week: -2.4, month: -5.1, year: -3.8 }],
  ["COST", "Costco", "Consumer Staples", 1042.8, 0.5, { mom: 82, growth: 64, quality: 94, analyst: 76, value: 26, health: 88 }, { week: 1.4, month: 3.9, year: 27.5 }],
  ["WMT", "Walmart", "Consumer Staples", 82.15, 0.8, { mom: 84, growth: 58, quality: 80, analyst: 80, value: 44, health: 84 }, { week: 1.7, month: 4.2, year: 36.2 }],
  ["V", "Visa", "Financials", 312.6, 0.2, { mom: 68, growth: 66, quality: 96, analyst: 82, value: 42, health: 92 }, { week: 0.7, month: 2.1, year: 14.3 }],
  ["MA", "Mastercard", "Financials", 538.4, 0.4, { mom: 70, growth: 70, quality: 95, analyst: 84, value: 40, health: 90 }, { week: 1.1, month: 2.8, year: 16.9 }],
  ["UNH", "UnitedHealth", "Health Care", 512.3, -2.6, { mom: 28, growth: 60, quality: 78, analyst: 64, value: 82, health: 74 }, { week: -5.8, month: -12.4, year: -31.7 }],
  ["TSLA", "Tesla", "Consumer Disc.", 348.2, 4.2, { mom: 58, growth: 62, quality: 58, analyst: 50, value: 22, health: 70 }, { week: 8.9, month: -4.2, year: 11.4 }],
  ["HD", "Home Depot", "Consumer Disc.", 408.9, -0.3, { mom: 64, growth: 48, quality: 86, analyst: 72, value: 56, health: 82 }, { week: 0.4, month: 1.1, year: 7.2 }],
  ["PG", "Procter & Gamble", "Consumer Staples", 168.4, 0.1, { mom: 60, growth: 44, quality: 90, analyst: 70, value: 50, health: 88 }, { week: 0.3, month: 0.8, year: 6.1 }],
  ["JNJ", "Johnson & Johnson", "Health Care", 162.8, -0.5, { mom: 50, growth: 42, quality: 88, analyst: 66, value: 68, health: 94 }, { week: -0.9, month: -1.8, year: 4.4 }],
  ["CVX", "Chevron", "Energy", 158.2, -1.0, { mom: 48, growth: 38, quality: 74, analyst: 62, value: 76, health: 82 }, { week: -1.9, month: -4.3, year: -1.2 }],
  ["ABBV", "AbbVie", "Health Care", 198.6, 0.6, { mom: 72, growth: 64, quality: 80, analyst: 74, value: 58, health: 70 }, { week: 1.5, month: 4.8, year: 21.3 }],
  ["CRM", "Salesforce", "Technology", 298.4, 1.0, { mom: 66, growth: 72, quality: 78, analyst: 80, value: 54, health: 80 }, { week: 1.6, month: 3.2, year: 12.7 }],
  ["AMD", "Advanced Micro Devices", "Technology", 178.9, 3.1, { mom: 80, growth: 86, quality: 70, analyst: 82, value: 34, health: 74 }, { week: 6.2, month: 8.4, year: 39.8 }],
  ["NFLX", "Netflix", "Communication Svcs", 982.4, 1.9, { mom: 86, growth: 78, quality: 82, analyst: 81, value: 40, health: 78 }, { week: 3.4, month: 7.1, year: 48.5 }],
  ["CAT", "Caterpillar", "Industrials", 392.8, -0.7, { mom: 76, growth: 54, quality: 80, analyst: 70, value: 60, health: 80 }, { week: 1.2, month: 5.6, year: 19.4 }],
  ["GE", "GE Aerospace", "Industrials", 198.4, 1.3, { mom: 84, growth: 72, quality: 76, analyst: 83, value: 50, health: 78 }, { week: 2.6, month: 6.9, year: 44.1 }],
  ["NEE", "NextEra Energy", "Utilities", 78.6, -0.6, { mom: 44, growth: 56, quality: 76, analyst: 68, value: 64, health: 72 }, { week: -1.1, month: -2.6, year: 2.8 }],
  ["LIN", "Linde", "Materials", 472.3, 0.4, { mom: 66, growth: 60, quality: 88, analyst: 78, value: 52, health: 86 }, { week: 0.9, month: 2.4, year: 13.6 }],
  ["BAC", "Bank of America", "Financials", 44.8, 0.5, { mom: 62, growth: 50, quality: 72, analyst: 70, value: 74, health: 78 }, { week: 1.3, month: 3.5, year: 17.8 }],
  ["KO", "Coca-Cola", "Consumer Staples", 68.9, 0.2, { mom: 58, growth: 46, quality: 86, analyst: 72, value: 56, health: 86 }, { week: 0.5, month: 1.6, year: 8.9 }],

  // ── High-momentum / breakout names (surface on a momentum lens) ──
  ["SMCI", "Super Micro Computer", "Technology", 52.3, 5.6, { mom: 98, growth: 92, quality: 52, analyst: 76, value: 32, health: 58 }, { week: 11.2, month: 18.4, year: 62.1 }],
  ["PLTR", "Palantir", "Technology", 78.4, 4.8, { mom: 97, growth: 90, quality: 62, analyst: 70, value: 16, health: 72 }, { week: 9.4, month: 22.0, year: 118.0 }],
  ["CVNA", "Carvana", "Consumer Disc.", 312.5, 6.1, { mom: 96, growth: 88, quality: 40, analyst: 64, value: 20, health: 44 }, { week: 12.8, month: 9.7, year: 96.0 }],
  ["VST", "Vistra", "Utilities", 148.9, 2.7, { mom: 92, growth: 78, quality: 66, analyst: 80, value: 40, health: 62 }, { week: 5.2, month: 13.0, year: 88.0 }],
  ["ANET", "Arista Networks", "Technology", 96.2, 2.4, { mom: 90, growth: 84, quality: 82, analyst: 84, value: 34, health: 84 }, { week: 4.8, month: 11.2, year: 52.0 }],
  ["DELL", "Dell Technologies", "Technology", 138.7, 3.0, { mom: 88, growth: 74, quality: 60, analyst: 80, value: 48, health: 56 }, { week: 5.6, month: 8.1, year: 46.3 }],
  ["MU", "Micron Technology", "Technology", 132.4, 3.3, { mom: 86, growth: 80, quality: 58, analyst: 82, value: 44, health: 64 }, { week: 6.0, month: 7.4, year: 41.2 }],
  ["DASH", "DoorDash", "Consumer Disc.", 178.3, 2.0, { mom: 84, growth: 86, quality: 56, analyst: 74, value: 22, health: 68 }, { week: 3.8, month: 9.0, year: 55.0 }],
  ["UBER", "Uber Technologies", "Industrials", 86.4, 1.7, { mom: 80, growth: 82, quality: 64, analyst: 85, value: 38, health: 66 }, { week: 3.0, month: 6.4, year: 38.0 }],

  // ── Growth / software (year + quality lens) ──
  ["NOW", "ServiceNow", "Technology", 1024.5, 1.2, { mom: 78, growth: 88, quality: 86, analyst: 88, value: 26, health: 84 }, { week: 2.4, month: 5.6, year: 33.0 }],
  ["PANW", "Palo Alto Networks", "Technology", 372.6, 1.5, { mom: 80, growth: 84, quality: 80, analyst: 86, value: 30, health: 78 }, { week: 2.8, month: 6.1, year: 40.0 }],
  ["INTU", "Intuit", "Technology", 648.2, 0.6, { mom: 70, growth: 76, quality: 90, analyst: 82, value: 34, health: 88 }, { week: 1.4, month: 3.0, year: 18.0 }],
  ["ADBE", "Adobe", "Technology", 488.9, -0.8, { mom: 46, growth: 70, quality: 92, analyst: 72, value: 56, health: 90 }, { week: -1.2, month: -3.4, year: -8.0 }],
  ["TXN", "Texas Instruments", "Technology", 198.7, 0.4, { mom: 64, growth: 54, quality: 90, analyst: 74, value: 50, health: 90 }, { week: 0.8, month: 2.2, year: 14.0 }],
  ["QCOM", "Qualcomm", "Technology", 168.3, 1.0, { mom: 66, growth: 60, quality: 80, analyst: 76, value: 62, health: 82 }, { week: 1.6, month: 3.4, year: 16.0 }],

  // ── Quality compounders (quality lens) ──
  ["MCO", "Moody's", "Financials", 472.1, 0.3, { mom: 66, growth: 64, quality: 96, analyst: 80, value: 32, health: 88 }, { week: 1.0, month: 2.6, year: 15.0 }],
  ["MSCI", "MSCI", "Financials", 562.8, 0.5, { mom: 64, growth: 70, quality: 95, analyst: 78, value: 28, health: 84 }, { week: 1.2, month: 2.8, year: 17.0 }],
  ["SPGI", "S&P Global", "Financials", 512.6, 0.4, { mom: 68, growth: 66, quality: 94, analyst: 82, value: 34, health: 88 }, { week: 1.1, month: 2.9, year: 18.0 }],
  ["ADP", "ADP", "Industrials", 298.4, 0.2, { mom: 62, growth: 54, quality: 92, analyst: 72, value: 46, health: 92 }, { week: 0.6, month: 1.8, year: 12.0 }],
  ["ACN", "Accenture", "Technology", 342.9, -0.4, { mom: 52, growth: 58, quality: 90, analyst: 70, value: 52, health: 90 }, { week: -0.6, month: -1.2, year: 4.0 }],

  // ── Deep value / income (value lens) ──
  ["F", "Ford Motor", "Consumer Disc.", 11.8, -0.6, { mom: 38, growth: 30, quality: 50, analyst: 48, value: 92, health: 54 }, { week: -1.0, month: -2.4, year: -8.0 }],
  ["GM", "General Motors", "Consumer Disc.", 52.4, 0.4, { mom: 54, growth: 44, quality: 58, analyst: 60, value: 90, health: 62 }, { week: 1.2, month: 4.0, year: 22.0 }],
  ["T", "AT&T", "Communication Svcs", 27.6, 0.3, { mom: 60, growth: 34, quality: 62, analyst: 58, value: 86, health: 60 }, { week: 0.8, month: 3.2, year: 30.0 }],
  ["VZ", "Verizon", "Communication Svcs", 43.2, 0.1, { mom: 50, growth: 30, quality: 66, analyst: 56, value: 88, health: 64 }, { week: 0.4, month: 1.6, year: 12.0 }],
  ["MO", "Altria", "Consumer Staples", 58.9, 0.2, { mom: 62, growth: 32, quality: 78, analyst: 54, value: 84, health: 58 }, { week: 0.6, month: 2.4, year: 24.0 }],
  ["KHC", "Kraft Heinz", "Consumer Staples", 29.4, -0.5, { mom: 30, growth: 28, quality: 60, analyst: 44, value: 90, health: 62 }, { week: -1.4, month: -4.0, year: -14.0 }],
  ["C", "Citigroup", "Financials", 72.8, 0.6, { mom: 64, growth: 48, quality: 60, analyst: 66, value: 88, health: 68 }, { week: 1.4, month: 5.0, year: 34.0 }],
  ["PFE", "Pfizer", "Health Care", 26.3, -0.4, { mom: 32, growth: 36, quality: 70, analyst: 52, value: 86, health: 74 }, { week: -1.0, month: -2.8, year: -12.0 }],
  ["MET", "MetLife", "Financials", 84.6, 0.3, { mom: 58, growth: 46, quality: 64, analyst: 62, value: 82, health: 72 }, { week: 0.9, month: 3.0, year: 18.0 }],
  ["DOW", "Dow Inc.", "Materials", 38.7, -0.8, { mom: 34, growth: 32, quality: 54, analyst: 50, value: 84, health: 58 }, { week: -1.6, month: -4.4, year: -16.0 }],
  ["BMY", "Bristol-Myers Squibb", "Health Care", 52.1, -0.3, { mom: 40, growth: 42, quality: 72, analyst: 56, value: 84, health: 70 }, { week: -0.8, month: -1.6, year: -4.0 }],

  // ── Cyclicals / industrials / energy / staples (mid, broaden the field) ──
  ["DE", "Deere & Co.", "Industrials", 412.3, -0.5, { mom: 62, growth: 50, quality: 82, analyst: 68, value: 58, health: 80 }, { week: 0.8, month: 3.4, year: 14.0 }],
  ["BA", "Boeing", "Industrials", 182.4, -1.4, { mom: 44, growth: 48, quality: 40, analyst: 58, value: 50, health: 42 }, { week: -2.8, month: -6.0, year: -10.0 }],
  ["RTX", "RTX Corp.", "Industrials", 122.8, 0.7, { mom: 72, growth: 56, quality: 74, analyst: 72, value: 58, health: 76 }, { week: 1.6, month: 4.6, year: 26.0 }],
  ["LMT", "Lockheed Martin", "Industrials", 468.9, 0.4, { mom: 58, growth: 44, quality: 80, analyst: 66, value: 60, health: 78 }, { week: 0.8, month: 2.0, year: 10.0 }],
  ["UPS", "United Parcel Service", "Industrials", 132.6, -0.6, { mom: 42, growth: 40, quality: 74, analyst: 60, value: 66, health: 74 }, { week: -1.0, month: -2.2, year: -8.0 }],
  ["COP", "ConocoPhillips", "Energy", 102.4, -1.0, { mom: 50, growth: 42, quality: 74, analyst: 64, value: 76, health: 80 }, { week: -1.8, month: -3.8, year: -2.0 }],
  ["SLB", "Schlumberger", "Energy", 42.1, -1.3, { mom: 40, growth: 44, quality: 66, analyst: 62, value: 74, health: 70 }, { week: -2.2, month: -5.0, year: -10.0 }],
  ["PEP", "PepsiCo", "Consumer Staples", 152.3, 0.1, { mom: 48, growth: 44, quality: 86, analyst: 66, value: 54, health: 84 }, { week: 0.4, month: 1.0, year: 2.0 }],
  ["MRK", "Merck", "Health Care", 98.6, -0.4, { mom: 46, growth: 54, quality: 82, analyst: 64, value: 64, health: 82 }, { week: -0.8, month: -1.4, year: -2.0 }],
  ["TMO", "Thermo Fisher", "Health Care", 542.8, 0.3, { mom: 56, growth: 62, quality: 88, analyst: 74, value: 48, health: 86 }, { week: 1.0, month: 2.4, year: 10.0 }],
  ["ABT", "Abbott Laboratories", "Health Care", 118.4, 0.4, { mom: 60, growth: 56, quality: 86, analyst: 72, value: 52, health: 86 }, { week: 1.0, month: 2.8, year: 14.0 }],
];

export const UNIVERSE: Stock[] = U.map(([ticker, name, sector, price, chg, f, mv]) => ({
  ticker,
  name,
  sector,
  price,
  chg,
  f,
  mv,
}));

/** Ticker → company name, for surfaces (e.g. watchlist) that only store symbols. */
export const NAME_BY_TICKER: Record<string, string> = Object.fromEntries(
  UNIVERSE.map((s) => [s.ticker, s.name]),
);

export const SECTORS: string[] = Array.from(new Set(UNIVERSE.map((s) => s.sector))).sort();

export const AS_OF = "May 31, 2026 · 4:00 PM ET";

// ── Scoring engine ──
export function composite(stock: Stock, horizon: HorizonKey): number {
  const w = WEIGHTS[horizon];
  let s = 0;
  for (const k in w) s += w[k as FactorKey] * stock.f[k as FactorKey];
  return Math.round(s);
}

export function grade(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 85) return "A";
  if (score >= 80) return "A-";
  if (score >= 75) return "B+";
  if (score >= 70) return "B";
  if (score >= 65) return "B-";
  if (score >= 60) return "C+";
  if (score >= 55) return "C";
  if (score >= 50) return "C-";
  if (score >= 45) return "D+";
  if (score >= 40) return "D";
  return "F";
}

export function gradeClass(g: string): string {
  const c = g[0];
  return c === "A" ? "grade-a" : c === "B" ? "grade-b" : c === "C" ? "grade-c" : c === "D" ? "grade-d" : "grade-f";
}

// Factor strength buckets — green strong / amber neutral / red weak.
export function factorClass(v: number): string {
  return v >= 67 ? "f-strong" : v >= 40 ? "f-neutral" : "f-weak";
}

export function factorColor(v: number): string {
  return v >= 67 ? "var(--color-bull)" : v >= 40 ? "var(--color-warn)" : "var(--color-bear)";
}

// Full ranked list for a horizon (desc by composite).
// `universe` defaults to the seed list; pass a live-overlaid universe to rank
// the same names with real market data attached (scores are unaffected — they
// come from the factor sub-scores, which the overlay never touches).
export function ranked(horizon: HorizonKey, universe: Stock[] = UNIVERSE): RankedStock[] {
  return universe.map((s) => {
    const score = composite(s, horizon);
    return { ...s, score, grade: grade(score) };
  })
    .sort((a, b) => b.score - a.score)
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

// Top pick (#1) for each horizon, with an AI-written take.
const TAKES: Record<string, string> = {
  NVDA: "Accelerator demand still outruns supply and momentum is textbook-clean across every timeframe. Stretched valuation is the only blemish — a non-issue on a one-week horizon.",
  META: "Ad pricing re-accelerated while the AI capex narrative flipped from drag to driver. The cleanest risk-adjusted setup in mega-cap right now over a one-month window.",
  MSFT: "A rare stock that scores top-decile on Quality, Health and Analyst support simultaneously. The compounder you underwrite for a year and stop watching for a week.",
};

/** Fallback narrative when a pick has no hand-written take. */
function genericTake(s: RankedStock, h: Horizon): string {
  const top = [...FACTORS].sort((a, b) => s.f[b.key] - s.f[a.key]).slice(0, 2).map((f) => f.label.toLowerCase());
  return `Tops the ${h.label.toLowerCase()} screen on a ${h.sub.split("·")[1]?.trim() || "blended"} weighting — strongest blend of ${top[0]} and ${top[1]} in the S&P 500 right now.`;
}

export function topPicks(universe: Stock[] = UNIVERSE): Pick[] {
  // One distinct name per horizon — take each horizon's highest scorer that a
  // shorter horizon hasn't already claimed, so the three cards never repeat.
  const used = new Set<string>();
  return HORIZONS.map((h) => {
    const list = ranked(h.key, universe);
    const r = list.find((s) => !used.has(s.ticker)) ?? list[0];
    used.add(r.ticker);
    return { ...r, horizon: h, take: TAKES[r.ticker] || genericTake(r, h) };
  });
}

// Top performers (backward-looking actual movers) for a window.
export function movers(window: HorizonKey, universe: Stock[] = UNIVERSE): { gainers: Mover[]; losers: Mover[] } {
  const sorted = [...universe].sort((a, b) => b.mv[window] - a.mv[window]);
  return {
    gainers: sorted.slice(0, 5).map((s) => ({ ...s, move: s.mv[window] })),
    losers: sorted.slice(-5).reverse().map((s) => ({ ...s, move: s.mv[window] })),
  };
}

// ── Custom "Tune" lens — user-weighted scoring ──

export interface TunePreset {
  key: string;
  label: string;
  weights: FactorScores;
}

// Even starting shape — a balanced hexagon the user pulls into their own profile.
export const NEUTRAL_WEIGHTS: FactorScores = {
  mom: 55,
  growth: 55,
  quality: 55,
  analyst: 55,
  value: 55,
  health: 55,
};

// Quick-start lenses that snap the radar to a recognisable investing style.
// Deliberately characterful so each surfaces a genuinely different cohort —
// a value lens should NOT just return the same mega-caps a quality lens does.
export const TUNE_PRESETS: TunePreset[] = [
  { key: "momentum", label: "Momentum Trader", weights: { mom: 100, growth: 70, quality: 18, analyst: 80, value: 10, health: 22 } },
  { key: "value", label: "Value Investor", weights: { mom: 14, growth: 22, quality: 20, analyst: 26, value: 100, health: 30 } },
  { key: "quality", label: "Quality Compounder", weights: { mom: 42, growth: 64, quality: 100, analyst: 58, value: 24, health: 92 } },
];

/** Weights as percentages summing to 100 — for display. Falls back to even split. */
export function normalizedWeights(weights: FactorScores): FactorScores {
  const raw = FACTORS.map((f) => Math.max(0, weights[f.key]));
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  const out = {} as FactorScores;
  FACTORS.forEach((f, i) => {
    out[f.key] = Math.round((raw[i] / sum) * 100);
  });
  return out;
}

/** Rank the universe by a user-defined factor weighting (same composite engine). */
export function rankByWeights(weights: FactorScores, universe: Stock[] = UNIVERSE): RankedStock[] {
  const raw = FACTORS.map((f) => Math.max(0, weights[f.key]));
  const sum = raw.reduce((a, b) => a + b, 0);
  const w = sum > 0 ? raw.map((x) => x / sum) : raw.map(() => 1 / FACTORS.length);
  return universe.map((s) => {
    let sc = 0;
    FACTORS.forEach((f, i) => {
      sc += w[i] * s.f[f.key];
    });
    const score = Math.round(sc);
    return { ...s, score, grade: grade(score) };
  })
    .sort((a, b) => b.score - a.score)
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

// ── Live overlay ──
// Merge a map of live market data onto the seed universe. Returns a NEW array
// (never mutates UNIVERSE) so React sees a fresh reference. Price/chg fall back
// to the seed values until the live row arrives; the fundamental columns stay
// `null` (→ "—") until populated. `live` flips true once a real price applies.
export function overlayLive(
  universe: Stock[],
  live: Map<string, LiveRow> | null | undefined
): Stock[] {
  if (!live || live.size === 0) return universe;
  return universe.map((s) => {
    const l = live.get(s.ticker);
    if (!l) return s;
    return {
      ...s,
      price: l.price ?? s.price,
      chg: l.changePct ?? s.chg,
      marketCap: l.marketCap,
      pe: l.pe,
      avgVol: l.avgVol,
      rvol: l.rvol,
      live: l.price != null,
    };
  });
}

// ── Formatting helpers ──
export const fmtPrice = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtPct = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
export const fmtPct1 = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(1) + "%";

/** Compact market cap: $5.11T, $612.3B, $84.6M. Null → "—". */
export function fmtMktCap(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  return "$" + n.toLocaleString("en-US");
}

/** Compact share volume: 181.3M, 4.2M, 850.0K. Null → "—". */
export function fmtVol(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
}

/** P/E to one decimal. Negative (loss-making) or missing → "—". */
export function fmtPE(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  return n.toFixed(1);
}

/** Relative volume as a multiple: 1.4×, 0.8×. Null → "—". */
export function fmtRvol(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  return n.toFixed(2) + "×";
}
