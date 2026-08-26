"use client";
import { useMemo, useState } from "react";
import { useQuotes } from "@/hooks/useQuotes";
import { useStockCandles } from "@/hooks/useStock";
import { CHART_RANGES, type ChartRange } from "@/lib/stockData";
import type { StockProfile } from "@/lib/stockData";
import type { CandleResponse, TickerSnapshot } from "@/lib/finnhub";
import StockChart, { type ChartMode } from "./StockChart";
import IntelligenceRail from "./IntelligenceRail";
import RangeToggle from "@/components/ui/RangeToggle";

interface Props {
  ticker: string;
  profile: StockProfile | null;
  fallbackQuote: TickerSnapshot | null;
  initialCandles: CandleResponse | null;
  initialRange: ChartRange;
  /** Rail click-throughs — provided by the page, which owns tab state. */
  onOpenAnalysis: (opts?: { run?: boolean }) => void;
  onOpenDcf: () => void;
}

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function signed(n: number, d = 2) {
  return `${n >= 0 ? "+" : ""}${fmt(n, d)}`;
}

const RANGE_LABEL: Record<ChartRange, string> = {
  "1D": "Today",
  "1W": "Past week",
  "1M": "Past month",
  "3M": "Past 3 months",
  "1Y": "Past year",
  "5Y": "Past 5 years",
};

function LogoBadge({ logo, ticker, size = 44 }: { logo: string | null; ticker: string; size?: number }) {
  const [err, setErr] = useState(false);
  const show = logo && !err;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "var(--radius-sm)",
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt=""
          width={Math.round(size * 0.74)}
          height={Math.round(size * 0.74)}
          style={{ objectFit: "contain", borderRadius: "var(--radius-xs)" }}
          onError={() => setErr(true)}
        />
      ) : (
        <span className="serif" style={{ color: "var(--color-accent)", fontWeight: 700, fontSize: size * 0.32 }}>
          {ticker.slice(0, 2)}
        </span>
      )}
    </div>
  );
}

export default function StockHero({ ticker, profile, fallbackQuote, initialCandles, initialRange, onOpenAnalysis, onOpenDcf }: Props) {
  const [range, setRange] = useState<ChartRange>(initialRange);
  const [mode, setMode] = useState<ChartMode>("area");

  const { quoteMap } = useQuotes([ticker]);

  // Default range comes baked into the bundle — only fetch on a non-default switch.
  const isInitial = range === initialRange;
  const { candles: fetched, isLoading, error } = useStockCandles(ticker, isInitial ? null : range);
  const candles = isInitial ? initialCandles : fetched;

  const live = quoteMap.get(ticker);
  const price = live?.price ?? fallbackQuote?.price ?? 0;
  const change = live?.change ?? fallbackQuote?.change ?? 0;
  const changePct = live?.changePct ?? fallbackQuote?.changePct ?? 0;
  const up = changePct >= 0;
  const hasPrice = price > 0;

  // Range performance, from the chart's own first→last close.
  const rangePct = useMemo(() => {
    if (!candles || candles.s !== "ok" || candles.c.length < 2) return null;
    const c = candles.c;
    return ((c[c.length - 1] - c[0]) / c[0]) * 100;
  }, [candles]);
  const rUp = (rangePct ?? 0) >= 0;

  const modes: ChartMode[] = ["area", "line", "candles"];

  return (
    <div style={{ position: "relative", padding: "18px var(--page-gutter) 0", background: "linear-gradient(180deg, var(--color-accent-light), transparent 80%)" }}>
      {/* Big price (identity lives in the standard PageHeader above) + chart-type toggle */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", rowGap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          <LogoBadge logo={profile?.logo ?? null} ticker={ticker} />
          <div style={{ minWidth: 0 }}>
            <div className="serif" style={{ fontSize: "var(--text-hero)", fontWeight: 800, lineHeight: 1, letterSpacing: "-0.005em", color: "var(--color-text)" }}>
              {hasPrice ? `$${fmt(price)}` : "—"}
            </div>
            {hasPrice && (
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                <span className="mono" style={{ fontSize: "var(--text-body)", fontWeight: 700, color: up ? "var(--color-bull)" : "var(--color-bear)" }}>
                  {signed(change)} ({signed(changePct)}%) today
                </span>
              </div>
            )}
          </div>
        </div>
        <RangeToggle
          options={modes}
          value={mode}
          onChange={setMode}
          labels={{ area: "AREA", line: "LINE", candles: "CANDLES" }}
        />
      </div>

      {/* Chart card — chart pane + intelligence rail behind one hairline (§1) */}
      <div className="stock-chartcard" style={{ marginTop: 10, marginBottom: 16 }}>
        <div className="stock-chartpane">
          <StockChart candles={candles} range={range} mode={mode} height={300} loading={isLoading} error={!!error} />
          {/* Range row — nested in the chart pane so it never spans under the rail */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px 12px", flexWrap: "wrap", gap: 10, borderTop: "1px solid var(--color-border)" }}>
            <span className="mono" style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: rUp ? "var(--color-bull)" : "var(--color-bear)" }}>
              {rangePct == null ? "" : signed(rangePct)}%{" "}
              <span style={{ color: "var(--color-muted)", fontWeight: 500 }}>· {RANGE_LABEL[range]}</span>
            </span>
            <RangeToggle options={CHART_RANGES} value={range} onChange={setRange} />
          </div>
        </div>
        <IntelligenceRail ticker={ticker} onOpenAnalysis={onOpenAnalysis} onOpenDcf={onOpenDcf} />
      </div>
    </div>
  );
}
