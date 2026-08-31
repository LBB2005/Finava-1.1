"use client";
import { useEffect, useRef, useState } from "react";
import {
  createChart,
  AreaSeries,
  LineSeries,
  CandlestickSeries,
  HistogramSeries,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";
import type { CandleResponse } from "@/lib/finnhub";
import type { ChartRange } from "@/lib/stockData";
import { withAlpha } from "@/lib/chartPalette";

export type ChartMode = "area" | "line" | "candles";

interface Props {
  candles: CandleResponse | null;
  range: ChartRange;
  mode: ChartMode;
  height?: number;
  loading?: boolean;
  error?: boolean;
}

/**
 * The price hero, on lightweight-charts.
 *
 * This replaced a hand-rolled SVG chart that was doing the job well — the swap
 * buys two things it could not: scroll/pinch zoom and drag-pan into any part of
 * the series, and a canvas instead of ~5,000 DOM nodes at 5Y (one <g> with three
 * children per candle, which is what a phone was being asked to lay out).
 *
 * The library draws to a canvas, so it inherits nothing from globals.css. Every
 * colour is therefore read from the CSS custom properties at mount and re-read
 * whenever the theme changes — see `readTheme`/`useThemeTokens`. A hard-coded
 * palette here would look correct in exactly one of the six appearance
 * combinations the app ships.
 */

/** Intraday ranges need a time-of-day axis; the rest are date-only. */
function isIntraday(range: ChartRange): boolean {
  return range === "1D" || range === "1W";
}

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function hoverDate(unixSec: number, range: ChartRange) {
  const dt = new Date(unixSec * 1000);
  if (isIntraday(range)) {
    return dt.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (range === "1M" || range === "3M") {
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return dt.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

interface ThemeTokens {
  text: string;
  muted: string;
  border: string;
  borderStrong: string;
  bull: string;
  bear: string;
}

const FALLBACK: ThemeTokens = {
  text: "#0d1626",
  muted: "#94a3b8",
  border: "#e6e8ee",
  borderStrong: "#d6dae3",
  bull: "#057a55",
  bear: "#b42318",
};

/** Resolve the design tokens to concrete colours the canvas can use. */
function readTheme(): ThemeTokens {
  if (typeof window === "undefined") return FALLBACK;
  const s = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) =>
    s.getPropertyValue(name).trim() || fallback;
  return {
    text: get("--color-text", FALLBACK.text),
    muted: get("--color-muted", FALLBACK.muted),
    border: get("--color-border", FALLBACK.border),
    borderStrong: get("--color-border-strong", FALLBACK.borderStrong),
    bull: get("--color-bull", FALLBACK.bull),
    bear: get("--color-bear", FALLBACK.bear),
  };
}

/**
 * The current token values, refreshed when the theme changes.
 *
 * Two triggers, because there are two ways the palette moves: `applyAppearance`
 * rewrites data-* attributes on <html> for an explicit choice, and the OS flips
 * `prefers-color-scheme` under the "system" setting without touching the DOM at
 * all. Watching only the first leaves a system-theme user with a light-mode
 * chart on a dark page.
 */
function useThemeTokens(): ThemeTokens {
  const [tokens, setTokens] = useState<ThemeTokens>(FALLBACK);

  useEffect(() => {
    const refresh = () => setTokens(readTheme());
    refresh();

    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-accent"],
    });

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", refresh);

    return () => {
      observer.disconnect();
      media.removeEventListener("change", refresh);
    };
  }, []);

  return tokens;
}

interface Readout {
  price: number;
  time: number;
  open?: number;
  high?: number;
  low?: number;
}

export default function StockChart({
  candles,
  range,
  mode,
  height = 300,
  loading,
  error,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceRef = useRef<ISeriesApi<"Area" | "Line" | "Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  /**
   * Has the user zoomed or panned yet?
   *
   * Auto-fitting and user control are mutually exclusive: refit on every resize
   * and a pinch-zoom springs back the moment anything reflows; never refit and
   * the chart is stuck at whatever width it had on the first frame. So we
   * auto-fit until the first deliberate gesture, then stop and leave it alone.
   */
  const userMovedRef = useRef(false);
  const [readout, setReadout] = useState<Readout | null>(null);
  /**
   * Bumped every time the chart is rebuilt.
   *
   * The chart is torn down whenever `hasData` flips (the container leaves the
   * tree), which orphans every ref pointing into it. Without this in their deps,
   * the series and theme effects skip the rebuild — their own inputs did not
   * change — and the result is a live chart with a null series that silently
   * draws nothing. Making the rebuild an explicit dependency is what keeps the
   * three effects honest about the chart actually being new.
   */
  const [epoch, setEpoch] = useState(0);
  const tokens = useThemeTokens();

  const hasData = Boolean(candles && candles.s === "ok" && candles.c?.length);
  // Direction of the whole window, which is what colours a line/area series.
  const up = hasData ? candles!.c[candles!.c.length - 1] >= candles!.c[0] : true;
  const trend = up ? tokens.bull : tokens.bear;

  // Fit on the next frame, not this one: with autoSize the container is often
  // still 0-width when the effect runs, and a fit computed against that width
  // leaves barSpacing fixed while the chart widens — which renders as the whole
  // series squashed against the right edge with dead space to its left.
  const fitSoon = () => {
    requestAnimationFrame(() => {
      if (!userMovedRef.current) chartRef.current?.timeScale().fitContent();
    });
  };

  // ── Create the chart once ────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      height,
      autoSize: true,
      layout: { background: { color: "transparent" }, attributionLogo: false },
      crosshair: { mode: CrosshairMode.Magnet },
      handleScroll: true,
      handleScale: true,
    });
    chartRef.current = chart;
    setEpoch((n) => n + 1);

    const claim = () => {
      userMovedRef.current = true;
    };
    el.addEventListener("wheel", claim, { passive: true });
    el.addEventListener("pointerdown", claim);

    // autoSize handles the canvas; this only re-fits the visible range so the
    // series keeps spanning the full width until the user takes over.
    const ro = new ResizeObserver(() => fitSoon());
    ro.observe(el);

    return () => {
      el.removeEventListener("wheel", claim);
      el.removeEventListener("pointerdown", claim);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      priceRef.current = null;
      volumeRef.current = null;
    };
    // Keyed on hasData, not [], because the container is only in the tree once
    // there is data to draw: with [] deps this effect runs once against a null
    // ref and the chart is never created when candles arrive after mount.
    // Height changes go through the options effect below rather than a teardown,
    // which would drop the user's zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasData]);

  // ── Theme + axis options, re-applied on every token or range change ──────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      height,
      layout: { textColor: tokens.muted, background: { color: "transparent" } },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: tokens.border, style: 2 },
      },
      rightPriceScale: { borderColor: tokens.border },
      timeScale: {
        borderColor: tokens.border,
        timeVisible: isIntraday(range),
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: tokens.borderStrong, labelBackgroundColor: tokens.borderStrong },
        horzLine: { color: tokens.borderStrong, labelBackgroundColor: tokens.borderStrong },
      },
    });
  }, [tokens, range, height, epoch]);

  // ── Series: rebuilt when the mode changes ────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (priceRef.current) {
      chart.removeSeries(priceRef.current);
      priceRef.current = null;
    }
    if (volumeRef.current) {
      chart.removeSeries(volumeRef.current);
      volumeRef.current = null;
    }

    if (mode === "candles") {
      priceRef.current = chart.addSeries(CandlestickSeries, {
        upColor: tokens.bull,
        downColor: tokens.bear,
        borderUpColor: tokens.bull,
        borderDownColor: tokens.bear,
        wickUpColor: tokens.bull,
        wickDownColor: tokens.bear,
      });
      volumeRef.current = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        // Its own scale id keeps volume off the price axis; the margins pin it
        // to the bottom fifth so it reads as a footer, not a second chart.
        priceScaleId: "volume",
      });
      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
    } else if (mode === "line") {
      priceRef.current = chart.addSeries(LineSeries, {
        color: trend,
        lineWidth: 2,
      });
    } else {
      priceRef.current = chart.addSeries(AreaSeries, {
        lineColor: trend,
        lineWidth: 2,
        topColor: withAlpha(trend, 0.26),
        bottomColor: withAlpha(trend, 0),
      });
    }
  }, [mode, tokens, trend, epoch]);

  // ── Data ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    const series = priceRef.current;
    if (!chart || !series || !hasData || !candles) return;

    const { t, o, h, l, c, v } = candles;

    if (mode === "candles") {
      series.setData(
        t.map((time, i) => ({
          time: time as UTCTimestamp,
          open: o[i],
          high: h[i],
          low: l[i],
          close: c[i],
        }))
      );
      volumeRef.current?.setData(
        t.map((time, i) => ({
          time: time as UTCTimestamp,
          value: v[i],
          color: withAlpha(c[i] >= o[i] ? tokens.bull : tokens.bear, 0.32),
        }))
      );
    } else {
      series.setData(t.map((time, i) => ({ time: time as UTCTimestamp, value: c[i] })));
    }

    // A new timeframe is a new question, so it re-opens fully in view and the
    // previous zoom is deliberately dropped.
    userMovedRef.current = false;
    fitSoon();
  }, [candles, hasData, mode, tokens, epoch]);

  // ── Hover readout ────────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const onMove = (param: MouseEventParams<Time>) => {
      const series = priceRef.current;
      if (!series || !param.time || !param.point) {
        setReadout(null);
        return;
      }
      const point = param.seriesData.get(series);
      if (!point) {
        setReadout(null);
        return;
      }
      const time = param.time as number;
      if ("close" in point) {
        setReadout({
          price: point.close as number,
          time,
          open: point.open as number,
          high: point.high as number,
          low: point.low as number,
        });
      } else if ("value" in point) {
        setReadout({ price: point.value as number, time });
      }
    };

    chart.subscribeCrosshairMove(onMove);
    return () => chart.unsubscribeCrosshairMove(onMove);
  }, [mode, epoch]);

  if (!hasData) {
    if (loading) {
      return <div className="skeleton" style={{ width: "100%", height }} aria-label="Loading chart" />;
    }
    return (
      <div
        className="empty-note"
        style={{ height, display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        {error ? "Chart unavailable" : "No price data"}
      </div>
    );
  }

  return (
    <div style={{ position: "relative", height }}>
      <div ref={containerRef} style={{ width: "100%", height }} />

      {readout && (
        <div
          className="mono"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            pointerEvents: "none",
            padding: "3px 8px",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--text-meta)",
            background: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            boxShadow: "var(--shadow-pop)",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontWeight: 700, color: "var(--color-text)" }}>
            ${fmt(readout.price)}
          </span>
          {readout.open != null && (
            <span style={{ color: "var(--color-muted)", marginLeft: 6 }}>
              O {fmt(readout.open)} H {fmt(readout.high!)} L {fmt(readout.low!)}
            </span>
          )}
          <span style={{ color: "var(--color-muted)", marginLeft: 6 }}>
            {hoverDate(readout.time, range)}
          </span>
        </div>
      )}
    </div>
  );
}
