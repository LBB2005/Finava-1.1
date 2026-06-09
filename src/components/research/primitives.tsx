"use client";
import { FACTORS, factorColor, gradeClass, type FactorScores } from "@/lib/research";

type BadgeSize = "sm" | "md" | "lg" | "xl";

const BADGE_DIMS: Record<BadgeSize, { w: number; h: number; f: number; r: number }> = {
  sm: { w: 26, h: 20, f: 12, r: 6 },
  md: { w: 34, h: 26, f: 14, r: 7 },
  lg: { w: 48, h: 38, f: 20, r: 9 },
  xl: { w: 76, h: 60, f: 34, r: 12 },
};

/** Grade chip — colour-coded A–F, sized by `size`. */
export function GradeBadge({ grade, size = "md" }: { grade: string; size?: BadgeSize }) {
  const d = BADGE_DIMS[size];
  return (
    <span
      className={"grade " + gradeClass(grade)}
      style={{ width: d.w, height: d.h, fontSize: d.f, borderRadius: d.r }}
    >
      {grade}
    </span>
  );
}

/** 0–100 arc gauge — 270° sweep with the score numeral centred. The Banner
 *  board's feature-pick treatment (borrowed from the Editorial direction). */
export function ArcGauge({ score, size = 130, stroke = 12 }: { score: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const a0 = 135;
  const sweep = 270;
  const rad = (d: number) => ((d - 180) * Math.PI) / 180;
  const pt = (deg: number): [number, number] => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))];
  const arc = (from: number, to: number) => {
    const [x0, y0] = pt(from);
    const [x1, y1] = pt(to);
    const large = to - from > 180 ? 1 : 0;
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  };
  const end = a0 + sweep * (Math.max(0, Math.min(100, score)) / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block", flexShrink: 0 }}>
      <path d={arc(a0, a0 + sweep)} fill="none" stroke="var(--color-surface-2)" strokeWidth={stroke} strokeLinecap="round" />
      <path d={arc(a0, end)} fill="none" stroke="var(--color-accent)" strokeWidth={stroke} strokeLinecap="round" />
      <text x={cx} y={cy - 2} textAnchor="middle" className="serif" style={{ fontSize: size * 0.3, fontWeight: 800, fill: "var(--color-accent)" }}>
        {score}
      </text>
      <text x={cx} y={cy + size * 0.16} textAnchor="middle" className="mono" style={{ fontSize: size * 0.072, fontWeight: 700, letterSpacing: "0.16em", fill: "var(--color-muted)" }}>
        SCORE
      </text>
    </svg>
  );
}

