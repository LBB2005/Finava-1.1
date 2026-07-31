"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import {
  KIND_LABELS,
  compactUsd,
  layoutRadial,
  type MoneyMapSelf,
  type MoneyRelation,
  type RelationKind,
} from "@/lib/moneyMap";

const W = 680;
const H = 460;

// Money-flow colour per relationship type (using the app's design tokens):
// green = revenue in, amber = money out, navy = capital in, muted = neutral peer.
const KIND_COLOR: Record<RelationKind, string> = {
  customer: "var(--color-bull)",
  supplier: "var(--color-warn)",
  owner: "var(--color-accent)",
  peer: "var(--color-muted)",
};

// Where each cluster's caption sits.
const CLUSTER_LABEL_POS: Record<
  RelationKind,
  { x: number; y: number; anchor: "start" | "middle" | "end" }
> = {
  customer: { x: W / 2, y: 20, anchor: "middle" },
  supplier: { x: W / 2, y: H - 8, anchor: "middle" },
  owner: { x: 30, y: H / 2 - 96, anchor: "start" },
  peer: { x: W - 30, y: H / 2 - 96, anchor: "end" },
};

function nodeLabel(r: MoneyRelation): string {
  if (r.ticker) return r.ticker;
  const first = r.name.split(/[\s,]+/)[0];
  return first.length > 10 ? `${first.slice(0, 9)}…` : first;
}

function edgeWidth(intensity: number): number {
  return 1.5 + intensity * 5;
}

export default function MoneyMapGraph({
  self,
  relations,
}: {
  self: MoneyMapSelf | null;
  relations: MoneyRelation[];
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);

  const layout = useMemo(() => layoutRadial(relations, { width: W, height: H }), [relations]);
  const activeKinds = useMemo(
    () => new Set(layout.nodes.map((n) => n.relation.kind)),
    [layout]
  );

  const hovered = hover != null ? layout.nodes[hover] : null;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`Relationship web for ${self?.ticker ?? "this company"}`}
        style={{ display: "block", overflow: "visible" }}
      >
        {/* edges (drawn first; opaque nodes/centre hide their ends) */}
        {layout.nodes.map((n, i) => {
          const color = KIND_COLOR[n.relation.kind];
          const dim = hover != null && hover !== i;
          return (
            <line
              key={`e-${n.relation.id}`}
              x1={layout.cx}
              y1={layout.cy}
              x2={n.x}
              y2={n.y}
              stroke={color}
              strokeWidth={edgeWidth(n.relation.intensity)}
              strokeDasharray={n.relation.confidence === "estimated" ? "3 4" : undefined}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              opacity={dim ? 0.18 : 0.55}
              style={{ transition: "opacity 0.2s ease" }}
            />
          );
        })}

        {/* cluster captions */}
        {(Object.keys(CLUSTER_LABEL_POS) as RelationKind[])
          .filter((k) => activeKinds.has(k))
          .map((k) => {
            const p = CLUSTER_LABEL_POS[k];
            return (
              <text
                key={`c-${k}`}
                x={p.x}
                y={p.y}
                textAnchor={p.anchor}
                style={{
                  fontSize: "var(--text-meta)",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  fill: KIND_COLOR[k],
                  opacity: 0.8,
                }}
              >
                {KIND_LABELS[k]}
              </text>
            );
          })}

        {/* centre node */}
        {self && (
          <g>
            <circle
              cx={layout.cx}
              cy={layout.cy}
              r={layout.centerR}
              fill="var(--color-accent)"
              stroke="var(--color-bg)"
              strokeWidth={3}
            />
            <text
              x={layout.cx}
              y={layout.cy - 2}
              textAnchor="middle"
              style={{ fontSize: "var(--text-lg)", fontWeight: 800, fill: "var(--color-on-accent)" }}
            >
              {self.ticker}
            </text>
            {self.marketCap != null && (
              <text
                x={layout.cx}
                y={layout.cy + 14}
                textAnchor="middle"
                style={{ fontSize: "var(--text-micro)", fill: "color-mix(in oklab, var(--color-on-accent) 82%, transparent)" }}
              >
                {compactUsd(self.marketCap)}
              </text>
            )}
          </g>
        )}

        {/* relation nodes */}
        {layout.nodes.map((n, i) => {
          const r = n.relation;
          const color = KIND_COLOR[r.kind];
          const label = nodeLabel(r);
          const w = Math.max(46, label.length * 8.4 + 16);
          const h = 24;
          const clickable = !!r.ticker;
          const dim = hover != null && hover !== i;
          return (
            <motion.g
              key={`n-${r.id}`}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: dim ? 0.45 : 1 }}
              transition={{ duration: 0.35, delay: reduce ? 0 : Math.min(i * 0.025, 0.5) }}
              style={{ cursor: clickable ? "pointer" : "default" }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              onClick={() => clickable && router.push(`/stock/${r.ticker}`)}
            >
              <rect
                x={n.x - w / 2}
                y={n.y - h / 2}
                width={w}
                height={h}
                rx={6}
                fill="var(--color-bg)"
                stroke={color}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={n.x}
                y={n.y + 3.5}
                textAnchor="middle"
                style={{
                  fontSize: "var(--text-meta)",
                  fontWeight: 600,
                  fill: "var(--color-text)",
                  pointerEvents: "none",
                }}
              >
                {label}
              </text>
            </motion.g>
          );
        })}
      </svg>

      {/* hover tooltip (HTML overlay, positioned over the node) */}
      {hovered && (
        <div
          className="fade-in"
          style={{
            position: "absolute",
            left: `${(hovered.x / W) * 100}%`,
            top: `${(hovered.y / H) * 100}%`,
            transform: "translate(-50%, calc(-100% - 14px))",
            pointerEvents: "none",
            zIndex: 5,
            minWidth: 150,
            maxWidth: 240,
            padding: "8px 10px",
            background: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "var(--shadow-pop)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--color-text)" }}>
              {hovered.relation.name}
            </span>
            {hovered.relation.ticker && hovered.relation.ticker !== hovered.relation.name && (
              <span className="mono" style={{ fontSize: "var(--text-micro)", color: "var(--color-muted)" }}>
                {hovered.relation.ticker}
              </span>
            )}
          </div>
          <div style={{ fontSize: "var(--text-meta)", color: "var(--color-text-secondary)", lineHeight: 1.4 }}>
            {KIND_LABELS[hovered.relation.kind].replace(/s$/, "")}
            {hovered.relation.weightPct != null ? ` · ${hovered.relation.weightPct.toFixed(0)}%` : ""}
            {hovered.relation.note ? ` · ${hovered.relation.note}` : ""}
          </div>
          <div
            className="mono"
            style={{
              marginTop: 4,
              fontSize: "var(--text-micro)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color:
                hovered.relation.confidence === "estimated"
                  ? "var(--color-warn)"
                  : "var(--color-muted)",
            }}
          >
            {hovered.relation.confidence === "estimated" ? "AI-estimated" : "Verified · Finnhub"}
            {hovered.relation.ticker ? " · click to open" : ""}
          </div>
        </div>
      )}
    </div>
  );
}
