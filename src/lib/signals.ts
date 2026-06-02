// Research · Signals lens — derive candidate events from the live-overlaid
// universe. These are REAL cross-sectional facts (computed from data); the AI
// only narrates them into readable feed items. No historical snapshots needed.

import type { Stock } from "@/lib/research";
import type { SignalEvent } from "@/lib/researchAI";

interface Scored {
  s: Stock;
  category: SignalEvent["category"];
  fact: string;
  lean: number;
  priority: number; // higher = surface first
}

const pct = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(1) + "%";

/** Build a deduped, priority-ordered list of notable events from the universe. */
export function deriveSignals(universe: Stock[], max = 12): SignalEvent[] {
  const live = universe.filter((s) => s.live);
  const pool = live.length >= 20 ? live : universe;
  const out: Scored[] = [];
  const seen = new Set<string>();

  const push = (e: Scored) => {
    if (seen.has(e.s.ticker)) return; // one signal per name keeps the feed varied
    seen.add(e.s.ticker);
    out.push(e);
  };

  // Big movers (today's % change, either direction).
  [...pool]
    .filter((s) => Number.isFinite(s.chg) && Math.abs(s.chg) >= 2)
    .sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg))
    .slice(0, 6)
    .forEach((s) =>
      push({
        s,
        category: "mover",
        fact: `${pct(s.chg)} today; momentum score ${s.f.mom}/100`,
        lean: s.chg >= 0 ? 0.6 : -0.6,
        priority: Math.abs(s.chg),
      })
    );

  // Relative-volume spikes.
  [...pool]
    .filter((s) => typeof s.rvol === "number" && s.rvol! >= 1.8)
    .sort((a, b) => (b.rvol ?? 0) - (a.rvol ?? 0))
    .slice(0, 4)
    .forEach((s) =>
      push({
        s,
        category: "volume",
        fact: `relative volume ${s.rvol!.toFixed(1)}× the 10-day average, ${pct(s.chg)} today`,
        lean: s.chg >= 0 ? 0.4 : -0.4,
        priority: 5 + (s.rvol ?? 0),
      })
    );

  // Momentum breakouts — strong momentum sub-score and up on the day.
  [...pool]
    .filter((s) => s.f.mom >= 85 && s.chg > 0)
    .sort((a, b) => b.f.mom - a.f.mom)
    .slice(0, 4)
    .forEach((s) =>
      push({
        s,
        category: "breakout",
        fact: `momentum ${s.f.mom}/100, growth ${s.f.growth}/100, ${pct(s.chg)} today`,
        lean: 0.7,
        priority: 4 + s.f.mom / 100,
      })
    );

  // Analyst-skew standouts.
  [...pool]
    .filter((s) => s.f.analyst >= 85)
    .sort((a, b) => b.f.analyst - a.f.analyst)
    .slice(0, 3)
    .forEach((s) =>
      push({
        s,
        category: "analyst",
        fact: `analyst sentiment ${s.f.analyst}/100 (top of sector), valuation ${s.f.value}/100`,
        lean: 0.5,
        priority: 3 + s.f.analyst / 100,
      })
    );

  // Deep value that the market is still pressuring.
  [...pool]
    .filter((s) => s.f.value >= 85 && s.f.mom <= 45)
    .sort((a, b) => b.f.value - a.f.value)
    .slice(0, 3)
    .forEach((s) =>
      push({
        s,
        category: "value",
        fact: `valuation ${s.f.value}/100 (very cheap) but momentum only ${s.f.mom}/100`,
        lean: -0.1,
        priority: 2 + s.f.value / 100,
      })
    );

  // Top all-round grades (high quality + health + analyst).
  [...pool]
    .filter((s) => s.f.quality >= 88 && s.f.health >= 80)
    .sort((a, b) => b.f.quality + b.f.health - (a.f.quality + a.f.health))
    .slice(0, 3)
    .forEach((s) =>
      push({
        s,
        category: "grade",
        fact: `quality ${s.f.quality}/100, financial health ${s.f.health}/100`,
        lean: 0.3,
        priority: 1 + (s.f.quality + s.f.health) / 200,
      })
    );

  return out
    .sort((a, b) => b.priority - a.priority)
    .slice(0, max)
    .map(({ s, category, fact, lean }) => ({
      ticker: s.ticker,
      name: s.name,
      sector: s.sector,
      category,
      fact,
      lean,
    }));
}
