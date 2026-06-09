// Research · Screen lens — structured filter + pure client-side apply.
//
// The AI (screenParse, Haiku) turns a natural-language query into a ScreenFilter;
// applyScreen() runs that filter against the already-loaded factor universe in the
// browser, so results are instant and the same scored data powers every lens.

import {
  FACTORS,
  grade,
  type FactorKey,
  type RankedStock,
  type Stock,
} from "@/lib/research";

export interface FactorBand {
  min?: number; // 0–100 sub-score floor
  max?: number; // 0–100 sub-score ceiling
}

export interface ScreenFilter {
  /** Per-factor 0–100 sub-score bands (e.g. value ≥ 70 = "cheap"). */
  factors?: Partial<Record<FactorKey, FactorBand>>;
  /** GICS sectors to include (matches Stock.sector substrings, case-insensitive). */
  sectors?: string[];
  maxPe?: number;
  minPe?: number;
  /** Per-share price bounds (e.g. maxPrice 50 = "under $50 a share"). */
  maxPrice?: number;
  minPrice?: number;
  /** Absolute USD market-cap floor (e.g. 1e10 = $10B). */
  minMarketCap?: number;
  maxMarketCap?: number;
  /** Today's % move bounds. */
  minChg?: number;
  maxChg?: number;
  /** Ranking: which factor (or "score") to sort the survivors by, and direction. */
  sort?: { key: FactorKey | "score" | "chg" | "marketCap"; dir: "asc" | "desc" };
  /** Cap on how many names to surface (default 40). */
  limit?: number;
}

const FACTOR_KEYS = new Set<FactorKey>(FACTORS.map((f) => f.key));

/** Score a stock the way the Board does for the year horizon, used as the default sort. */
function blendedScore(s: Stock): number {
  // Equal-weight composite — a neutral, lens-agnostic "overall" used when the
  // query implies no specific ranking factor.
  const sum = FACTORS.reduce((a, f) => a + s.f[f.key], 0);
  return Math.round(sum / FACTORS.length);
}

function matchesSector(stockSector: string, wanted: string[]): boolean {
  const sec = stockSector.toLowerCase();
  return wanted.some((w) => {
    const t = w.toLowerCase().trim();
    return sec.includes(t) || t.includes(sec);
  });
}

/** Apply a ScreenFilter to a universe → ranked, capped survivors. Pure. */
export function applyScreen(universe: Stock[], filter: ScreenFilter): RankedStock[] {
  const survivors = universe.filter((s) => {
    if (filter.factors) {
      for (const [k, band] of Object.entries(filter.factors)) {
        if (!band || !FACTOR_KEYS.has(k as FactorKey)) continue;
        const v = s.f[k as FactorKey];
        if (band.min != null && v < band.min) return false;
        if (band.max != null && v > band.max) return false;
      }
    }
    if (filter.sectors?.length && !matchesSector(s.sector, filter.sectors)) return false;

    const pe = s.pe;
    if (filter.maxPe != null && (pe == null || pe <= 0 || pe > filter.maxPe)) return false;
    if (filter.minPe != null && (pe == null || pe < filter.minPe)) return false;

    if (filter.maxPrice != null && !(s.price > 0 && s.price <= filter.maxPrice)) return false;
    if (filter.minPrice != null && !(s.price >= filter.minPrice)) return false;

    const cap = s.marketCap;
    if (filter.minMarketCap != null && (cap == null || cap < filter.minMarketCap)) return false;
    if (filter.maxMarketCap != null && (cap == null || cap > filter.maxMarketCap)) return false;

    if (filter.minChg != null && s.chg < filter.minChg) return false;
    if (filter.maxChg != null && s.chg > filter.maxChg) return false;

    return true;
  });

  const sortKey = filter.sort?.key ?? "score";
  const dir = filter.sort?.dir ?? "desc";
  const val = (s: Stock): number => {
    if (sortKey === "score") return blendedScore(s);
    if (sortKey === "chg") return s.chg;
    if (sortKey === "marketCap") return s.marketCap ?? 0;
    return s.f[sortKey];
  };

  const ranked = [...survivors]
    .sort((a, b) => (dir === "asc" ? val(a) - val(b) : val(b) - val(a)))
    .map((s, i) => {
      const score = blendedScore(s);
      return { ...s, score, grade: grade(score), rank: i + 1 } as RankedStock;
    });

  const limit = filter.limit && filter.limit > 0 ? filter.limit : 40;
  return ranked.slice(0, limit);
}

/** Sanitize a model-produced filter object into a safe ScreenFilter. */
export function coerceFilter(raw: unknown): ScreenFilter {
  const o = (raw ?? {}) as Record<string, unknown>;
  const out: ScreenFilter = {};
  const numOrU = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;

  if (o.factors && typeof o.factors === "object") {
    const f: Partial<Record<FactorKey, FactorBand>> = {};
    for (const [k, band] of Object.entries(o.factors as Record<string, unknown>)) {
      if (!FACTOR_KEYS.has(k as FactorKey) || !band || typeof band !== "object") continue;
      const b = band as Record<string, unknown>;
      const min = numOrU(b.min);
      const max = numOrU(b.max);
      if (min != null || max != null) f[k as FactorKey] = { min, max };
    }
    if (Object.keys(f).length) out.factors = f;
  }
  if (Array.isArray(o.sectors)) {
    const secs = (o.sectors as unknown[]).filter((x): x is string => typeof x === "string" && !!x.trim());
    if (secs.length) out.sectors = secs;
  }
  out.maxPe = numOrU(o.maxPe);
  out.minPe = numOrU(o.minPe);
  out.maxPrice = numOrU(o.maxPrice);
  out.minPrice = numOrU(o.minPrice);
  out.minMarketCap = numOrU(o.minMarketCap);
  out.maxMarketCap = numOrU(o.maxMarketCap);
  out.minChg = numOrU(o.minChg);
  out.maxChg = numOrU(o.maxChg);
  const limit = numOrU(o.limit);
  if (limit != null) out.limit = Math.max(1, Math.min(100, Math.round(limit)));

  if (o.sort && typeof o.sort === "object") {
    const s = o.sort as Record<string, unknown>;
    const key = s.key;
    const valid =
      key === "score" || key === "chg" || key === "marketCap" || FACTOR_KEYS.has(key as FactorKey);
    if (valid && typeof key === "string") {
      out.sort = { key: key as NonNullable<ScreenFilter["sort"]>["key"], dir: s.dir === "asc" ? "asc" : "desc" };
    }
  }
  return out;
}
