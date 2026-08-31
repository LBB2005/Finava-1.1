/** Shared multi-series chart palette — accent first, then harmonized
 *  mid-saturation hues that read on both light and dark grounds. */
export const CHART_SERIES: string[] = [
  "var(--color-accent)",
  "#5b8fd9",
  "#3fae6b",
  "#d6a93f",
  "#b06bd6",
  "#e0734d",
  "#4fb3bf",
];

/** Axis tick / label color for charts. */
export const CHART_TICK = "var(--color-muted)";

/**
 * Fade a hex colour to an alpha value a canvas can paint.
 *
 * Canvas-drawn charts (the price hero on lightweight-charts) cannot use
 * `color-mix()` or a `var(--token)` string: those are CSS constructs, and a
 * `fillStyle` the browser cannot parse is silently dropped, so the fill just
 * never appears. The design tokens resolve to plain hex, so converting here is
 * exact and needs no browser cooperation.
 *
 * A non-hex value is passed through untouched — a token that is already
 * `rgb()`/`rgba()`/a named colour is valid `fillStyle` as-is, and mangling it
 * would be worse than leaving the alpha unapplied.
 */
export function withAlpha(color: string, alpha: number): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color.trim();
  const raw = m[1].length === 3 ? m[1].split("").map((ch) => ch + ch).join("") : m[1];
  const n = parseInt(raw, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
