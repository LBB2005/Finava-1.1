/**
 * ⚠️ TEMPORARY synthetic series for the Portfolio page.
 *
 * These generate deterministic FAKE numbers — a seeded RNG dressed up as a
 * benchmark curve and a sparkline. They exist only so the redesigned page keeps
 * rendering until it is wired to the real endpoints (`/api/portfolio/performance`
 * and `/api/sparklines`). Nothing here is market data. Delete this file the
 * moment the last import of it is gone.
 */

/** Deterministic 32-bit RNG seeded from a string (FNV-1a + xorshift). */
export function seedRng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
