"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CandleResponse } from "@/lib/finnhub";
import type { ChartRange } from "@/lib/stockData";

export type ChartMode = "area" | "line" | "candles";

interface Props {
  candles: CandleResponse | null;
  range: ChartRange;
  mode: ChartMode;
  height?: number;
  loading?: boolean;
  error?: boolean;
}

const VW = 820;
const PADX = 10;
const PADT = 14;
const PADB = 30; // room for the time axis
const PADR = 54; // room for the price axis

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

// Time-axis tick label, formatted to the active range.
function axisTick(unixSec: number, range: ChartRange) {
  const dt = new Date(unixSec * 1000);
  switch (range) {
    case "1D":
      return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    case "1W":
      return dt.toLocaleDateString("en-US", { weekday: "short" });
    case "1M":
    case "3M":
      return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    case "1Y":
      return dt.toLocaleDateString("en-US", { month: "short" });
    case "5Y":
      return `'${String(dt.getFullYear()).slice(2)}`;
  }
}

// Hover-readout date/time, a touch more specific than the axis ticks.
function hoverDate(unixSec: number, range: ChartRange) {
  const dt = new Date(unixSec * 1000);
  if (range === "1D" || range === "1W") {
    return dt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  if (range === "1M" || range === "3M") {
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return dt.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function StockChart({ candles, range, mode, height = 300, loading, error }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  // Track the chart's rendered width so axis-label density can adapt: below
  // ~420px the 5 time ticks crowd and overlap, so we thin them and shrink labels.
  const [width, setWidth] = useState(0);
  const narrow = width > 0 && width < 420;

  const data = useMemo(() => {
    if (!candles || candles.s !== "ok" || !candles.c?.length) return null;
    const n = candles.c.length;
    const c = candles.c;
    const isCandle = mode === "candles";
    // Price domain: highs/lows for candles, closes otherwise, padded for breathing room.
    const lows = isCandle ? candles.l : c;
    const highs = isCandle ? candles.h : c;
    let min = Math.min(...lows);
    let max = Math.max(...highs);
    const pad = (max - min || 1) * 0.1;
    min -= pad;
    max += pad;
    const span = max - min || 1;

    const volH = isCandle ? height * 0.2 : 0;
    const priceBottom = height - PADB - (volH ? volH + 8 : 0);
    const innerH = priceBottom - PADT;
    const innerW = VW - PADX - PADR;

    const x = (i: number) => PADX + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = (v: number) => PADT + innerH - ((v - min) / span) * innerH;

    const pts = c.map((v, i) => [x(i), y(v)] as const);
    const line = pts.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
    const area = `${line}L${pts[n - 1][0].toFixed(1)},${priceBottom.toFixed(1)}L${pts[0][0].toFixed(1)},${priceBottom.toFixed(1)}Z`;

    const vmax = isCandle ? Math.max(...candles.v, 1) : 1;
    const up = c[n - 1] >= c[0];

    // 4 evenly-spaced price ticks. Time ticks are derived at render time so their
    // density can adapt to the measured chart width (narrow phones get fewer).
    const yTicks = [0, 1, 2, 3].map((k) => min + ((max - min) * k) / 3);

    return { n, c, x, y, pts, line, area, min, max, up, vmax, volH, priceBottom, innerW, yTicks };
  }, [candles, mode, height]);

  // Observe the container's rendered width (NOT the SVG — ResizeObserver doesn't
  // fire for SVG replaced elements in Chromium). Kept out of the price `useMemo`
  // so `data` stays width-independent (stable identity) and only ticks reflow.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0]?.contentRect.width ?? el.clientWidth);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  if (!data) {
    // Loading gets a chart-shaped shimmer; error/empty use the house empty-note.
    if (loading) {
      return <div className="skeleton" style={{ width: "100%", height }} aria-label="Loading chart" />;
    }
    return (
      <div className="empty-note" style={{ height, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {error ? "Chart unavailable" : "No price data"}
      </div>
    );
  }

  const stroke = data.up ? "var(--color-bull)" : "var(--color-bear)";
  const dd = data.max - data.min < 8 ? 2 : 0;
  const lastY = data.y(data.c[data.n - 1]);
  const isCandle = mode === "candles";

  // Gate hover updates to one per animation frame — mousemove fires far more
  // often than the readout can usefully repaint.
  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!ref.current || !data || rafRef.current != null) return;
    const { clientX } = e;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (!ref.current || !data) return;
      const r = ref.current.getBoundingClientRect();
      const relX = ((clientX - r.left) / r.width) * VW;
      const frac = Math.max(0, Math.min(1, (relX - PADX) / data.innerW));
      setHover(Math.round(frac * (data.n - 1)));
    });
  }

  const cw = (VW - PADX - PADR) / data.n;
  const bw = Math.max(1.5, cw * 0.6);

  const h =
    hover != null
      ? { i: hover, px: data.x(hover), py: data.y(data.c[hover]), price: data.c[hover], t: candles!.t[hover] }
      : null;

  // Time-axis ticks, thinned on narrow screens so labels don't overlap.
  const tickCount = Math.min(narrow ? 3 : 5, data.n);
  const xTicks = Array.from({ length: tickCount }, (_, k) => {
    const idx = Math.round((k / (tickCount - 1 || 1)) * (data.n - 1));
    return candles!.t[idx];
  });
  // Axis labels ride the micro step; the narrow-screen variant stays a smaller
  // numeric size (tiny axis text ≤10 is the sanctioned off-ramp).
  const axisFont: string | number = narrow ? 8.5 : "var(--text-micro)";

  return (
    <div ref={containerRef} style={{ position: "relative", height }}>
      <svg
        ref={ref}
        viewBox={`0 0 ${VW} ${height}`}
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        onMouseMove={onMove}
        onMouseLeave={() => {
          if (rafRef.current != null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
          }
          setHover(null);
        }}
        style={{ display: "block", cursor: "crosshair" }}
      >
        <defs>
          <linearGradient id="stockchart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={mode === "area" ? 0.16 : 0} />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* horizontal gridlines */}
        {data.yTicks.map((v, i) => (
          <line
            key={i}
            x1={PADX}
            y1={data.y(v)}
            x2={VW - PADR}
            y2={data.y(v)}
            stroke="var(--color-border)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            strokeDasharray={i === 0 ? "0" : "3 4"}
            opacity={i === 0 ? 0.9 : 0.6}
          />
        ))}

        {isCandle ? (
          candles!.c.map((_, i) => {
            const o = candles!.o[i];
            const cl = candles!.c[i];
            const hi = candles!.h[i];
            const lo = candles!.l[i];
            const upC = cl >= o;
            const col = upC ? "var(--color-bull)" : "var(--color-bear)";
            const cx = data.x(i);
            const yo = data.y(o);
            const yc = data.y(cl);
            const top = Math.min(yo, yc);
            const bh = Math.max(1, Math.abs(yc - yo));
            const vh = (candles!.v[i] / data.vmax) * data.volH;
            return (
              <g key={i} opacity={hover != null && hover !== i ? 0.5 : 1}>
                <line x1={cx} y1={data.y(hi)} x2={cx} y2={data.y(lo)} stroke={col} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <rect x={cx - bw / 2} y={top} width={bw} height={bh} fill={col} />
                {data.volH > 0 && <rect x={cx - bw / 2} y={height - PADB - vh} width={bw} height={vh} fill={col} opacity="0.26" />}
              </g>
            );
          })
        ) : (
          <>
            {mode === "area" && <path d={data.area} fill="url(#stockchart-fill)" />}
            <path d={data.line} fill="none" stroke={stroke} strokeWidth="1.7" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            {/* dashed current-price line — house "3 4" dash rhythm */}
            <line x1={PADX} y1={lastY} x2={VW - PADR} y2={lastY} stroke={stroke} strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" opacity="0.55" />
          </>
        )}

        {h && (
          <>
            <line x1={h.px} y1={PADT} x2={h.px} y2={data.priceBottom} stroke="var(--color-border-strong)" strokeWidth="1" strokeDasharray={isCandle ? "3 4" : "0"} vectorEffect="non-scaling-stroke" />
            {!isCandle && <circle cx={h.px} cy={h.py} r="3.6" fill={stroke} stroke="var(--color-bg)" strokeWidth="1.6" />}
          </>
        )}
      </svg>

      {/* Y price labels */}
      {data.yTicks.map((v, i) => (
        <span
          key={i}
          className="mono"
          style={{
            position: "absolute",
            right: 6,
            top: `clamp(7px, ${(data.y(v) / height) * 100}%, calc(100% - 7px))`,
            transform: "translateY(-50%)",
            fontSize: axisFont,
            color: "var(--color-muted)",
            pointerEvents: "none",
            lineHeight: 1,
          }}
        >
          ${fmt(v, dd)}
        </span>
      ))}

      {/* current-price tag on the right axis */}
      <span
        className="mono"
        style={{
          position: "absolute",
          right: 4,
          top: `clamp(9px, ${(lastY / height) * 100}%, calc(100% - 9px))`,
          transform: "translateY(-50%)",
          fontSize: "var(--text-micro)",
          fontWeight: 700,
          color: "var(--color-on-accent)",
          background: stroke,
          padding: "1px 5px",
          borderRadius: "var(--radius-xs)",
          pointerEvents: "none",
          lineHeight: 1.3,
        }}
      >
        ${fmt(data.c[data.n - 1], dd)}
      </span>

      {/* X time labels */}
      <div
        className="mono"
        style={{
          position: "absolute",
          left: `${(PADX / VW) * 100}%`,
          right: `${(PADR / VW) * 100}%`,
          bottom: 4,
          display: "flex",
          justifyContent: "space-between",
          pointerEvents: "none",
        }}
      >
        {xTicks.map((t, i) => (
          <span key={i} style={{ fontSize: axisFont, color: "var(--color-muted)" }}>
            {axisTick(t, range)}
          </span>
        ))}
      </div>

      {/* Hover readout */}
      {h && (
        <div
          className="mono"
          style={{
            position: "absolute",
            top: 0,
            pointerEvents: "none",
            padding: "3px 8px",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--text-meta)",
            left: `clamp(0px, ${(h.px / VW) * 100}% - 52px, calc(100% - 132px))`,
            background: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            boxShadow: "var(--shadow-pop)",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontWeight: 700, color: "var(--color-text)" }}>${fmt(h.price)}</span>
          <span style={{ color: "var(--color-muted)", marginLeft: 6 }}>{hoverDate(h.t, range)}</span>
        </div>
      )}
    </div>
  );
}
