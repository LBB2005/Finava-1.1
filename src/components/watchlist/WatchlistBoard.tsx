"use client";
import Link from "next/link";
import { useLiveBoard } from "@/hooks/useLiveBoard";

function pct(n: number | null): string {
  if (n === null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function price(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function WatchlistBoard({
  tickers,
  compact = false,
  onRemove,
}: {
  tickers: string[];
  compact?: boolean;
  onRemove?: (ticker: string) => void;
}) {
  const { liveMap, isLoading } = useLiveBoard(tickers);

  if (tickers.length === 0) {
    return (
      <p style={{ fontSize: 12, color: "var(--color-muted)", padding: compact ? "8px 14px" : "20px 14px" }}>
        No stocks yet — add one to start tracking.
      </p>
    );
  }

  return (
    <div style={{ overflow: "hidden", background: "var(--color-bg)" }}>
      <table className="lad-table board-table" style={{ minWidth: compact ? undefined : 520, width: "100%" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Ticker</th>
            <th className="num">Last</th>
            <th className="num">Chg</th>
            {!compact && <th className="num">Mkt Cap</th>}
            {!compact && onRemove && <th style={{ width: 32 }} />}
          </tr>
        </thead>
        <tbody>
          {tickers.map((t) => {
            const row = liveMap.get(t);
            const chg = row?.changePct ?? null;
            const up = (chg ?? 0) >= 0;
            return (
              <tr key={t}>
                <td style={{ textAlign: "left" }}>
                  <Link href={`/stock/${t}`} style={{ color: "var(--color-text)", fontWeight: 600 }}>{t}</Link>
                </td>
                <td className="num">{isLoading && !row ? "…" : price(row?.price ?? null)}</td>
                <td className="num" style={{ color: chg === null ? "var(--color-muted)" : up ? "var(--color-bull)" : "var(--color-bear)" }}>
                  {pct(chg)}
                </td>
                {!compact && (
                  <td className="num">
                    {row?.marketCap == null ? "—" : `$${(row.marketCap / 1e9).toFixed(1)}B`}
                  </td>
                )}
                {!compact && onRemove && (
                  <td>
                    <button
                      aria-label={`Remove ${t}`}
                      onClick={() => onRemove(t)}
                      style={{ color: "var(--color-muted)", fontSize: 13, lineHeight: 1, padding: 4 }}
                    >
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
