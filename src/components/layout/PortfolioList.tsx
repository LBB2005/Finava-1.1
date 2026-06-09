"use client";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useQuotes } from "@/hooks/useQuotes";
import HoldingCard from "./HoldingCard";

interface Props {
  /** When true, renders compact holding rows without the summary header (hero lives in Sidebar) */
  compact?: boolean;
}

export default function PortfolioList({ compact = false }: Props) {
  const { holdings, isLoading, removeHolding, plaidConnected } = usePortfolio();
  const tickers = holdings.map((h) => h.ticker);
  const { quoteMap } = useQuotes(tickers);

  const totalValue = holdings.reduce((sum, h) => {
    const price = quoteMap.get(h.ticker)?.price ?? 0;
    return sum + (price > 0 ? price * h.shares : h.avgCost * h.shares);
  }, 0);

  if (isLoading) return <div className="px-4 py-3 text-xs text-[var(--color-muted)]">Loading…</div>;

  if (holdings.length === 0) {
    return (
      <div className="px-4 py-3 text-center">
        <p className="text-xs text-[var(--color-muted)]">No holdings yet — use + to add</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col pb-2">
      {/* Holdings */}
      <div className={compact ? "" : "px-1"}>
        {holdings.map((h) => {
          const quote = quoteMap.get(h.ticker);
          const price = quote?.price ?? 0;
          const mv = price > 0 ? price * h.shares : h.avgCost * h.shares;
          const pct = totalValue > 0 ? (mv / totalValue) * 100 : 0;
          return (
            <HoldingCard
              key={h.id}
              holding={h}
              quote={quote}
              portfolioPct={pct}
              onRemove={removeHolding}
              compact={compact}
              readOnly={plaidConnected}
            />
          );
        })}
      </div>
    </div>
  );
}
