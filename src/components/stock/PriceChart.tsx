"use client";
import { useMemo, useState, useRef } from "react";
import type { CandleResponse } from "@/lib/finnhub";
import { CHART_RANGES, type ChartRange } from "@/lib/stockData";
import { useStockCandles } from "@/hooks/useStock";

interface Props {
  ticker: string;
  initialCandles: CandleResponse | null;
  initialRange: ChartRange;
}

const VW = 820; // viewBox width
const VH = 260; // viewBox height
const PAD_X = 8;
const PAD_TOP = 14;
const PAD_BOT = 22;

function fmtPrice(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(unixSec: number, range: ChartRange) {
  const d = new Date(unixSec * 1000);
  if (range === "1D" || range === "1W") {
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  if (range === "1M" || range === "3M") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function PriceChart({ ticker, initialCandles, initialRange }: Props) {
  const [range, setRange] = useState<ChartRange>(initialRange);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // For the default range we already have the bundle's candles — don't refetch.
  const isInitial = range === initialRange;
  const { candles: fetched, isLoading, error } = useStockCandles(
    ticker,
    isInitial ? null : range
  );
  const candles = isInitial ? initialCandles : fetched;

  const series = useMemo(() => {
    if (!candles || candles.s !== "ok" || !candles.c?.length) return null;
    const c = candles.c;
    const t = candles.t;
    const min = Math.min(...c);
    const max = Math.max(...c);
    const span = max - min || 1;
    const n = c.length;
    const innerW = VW - PAD_X * 2;
    const innerH = VH - PAD_TOP - PAD_BOT;
    const x = (i: number) => PAD_X + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = (v: number) => PAD_TOP + innerH - ((v - min) / span) * innerH;
    const pts = c.map((v, i) => [x(i), y(v)] as const);
    const line = pts.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(2)},${py.toFixed(2)}`).join("");
    const area = `${line}L${pts[n - 1][0].toFixed(2)},${(VH - PAD_BOT).toFixed(2)}L${pts[0][0].toFixed(2)},${(VH - PAD_BOT).toFixed(2)}Z`;
    return { c, t, min, max, n, x, y, pts, line, area, first: c[0], last: c[n - 1] };
  }, [candles]);

  const up = series ? series.last >= series.first : true;
  const stroke = up ? "var(--color-bull)" : "var(--color-bear)";
  const changePct = series && series.first ? ((series.last - series.first) / series.first) * 100 : 0;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!series || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * VW;
    const innerW = VW - PAD_X * 2;
    const frac = Math.max(0, Math.min(1, (relX - PAD_X) / innerW));
    setHoverIdx(Math.round(frac * (series.n - 1)));
  }

  const hover = series && hoverIdx != null ? { i: hoverIdx, px: series.x(hoverIdx), py: series.y(series.c[hoverIdx]), price: series.c[hoverIdx], t: series.t[hoverIdx] } : null;

  return (
    <div className="rounded-[var(--radius-lg)] p-5" style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
      {/* Header: range change summary + timeframe toggles */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">Price</p>
          {series && (
            <span className="text-[11.5px] font-semibold tabular-nums" style={{ color: stroke }}>
              {changePct >= 0 ? "+" : ""}{fmtPrice(changePct)}% · {range}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 rounded-[8px] p-0.5" style={{ background: "var(--color-surface-2)" }}>
          {CHART_RANGES.map((r) => (
            <button
              key={r}
              onClick={() => { setRange(r); setHoverIdx(null); }}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-[6px] transition-colors duration-100"
              style={{
                color: r === range ? "white" : "var(--color-text-secondary)",
                background: r === range ? "var(--color-accent)" : "transparent",
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="relative" style={{ height: 260 }}>
        {!series && (
          <div className="absolute inset-0 flex items-center justify-center text-[12px] text-[var(--color-muted)]">
            {isLoading ? "Loading chart…" : error ? "Chart unavailable" : "No price data"}
          </div>
        )}
        {series && (
          <>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VW} ${VH}`}
              preserveAspectRatio="none"
              width="100%"
              height="100%"
              onMouseMove={onMove}
              onMouseLeave={() => setHoverIdx(null)}
              style={{ display: "block", cursor: "crosshair" }}
            >
              <defs>
                <linearGradient id={`grad-${ticker}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
                  <stop offset="100%" stopColor={stroke} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={series.area} fill={`url(#grad-${ticker})`} />
              <path d={series.line} fill="none" stroke={stroke} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
              {hover && (
                <>
                  <line x1={hover.px} y1={PAD_TOP} x2={hover.px} y2={VH - PAD_BOT} stroke="var(--color-border-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                  <circle cx={hover.px} cy={hover.py} r="3.5" fill={stroke} stroke="var(--color-surface)" strokeWidth="1.5" />
                </>
              )}
            </svg>
            {/* Hover readout */}
            {hover && (
              <div
                className="absolute top-0 pointer-events-none px-2 py-1 rounded-[7px] text-[11px] whitespace-nowrap"
                style={{
                  left: `clamp(0px, ${(hover.px / VW) * 100}% - 50px, calc(100% - 110px))`,
                  background: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <span className="font-semibold tabular-nums text-[var(--color-text)]">${fmtPrice(hover.price)}</span>
                <span className="text-[var(--color-muted)] ml-1.5">{fmtDate(hover.t, range)}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
