"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Holding, Quote } from "@/types/portfolio";

interface Props {
  holding: Holding;
  quote?: Quote;
  portfolioPct?: number;
  onRemove: (id: string) => void;
  /** Compact = sidebar holding row (ticker chip + name + pct, no expand) */
  compact?: boolean;
  /** When true (e.g. Plaid-synced book), the remove control is hidden. */
  readOnly?: boolean;
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function Stat({ label, value, color, span, text }: {
  label: string; value: string; color?: string; span?: boolean;
  /** Non-numeric value (e.g. sector name) — rendered in the UI sans instead of mono. */
  text?: boolean;
}) {
  return (
    <div className={span ? "col-span-2" : ""}>
      <p className="text-[length:var(--text-micro)] text-[var(--color-muted)] leading-none mb-0.5">{label}</p>
      <p
        className={`text-[length:var(--text-meta)] font-medium ${text ? "" : "mono tabular-nums"}`}
        style={{ color: color ?? "var(--color-text-secondary)" }}
      >{value}</p>
    </div>
  );
}

export default function HoldingCard({ holding, quote, portfolioPct, onRemove, compact = false, readOnly = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();

  const price = quote?.price ?? 0;
  const marketValue = price > 0 ? price * holding.shares : holding.avgCost * holding.shares;
  const costBasis = holding.avgCost * holding.shares;
  const gainLoss = price > 0 ? marketValue - costBasis : 0;
  const gainLossPct = costBasis > 0 && price > 0 ? (gainLoss / costBasis) * 100 : 0;
  const isUp = gainLoss >= 0;
  const dayChange = quote?.changePct ?? 0;
  const isDayUp = dayChange >= 0;

  /* ── Compact sidebar row ─────────────────────────────────────────────── */
  if (compact) {
    return (
      <div
        className="group grid items-center gap-[10px] px-[18px] py-[8px] cursor-pointer bg-transparent hover:bg-[var(--color-sidebar-hover)] transition-colors duration-100"
        style={{
          gridTemplateColumns: "auto 1fr auto",
        }}
        onClick={() => router.push(`/stock/${holding.ticker}`)}
      >
        {/* Ticker chip */}
        <span
          className="text-[length:var(--text-micro)] font-bold tracking-[0.04em] px-[6px] py-[3px] rounded-[var(--radius-xs)]"
          style={{ color: "var(--color-accent)", background: "var(--color-accent-light)" }}
        >
          {holding.ticker}
        </span>

        {/* Company name */}
        <span
          className="text-[length:var(--text-meta)] overflow-hidden text-ellipsis whitespace-nowrap"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {holding.companyName ?? holding.ticker}
        </span>

        {/* P&L pct */}
        <span
          className="mono text-[length:var(--text-meta)] font-semibold tabular-nums"
          style={{ color: price > 0 ? (isUp ? "var(--color-bull)" : "var(--color-bear)") : "var(--color-muted)" }}
        >
          {price > 0 ? `${isUp ? "+" : ""}${fmt(gainLossPct, 1)}%` : "—"}
        </span>
      </div>
    );
  }

  /* ── Full expandable card ────────────────────────────────────────────── */
  return (
    <div
      className="group flex flex-col px-3 py-2 rounded-[var(--radius-md)] hover:bg-[var(--color-sidebar-hover)] transition-colors duration-150 cursor-pointer"
      onClick={() => setExpanded((v) => !v)}
    >
      {/* Main row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[length:var(--text-meta)] font-bold text-[var(--color-accent)] bg-[var(--color-accent-light)] px-1.5 py-0.5 rounded-[var(--radius-xs)] flex-shrink-0">
            {holding.ticker}
          </span>
          {holding.companyName && (
            <span className="text-[length:var(--text-meta)] text-[var(--color-muted)] truncate">{holding.companyName}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span
            className="mono text-[length:var(--text-meta)] font-medium tabular-nums"
            style={{ color: price > 0 ? (isUp ? "var(--color-bull)" : "var(--color-bear)") : "var(--color-muted)" }}
          >
            {price > 0 ? `${isUp ? "+" : ""}${fmt(gainLossPct, 1)}%` : "—"}
          </span>
          {!readOnly && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(holding.id); }}
              className="opacity-0 group-hover:opacity-100 text-[var(--color-muted)] hover:text-[var(--color-bear)] transition-opacity duration-150 p-0.5"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Sub row */}
      <div className="flex items-center justify-between mt-0.5">
        <span className="text-[length:var(--text-meta)] text-[var(--color-muted)] tabular-nums">
          {fmt(holding.shares, holding.shares % 1 === 0 ? 0 : 2)} sh
          {portfolioPct !== undefined && portfolioPct > 0 && (
            <span className="ml-1 text-[var(--color-accent-medium)]">{fmt(portfolioPct, 1)}%</span>
          )}
        </span>
        <span className="mono text-[length:var(--text-meta)] text-[var(--color-text-secondary)] font-medium tabular-nums">
          {price > 0 ? `$${fmt(marketValue, 0)}` : `$${fmt(costBasis, 0)}`}
        </span>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div
          className="mt-2 pt-2 border-t border-[var(--color-border)] grid grid-cols-2 gap-x-3 gap-y-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <Stat label="Price" value={price > 0 ? `$${fmt(price)}` : "—"} />
          <Stat label="Day" value={quote ? `${isDayUp ? "+" : ""}${fmt(dayChange, 2)}%` : "—"} color={isDayUp ? "var(--color-bull)" : "var(--color-bear)"} />
          <Stat label="Avg cost" value={`$${fmt(holding.avgCost)}`} />
          <Stat label="Cost basis" value={`$${fmt(costBasis, 0)}`} />
          <Stat label="Gain / Loss" value={price > 0 ? `${gainLoss >= 0 ? "+" : ""}$${fmt(Math.abs(gainLoss), 0)}` : "—"} color={isUp ? "var(--color-bull)" : "var(--color-bear)"} />
          <Stat label="Mkt value" value={`$${fmt(marketValue, 0)}`} />
          {holding.sector && <Stat label="Sector" value={holding.sector} span text />}
        </div>
      )}
    </div>
  );
}
