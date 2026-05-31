"use client";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useQuotes } from "@/hooks/useQuotes";

interface Props {
  ticker: string;
}

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function Cell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-muted)] mb-1">{label}</p>
      <p className="text-[14px] font-semibold tabular-nums" style={{ color: color ?? "var(--color-text)" }}>{value}</p>
    </div>
  );
}

/** Your position in this ticker. Renders nothing unless the symbol is held. */
export default function PositionCard({ ticker }: Props) {
  const { holdings, cashBalance } = usePortfolio();
  const held = holdings.find((h) => h.ticker.toUpperCase() === ticker.toUpperCase());
  const { quoteMap } = useQuotes(held ? holdings.map((h) => h.ticker) : []);

  if (!held) return null;

  const price = quoteMap.get(ticker)?.price ?? 0;
  const hasPrice = price > 0;
  const shares = held.shares;
  const costBasis = held.avgCost * shares;
  const marketValue = hasPrice ? price * shares : costBasis;
  const gainLoss = hasPrice ? marketValue - costBasis : 0;
  const gainLossPct = costBasis > 0 && hasPrice ? (gainLoss / costBasis) * 100 : 0;
  const up = gainLoss >= 0;

  // % of total equity book (all holdings at market).
  const equity = holdings.reduce((s, h) => {
    const p = quoteMap.get(h.ticker)?.price ?? 0;
    return s + (p > 0 ? p * h.shares : h.avgCost * h.shares);
  }, 0);
  const totalAccount = equity + cashBalance;
  const pctOfPortfolio = totalAccount > 0 ? (marketValue / totalAccount) * 100 : 0;

  return (
    <div className="rounded-[var(--radius-lg)] p-5" style={{ border: "1px solid var(--color-accent-medium)", background: "var(--color-surface)" }}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">Your Position</p>
        <span className="text-[11px] tabular-nums text-[var(--color-muted)]">{fmt(pctOfPortfolio, 1)}% of portfolio</span>
      </div>
      <div className="grid grid-cols-3 gap-x-4 gap-y-4">
        <Cell label="Shares" value={fmt(shares, shares % 1 === 0 ? 0 : 2)} />
        <Cell label="Avg cost" value={`$${fmt(held.avgCost)}`} />
        <Cell label="Market value" value={`$${fmt(marketValue, 0)}`} />
        <Cell label="Cost basis" value={`$${fmt(costBasis, 0)}`} />
        <Cell
          label="Gain / Loss"
          value={hasPrice ? `${up ? "+" : ""}$${fmt(Math.abs(gainLoss), 0)}` : "—"}
          color={hasPrice ? (up ? "var(--color-bull)" : "var(--color-bear)") : undefined}
        />
        <Cell
          label="Return"
          value={hasPrice ? `${up ? "+" : ""}${fmt(gainLossPct, 2)}%` : "—"}
          color={hasPrice ? (up ? "var(--color-bull)" : "var(--color-bear)") : undefined}
        />
      </div>
    </div>
  );
}
