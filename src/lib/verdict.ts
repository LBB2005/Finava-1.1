import { composite, FACTORS, type HorizonKey, type Stock } from "./research";

export interface Verdict {
  /** Headline stance — Constructive · Balanced · Cautious. */
  stance: "Constructive" | "Balanced" | "Cautious";
  /** The blended composite the stance is read from (0–100). */
  score: number;
  /** AI fair-value estimate (absolute price). */
  fairValue: number;
  /** Implied upside vs. last price (%). */
  upsidePct: number;
  /** Confidence in the read. */
  confidence: "High" | "Moderate" | "Low";
  /** One-line natural-language take. */
  take: string;
}

/**
 * Deterministic AI "verdict" derived from a stock's six factor sub-scores and
 * its blended composite. Mirrors the design prototype's read so the Board hero
 * stays consistent across the horizon toggle — no live model call required.
 */
export function verdictFor(stock: Stock, horizon: HorizonKey = "month"): Verdict {
  const f = stock.f;
  const price = stock.price;

  const upsidePct = Math.round(((f.analyst - 55) / 2.2 + (100 - f.value) / 14 - 4) * 10) / 10;
  const fairValue = Math.round(price * (1 + upsidePct / 100) * 100) / 100;

  const comp = composite(stock, horizon);
  const stance: Verdict["stance"] = comp >= 62 ? "Constructive" : comp <= 44 ? "Cautious" : "Balanced";
  const confidence: Verdict["confidence"] =
    comp >= 72 || comp <= 38 ? "High" : comp >= 58 || comp <= 46 ? "Moderate" : "Low";

  // Top / bottom factor by raw sub-score, used to narrate the case.
  const sorted = [...FACTORS].sort((a, b) => f[b.key] - f[a.key]);
  const lead1 = sorted[0].label.toLowerCase();
  const lead2 = sorted[1].label.toLowerCase();
  const drag = sorted[sorted.length - 1].label.toLowerCase();

  const take =
    `${stock.name} screens ${stance.toLowerCase()} on a blended weighting. The case leans on ` +
    `${lead1} and ${lead2}; the main drag is ${drag}. Fair value lands near ` +
    `$${Math.round(fairValue)} versus a recent $${Math.round(price)} — ` +
    `${upsidePct >= 0 ? "modest upside" : "limited headroom"} on the Finava read.`;

  return { stance, score: comp, fairValue, upsidePct, confidence, take };
}
