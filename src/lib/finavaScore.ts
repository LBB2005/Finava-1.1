// Deterministic Finava Score engine — pure, no I/O. Maps raw per-metric values to
// 0–100 sub-factor scores via calibrated piecewise-linear curves, then blends
// factors -> pillars -> overall with proportional reweighting when data is missing.

/** Piecewise-linear interpolation over ascending [x, score] anchors. Clamps at the
 *  ends. Returns null for null/NaN so missing data flows through as "excluded". */
export function interp(value: number | null, anchors: [number, number][]): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (value <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (value >= last[0]) return last[1];
  for (let i = 1; i < anchors.length; i++) {
    const [x0, s0] = anchors[i - 1];
    const [x1, s1] = anchors[i];
    if (value <= x1) {
      const t = (value - x0) / (x1 - x0);
      return s0 + t * (s1 - s0);
    }
  }
  return last[1];
}

export interface ScoreInputs {
  // Fundamentals
  revenueYoY: number | null;      // fraction, 0.12 = +12%
  epsYoY: number | null;
  revenueCagr3y: number | null;
  grossMargin: number | null;     // percent (47.8)
  operatingMargin: number | null;
  netMargin: number | null;
  roe: number | null;             // percent
  roa: number | null;
  roic: number | null;
  debtToEquity: number | null;    // ratio
  currentRatio: number | null;
  fcfConversion: number | null;   // FCF / net income, ratio
  // Valuation
  price: number | null;
  dcfFair: number | null;
  peTTM: number | null;
  peerPe: number | null;
  psTTM: number | null;
  peerPs: number | null;
  // Analyst
  ratingSkew: number | null;          // -1..1
  targetUpsidePct: number | null;     // fraction; null until paid feed (Phase 2)
  estimateRevisionPct: number | null; // fraction; null until paid feed (Phase 2)
  earningsSurprisePct: number | null; // avg surprise, fraction
  // Momentum
  trendVs200: number | null;   // price/MA200 - 1, fraction
  ret3m: number | null;
  relStrength6m: number | null;
  // Sentiment (already 0–100)
  newsSentiment: number | null;
  xSentiment: number | null;
  // Insider
  insiderFlow: number | null;  // -1..1
  // Risk (confidence only)
  beta: number | null;
  annualizedVol: number | null; // fraction
}

export type PillarKey =
  | "fundamentals" | "valuation" | "analyst" | "momentum" | "sentiment" | "insider";

export interface FactorScore {
  key: string;
  label: string;
  pillar: PillarKey;
  weight: number;       // in-pillar weight
  score: number | null; // 0–100 or null when excluded
  detail: string;
}

const pct = (n: number | null) => (n == null ? "n/a" : `${n.toFixed(1)}%`);
const fpct = (n: number | null) => (n == null ? "n/a" : `${(n * 100).toFixed(1)}%`);