/** Compact vertical factor bars (terminal leaderboard cell). */
export function MiniBars({ f }: { f: FactorScores }) {
  return (
    <div className="flex items-center" style={{ gap: 4 }}>
      {FACTORS.map((fac) => (
        <div
          key={fac.key}
          title={fac.full + ": " + f[fac.key]}
          className="flex flex-col items-center"
          style={{ gap: 3, width: 18 }}
        >
          <div
            className="fbar-track"
            style={{ width: "100%", height: 22, display: "flex", alignItems: "flex-end", borderRadius: 2, background: "var(--color-surface-2)" }}
          >
            <div style={{ width: "100%", height: f[fac.key] + "%", background: factorColor(f[fac.key]), borderRadius: 2 }} />
          </div>
          <span className="mono" style={{ fontSize: 7.5, fontWeight: 700, color: "var(--color-muted)" }}>
            {fac.short}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Overlaid six-factor radar for comparing 2–5 stocks. Each series is one
 *  coloured polygon; the axis grid is shared. */
export function RadarOverlay({
  series,
  size = 240,
  scale = 0.42,
}: {
  series: { ticker: string; f: FactorScores; color: string }[];
  size?: number;
  scale?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size * scale;
  const ang = (i: number) => ((-90 + i * 60) * Math.PI) / 180;
  const pt = (val: number, i: number): [number, number] => [
    cx + R * (val / 100) * Math.cos(ang(i)),
    cy + R * (val / 100) * Math.sin(ang(i)),
  ];
  const ringPath = (k: number) => FACTORS.map((_, i) => { const [x, y] = pt(100 * k, i); return `${x},${y}`; }).join(" ");
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      {[0.25, 0.5, 0.75, 1].map((k) => (
        <polygon key={k} points={ringPath(k)} fill="none" stroke="var(--color-border)" strokeWidth="1" />
      ))}
      {FACTORS.map((fc, i) => {
        const [x, y] = pt(100, i);
        return <line key={fc.key} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--color-border)" strokeWidth="1" />;
      })}
      {series.map((sr) => {
        const valStr = FACTORS.map((fc, i) => { const [x, y] = pt(sr.f[fc.key], i); return `${x},${y}`; }).join(" ");
        return (
          <polygon
            key={sr.ticker}
            points={valStr}
            fill={`color-mix(in oklab, ${sr.color} 12%, transparent)`}
            stroke={sr.color}
            strokeWidth="2"
            strokeLinejoin="round"
          />
        );
      })}
      {FACTORS.map((fc, i) => {
        const [x, y] = pt(124, i);
        return (
          <text key={fc.key} x={x} y={y + 3} textAnchor="middle" style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", fill: "var(--color-muted)", fontFamily: "var(--font-mono)" }}>
            {fc.short}
          </text>
        );
      })}
    </svg>
  );
}

/** Hexagonal six-factor radar. */
export function Radar({
  f,
  size = 200,
  labels = true,
  vals = true,
  rings = [0.25, 0.5, 0.75, 1],
  stroke,
  fill,
  scale = 0.4,
}: {
  f: FactorScores;
  size?: number;
  labels?: boolean;
  vals?: boolean;
  rings?: number[];
  stroke?: string;
  fill?: string;
  scale?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size * scale;
  const ang = (i: number) => ((-90 + i * 60) * Math.PI) / 180;
  const pt = (val: number, i: number): [number, number] => [
    cx + R * (val / 100) * Math.cos(ang(i)),
    cy + R * (val / 100) * Math.sin(ang(i)),
  ];
  const ringPath = (k: number) => FACTORS.map((_, i) => { const [x, y] = pt(100 * k, i); return `${x},${y}`; }).join(" ");
  const valPts = FACTORS.map((fc, i) => pt(f[fc.key], i));
  const valStr = valPts.map(([x, y]) => `${x},${y}`).join(" ");
  const st = stroke || "var(--color-accent)";
  const fl = fill || "color-mix(in oklab, var(--color-accent) 18%, transparent)";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      {rings.map((k) => (
        <polygon key={k} points={ringPath(k)} fill="none" stroke="var(--color-border)" strokeWidth="1" />
      ))}
      {FACTORS.map((fc, i) => {
        const [x, y] = pt(100, i);
        return <line key={fc.key} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--color-border)" strokeWidth="1" />;
      })}
      <polygon points={valStr} fill={fl} stroke={st} strokeWidth="2" strokeLinejoin="round" />
      {valPts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={size > 90 ? 3 : 2} fill={st} />
      ))}
      {labels &&
        FACTORS.map((fc, i) => {
          const [x, y] = pt(128, i);
          return (
            <g key={fc.key}>
              <text x={x} y={y - 3} textAnchor="middle" style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", fill: "var(--color-muted)", fontFamily: "var(--font-mono)" }}>
                {fc.short}
              </text>
              {vals && (
                <text x={x} y={y + 9} textAnchor="middle" style={{ fontSize: 11, fontWeight: 700, fill: factorColor(f[fc.key]), fontFamily: "var(--font-mono)" }}>
                  {f[fc.key]}
                </text>
              )}
            </g>
          );
        })}
    </svg>
  );
}
