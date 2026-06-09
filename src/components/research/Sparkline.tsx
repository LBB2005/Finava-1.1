"use client";
import { useMemo } from "react";
import type { HorizonKey } from "@/lib/research";

/** Deterministic 0–1 PRNG seeded off the ticker, so a name's spark is stable. */
function seedRng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Compact area sparkline for the Board hero. Synthesises a deterministic
 * ~3-month close series that trends toward the live price by the window move,
 * so it stays visually stable while reflecting direction.
 */
export default function Sparkline({
  ticker,
  price,
  mv,
  range = "month",
  up,
  w = 150,
  h = 34,
}: {
  ticker: string;
  price: number;
  mv: Record<HorizonKey, number>;
  range?: HorizonKey;
  up: boolean;
  w?: number;
  h?: number;
}) {
  const closes = useMemo(() => {
    const n = 40;
    const move = mv[range] ?? 0;
    const start = price / (1 + move / 100);
    const rng = seedRng(ticker + range);
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const trend = start + (price - start) * t;
      const noise = (rng() - 0.5) * (Math.abs(price) * 0.012);
      out.push(trend + noise);
    }
    out[n - 1] = price;
    return out;
  }, [ticker, price, mv, range]);

  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const x = (i: number) => (i / (closes.length - 1)) * w;
  const y = (v: number) => 2 + (1 - (v - min) / span) * (h - 4);
  const stroke = up ? "var(--color-bull)" : "var(--color-bear)";
  const line = closes.map((c, i) => `${x(i).toFixed(1)},${y(c).toFixed(1)}`).join(" ");
  const gid = `sp-${ticker}-${up ? "u" : "d"}`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${line} ${w},${h}`} fill={`url(#${gid})`} />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