/** Average of the non-null sub-scores (used to combine e.g. ROE+ROA+ROIC). */
function meanScore(parts: (number | null)[]): number | null {
  const present = parts.filter((p): p is number => p != null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

export function scoreFactors(i: ScoreInputs): FactorScore[] {
  const growth = meanScore([
    interp(i.revenueYoY, [[-0.1, 25], [0, 42], [0.1, 62], [0.2, 78], [0.4, 92]]),
    interp(i.epsYoY, [[-0.15, 25], [0, 45], [0.15, 66], [0.3, 80], [0.5, 92]]),
    interp(i.revenueCagr3y, [[0, 40], [0.1, 62], [0.2, 80], [0.35, 92]]),
  ]);
  const profitability = meanScore([
    interp(i.grossMargin, [[10, 40], [30, 58], [50, 75], [70, 88]]),
    interp(i.operatingMargin, [[0, 38], [10, 55], [25, 75], [40, 90]]),
    interp(i.netMargin, [[0, 40], [10, 60], [20, 76], [30, 88]]),
  ]);
  const returns = meanScore([
    interp(i.roe, [[5, 40], [15, 62], [25, 80], [40, 92]]),
    interp(i.roa, [[1, 40], [6, 62], [12, 80], [20, 90]]),
    interp(i.roic, [[4, 40], [10, 62], [18, 80], [30, 92]]),
  ]);
  const health = meanScore([
    interp(i.debtToEquity, [[0, 85], [0.5, 70], [1, 55], [2, 38], [3, 22]]),
    interp(i.currentRatio, [[0.8, 38], [1, 50], [1.5, 68], [2.5, 80]]),
  ]);
  const cashflow = interp(i.fcfConversion, [[0.3, 38], [0.6, 55], [0.9, 70], [1.2, 84]]);

  const upside = i.price != null && i.price > 0 && i.dcfFair != null
    ? (i.dcfFair - i.price) / i.price : null;
  const absoluteVal = interp(upside, [[-0.4, 18], [-0.2, 35], [0, 55], [0.2, 72], [0.5, 88]]);
  // Guard peTTM > 0: a negative P/E (loss-maker) is not comparable on this multiple,
  // and an unguarded negative ratio would clamp to the BEST relative score. Drop it
  // so relativeVal falls back to P/S alone.
  const peRel = i.peTTM != null && i.peTTM > 0 && i.peerPe != null && i.peerPe > 0 ? i.peTTM / i.peerPe : null;
  const psRel = i.psTTM != null && i.psTTM > 0 && i.peerPs != null && i.peerPs > 0 ? i.psTTM / i.peerPs : null;
  const relativeVal = meanScore([
    interp(peRel, [[0.6, 85], [0.8, 72], [1, 55], [1.3, 40], [1.8, 25]]),
    interp(psRel, [[0.6, 82], [0.8, 70], [1, 55], [1.3, 42], [1.8, 28]]),
  ]);

  const rating = i.ratingSkew == null ? null
    : Math.max(0, Math.min(100, 50 + i.ratingSkew * 40));
  const revisions = interp(i.estimateRevisionPct, [[-0.1, 22], [-0.02, 42], [0, 52], [0.03, 68], [0.08, 84]]);
  const surprise = interp(i.earningsSurprisePct, [[-0.1, 28], [0, 50], [0.05, 68], [0.1, 80]]);

  const trend = meanScore([
    interp(i.trendVs200, [[-0.2, 22], [0, 50], [0.1, 68], [0.25, 82]]),
    interp(i.ret3m, [[-0.25, 25], [0, 50], [0.15, 70], [0.3, 82]]),
  ]);
  const relStrength = interp(i.relStrength6m, [[-0.25, 25], [0, 52], [0.15, 72], [0.3, 85]]);

  const news = i.newsSentiment == null ? null : Math.max(0, Math.min(100, i.newsSentiment));
  const social = i.xSentiment == null ? null : Math.max(0, Math.min(100, i.xSentiment));

  const insiderFlow = i.insiderFlow == null ? null
    : Math.max(0, Math.min(100, 50 + i.insiderFlow * 45));

  return [
    { key: "growth", label: "Growth", pillar: "fundamentals", weight: 0.25, score: growth, detail: `Revenue ${fpct(i.revenueYoY)} YoY, EPS ${fpct(i.epsYoY)}` },
    { key: "profitability", label: "Profitability", pillar: "fundamentals", weight: 0.20, score: profitability, detail: `Net margin ${pct(i.netMargin)}, op margin ${pct(i.operatingMargin)}` },
    { key: "returns", label: "Returns on capital", pillar: "fundamentals", weight: 0.25, score: returns, detail: `ROE ${pct(i.roe)}, ROIC ${pct(i.roic)}` },
    { key: "health", label: "Balance sheet", pillar: "fundamentals", weight: 0.15, score: health, detail: `Debt/equity ${i.debtToEquity?.toFixed(2) ?? "n/a"}, current ratio ${i.currentRatio?.toFixed(2) ?? "n/a"}` },
    { key: "cashflow", label: "Cash-flow quality", pillar: "fundamentals", weight: 0.15, score: cashflow, detail: `FCF conversion ${i.fcfConversion?.toFixed(2) ?? "n/a"}x` },
    { key: "relativeVal", label: "Relative valuation", pillar: "valuation", weight: 0.55, score: relativeVal, detail: `P/E ${i.peTTM?.toFixed(1) ?? "n/a"} vs peers ${i.peerPe?.toFixed(1) ?? "n/a"}` },
    { key: "absoluteVal", label: "Absolute (DCF)", pillar: "valuation", weight: 0.45, score: absoluteVal, detail: upside == null ? "No DCF" : `${fpct(upside)} vs DCF fair value` },
    { key: "rating", label: "Analyst rating", pillar: "analyst", weight: 0.40, score: rating, detail: i.ratingSkew == null ? "No consensus data" : `Consensus skew ${i.ratingSkew.toFixed(2)}` },
    { key: "revisions", label: "Estimate revisions", pillar: "analyst", weight: 0.40, score: revisions, detail: i.estimateRevisionPct == null ? "Feed pending" : `Fwd estimates ${fpct(i.estimateRevisionPct)}` },
    { key: "surprise", label: "Earnings surprise", pillar: "analyst", weight: 0.20, score: surprise, detail: i.earningsSurprisePct == null ? "No history" : `Avg surprise ${fpct(i.earningsSurprisePct)}` },
    { key: "trend", label: "Price trend", pillar: "momentum", weight: 0.55, score: trend, detail: `vs 200-day ${fpct(i.trendVs200)}, 3-mo ${fpct(i.ret3m)}` },
    { key: "relStrength", label: "Relative strength", pillar: "momentum", weight: 0.45, score: relStrength, detail: i.relStrength6m == null ? "n/a" : `${fpct(i.relStrength6m)} vs market (6-mo)` },
    { key: "news", label: "News", pillar: "sentiment", weight: 0.50, score: news, detail: news == null ? "No headlines" : `News read ${news.toFixed(0)}/100` },
    { key: "social", label: "X / social", pillar: "sentiment", weight: 0.50, score: social, detail: social == null ? "No social data" : `Social read ${social.toFixed(0)}/100` },
    { key: "insiderFlow", label: "Insider flow", pillar: "insider", weight: 1.0, score: insiderFlow, detail: i.insiderFlow == null ? "No recent trades" : `Net flow ${i.insiderFlow.toFixed(2)}` },
  ];
}

export const PILLAR_WEIGHTS: Record<PillarKey, number> = {
  fundamentals: 28,
  valuation: 22,
  analyst: 18,
  momentum: 12.5,
  sentiment: 12.5,
  insider: 7,
};

const PILLAR_LABELS: Record<PillarKey, string> = {
  fundamentals: "Fundamentals",
  valuation: "Valuation",
  analyst: "Analyst",
  momentum: "Momentum",
  sentiment: "Sentiment",
  insider: "Insider Flow",
};

export interface PillarScore {
  key: PillarKey;
  label: string;
  weight: number;
  score: number | null;
  factors: FactorScore[];
}

export interface FinavaScoreResult {
  score: number;
  pillars: PillarScore[];
  confidence: "Low" | "Moderate" | "High";
  coverage: number;
}

/** Weighted mean of present factor scores, weights renormalized over present factors. */
function blendFactors(factors: FactorScore[]): number | null {
  let acc = 0, wsum = 0;
  for (const f of factors) {
    if (f.score != null) { acc += f.score * f.weight; wsum += f.weight; }
  }
  return wsum > 0 ? acc / wsum : null;
}

export function computeFinavaScore(inputs: ScoreInputs): FinavaScoreResult {
  const all = scoreFactors(inputs);
  const pillarKeys = Object.keys(PILLAR_WEIGHTS) as PillarKey[];

  const pillars: PillarScore[] = pillarKeys.map((key) => {
    const factors = all.filter((f) => f.pillar === key);
    return {
      key, label: PILLAR_LABELS[key], weight: PILLAR_WEIGHTS[key],
      score: blendFactors(factors), factors,
    };
  });

  let acc = 0, wsum = 0;
  for (const p of pillars) {
    if (p.score != null) { acc += p.score * p.weight; wsum += p.weight; }
  }
  const score = wsum > 0 ? Math.round(acc / wsum) : 50;

  const present = all.filter((f) => f.score != null);
  const coverage = present.length / all.length;

  const ps = pillars.map((p) => p.score).filter((s): s is number => s != null);
  const mean = ps.reduce((a, b) => a + b, 0) / (ps.length || 1);
  const variance = ps.reduce((a, b) => a + (b - mean) ** 2, 0) / (ps.length || 1);
  const stdev = Math.sqrt(variance);

  const volPenalty = (inputs.annualizedVol ?? 0) > 0.6 || (inputs.beta ?? 0) > 2;

  let confidence: FinavaScoreResult["confidence"];
  if (coverage >= 0.75 && stdev < 18 && !volPenalty) confidence = "High";
  else if (coverage < 0.5 || stdev > 28) confidence = "Low";
  else confidence = "Moderate";

  return { score, pillars, confidence, coverage };
}

/** Defined fair-value blend: equal-weight DCF and Street when both exist, else the
 *  one present. Transparent — no LLM guess. Non-positive values are suppressed (shown
 *  as n/a) since a negative per-share "fair value" is nonsensical to display; the
 *  scoring path is unaffected because the absoluteVal factor reads raw dcfFair, so a
 *  distressed (negative) DCF still scores valuation bearish via the upside curve. */
export function blendFairValue(v: { dcf: number | null; street: number | null }): number | null {
  const parts = [v.dcf, v.street].filter((x): x is number => x != null && x > 0);
  if (parts.length === 0) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}
