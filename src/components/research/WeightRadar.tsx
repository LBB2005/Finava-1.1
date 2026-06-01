"use client";
import { useRef } from "react";
import { FACTORS, factorColor, type FactorScores, type FactorKey } from "@/lib/research";

/**
 * Interactive six-factor radar. Drag any vertex (or tap an axis) to set how
 * much you want to weight that factor 0–100. Controlled via `weights`/`onChange`.
 */
export default function WeightRadar({
  weights,
  onChange,
  size = 260,
  scale = 0.34,
}: {
  weights: FactorScores;
  onChange: (next: FactorScores) => void;
  size?: number;
  scale?: number;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<number | null>(null);

  const cx = size / 2;
  const cy = size / 2;
  const R = size * scale;
  const ang = (i: number) => ((-90 + i * 60) * Math.PI) / 180;
  const pt = (val: number, i: number): [number, number] => [
    cx + R * (val / 100) * Math.cos(ang(i)),
    cy + R * (val / 100) * Math.sin(ang(i)),
  ];

  const rings = [0.25, 0.5, 0.75, 1];
  const ringPath = (k: number) => FACTORS.map((_, i) => { const [x, y] = pt(100 * k, i); return `${x},${y}`; }).join(" ");
  const valPts = FACTORS.map((fc, i) => pt(weights[fc.key], i));
  const valStr = valPts.map(([x, y]) => `${x},${y}`).join(" ");

  function setFromEvent(e: React.PointerEvent) {
    const i = dragRef.current;
    if (i == null || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * size - cx;
    const y = ((e.clientY - rect.top) / rect.height) * size - cy;
    const a = ang(i);
    let proj = x * Math.cos(a) + y * Math.sin(a); // project onto the axis
    proj = Math.max(0, Math.min(R, proj));
    const val = Math.round((proj / R) * 100);
    onChange({ ...weights, [FACTORS[i].key as FactorKey]: val });
  }

  function onDown(i: number, e: React.PointerEvent) {
    dragRef.current = i;
    svgRef.current?.setPointerCapture(e.pointerId);
    setFromEvent(e);
  }
  function onMove(e: React.PointerEvent) {
    if (dragRef.current != null) setFromEvent(e);
  }
  function onUp(e: React.PointerEvent) {
    dragRef.current = null;
    svgRef.current?.releasePointerCapture?.(e.pointerId);
  }

  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      style={{ display: "block", touchAction: "none", userSelect: "none", maxWidth: "100%" }}
    >
      {rings.map((k) => (
        <polygon key={k} points={ringPath(k)} fill="none" stroke="var(--color-border)" strokeWidth="1" />
      ))}
      {FACTORS.map((fc, i) => {
        const [x, y] = pt(100, i);
        return <line key={fc.key} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--color-border)" strokeWidth="1" />;
      })}

      {/* Current weighting shape */}
      <polygon points={valStr} fill="color-mix(in oklab, var(--color-accent) 16%, transparent)" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" />

      {/* Axis hit targets + draggable handles */}
      {FACTORS.map((fc, i) => {
        const [hx, hy] = valPts[i];
        const [ex, ey] = pt(100, i);
        return (
          <g key={fc.key}>
            {/* invisible wide hit line along the axis */}
            <line x1={cx} y1={cy} x2={ex} y2={ey} stroke="transparent" strokeWidth={18} style={{ cursor: "pointer" }} onPointerDown={(e) => onDown(i, e)} />
            {/* handle */}
            <circle cx={hx} cy={hy} r={14} fill="transparent" style={{ cursor: "grab" }} onPointerDown={(e) => onDown(i, e)} />
            <circle cx={hx} cy={hy} r={6} fill="var(--color-accent)" stroke="var(--color-bg)" strokeWidth={2} style={{ pointerEvents: "none" }} />
          </g>
        );
      })}

      {/* Labels + live values */}
      {FACTORS.map((fc, i) => {
        const [x, y] = pt(128, i);
        return (
          <g key={fc.key} style={{ pointerEvents: "none" }}>
            <text x={x} y={y - 3} textAnchor="middle" style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", fill: "var(--color-muted)", fontFamily: "var(--font-mono)" }}>
              {fc.short}
            </text>
            <text x={x} y={y + 9} textAnchor="middle" style={{ fontSize: 11, fontWeight: 700, fill: factorColor(weights[fc.key]), fontFamily: "var(--font-mono)" }}>
              {weights[fc.key]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
