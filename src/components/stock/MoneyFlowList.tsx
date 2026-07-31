"use client";
import { useRouter } from "next/navigation";
import ModelBadge from "@/components/ui/ModelBadge";
import {
  KIND_LABELS,
  sortByIntensity,
  type MoneyRelation,
  type RelationKind,
} from "@/lib/moneyMap";

const KIND_COLOR: Record<RelationKind, string> = {
  customer: "var(--color-bull)",
  supplier: "var(--color-warn)",
  owner: "var(--color-accent)",
  peer: "var(--color-muted)",
};

function Row({ r }: { r: MoneyRelation }) {
  const router = useRouter();
  const color = KIND_COLOR[r.kind];
  const clickable = !!r.ticker;
  const right =
    r.weightPct != null ? `${r.weightPct.toFixed(0)}%` : r.note ?? KIND_LABELS[r.kind].replace(/s$/, "");

  return (
    <button
      type="button"
      onClick={() => clickable && router.push(`/stock/${r.ticker}`)}
      disabled={!clickable}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(108px, 1.2fr) 1fr auto",
        alignItems: "center",
        gap: 10,
        width: "100%",
        textAlign: "left",
        padding: "7px 8px",
        borderRadius: "var(--radius-md)",
        border: "1px solid transparent",
        background: "transparent",
        cursor: clickable ? "pointer" : "default",
      }}
      className={clickable ? "money-flow-row" : undefined}
    >
      {/* name + kind dot */}
      <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
        <span style={{ width: 7, height: 7, borderRadius: 99, background: color, flexShrink: 0 }} />
        <span
          style={{
            fontSize: "var(--text-sm)",
            fontWeight: 600,
            color: "var(--color-text)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {r.name}
        </span>
        {r.ticker && r.ticker !== r.name && (
          <span className="mono" style={{ fontSize: "var(--text-micro)", color: "var(--color-muted)", flexShrink: 0 }}>
            {r.ticker}
          </span>
        )}
      </span>

      {/* intensity bar (the heat) */}
      <span style={{ display: "block", height: 6, borderRadius: 99, background: "var(--color-surface-2)", overflow: "hidden" }}>
        <span
          style={{
            display: "block",
            height: "100%",
            width: `${Math.round(r.intensity * 100)}%`,
            background: color,
            borderRadius: 99,
            opacity: r.confidence === "estimated" ? 0.55 : 0.9,
          }}
        />
      </span>

      {/* weight / provenance */}
      <span style={{ display: "flex", alignItems: "center", gap: 8, justifySelf: "end" }}>
        <span className="mono" style={{ fontSize: "var(--text-micro)", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
          {right}
        </span>
        {r.confidence === "estimated" && r.model ? (
          <ModelBadge slug={r.model} size={11} showLabel={false} title="AI-estimated" />
        ) : (
          <span className="mono" style={{ fontSize: "var(--text-micro)", letterSpacing: "0.04em", color: "var(--color-muted)" }}>
            FINNHUB
          </span>
        )}
      </span>
    </button>
  );
}

export default function MoneyFlowList({ relations }: { relations: MoneyRelation[] }) {
  if (!relations.length) return null;
  const sorted = sortByIntensity(relations);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {sorted.map((r) => (
        <Row key={r.id} r={r} />
      ))}
    </div>
  );
}
