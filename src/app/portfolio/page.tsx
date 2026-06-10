"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useQuotes } from "@/hooks/useQuotes";
import { useChatStore } from "@/stores/chatStore";
import { useToast } from "@/hooks/useToast";
import type { Holding, Quote } from "@/types/portfolio";
import ConnectBrokerageButton from "@/components/portfolio/ConnectBrokerageButton";
import ChatContextButton from "@/components/chat/ChatContextButton";
import PageHeader from "@/components/layout/PageHeader";

type Period = "1D" | "1W" | "1M" | "YTD" | "1Y" | "5Y" | "ALL";
const PERIODS: Period[] = ["1D", "1W", "1M", "YTD", "1Y", "5Y", "ALL"];

// Allocation palette — navy→lighter-blue ramp from the design kit
function segColor(i: number, n = 8) {
  const L = 0.42 + (i / Math.max(n - 1, 1)) * 0.30;
  const H = 256 - i * 9;
  return `oklch(${L.toFixed(3)} 0.11 ${H})`;
}

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmt0(n: number) {
  return Math.round(Math.abs(n)).toLocaleString("en-US");
}

function polarXY(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}
function arcPath(cx: number, cy: number, or: number, ir: number, a1: number, a2: number) {
  const span = a2 - a1;
  if (span < 0.5) return "";
  const [x1, y1] = polarXY(cx, cy, or, a1);
  const [x2, y2] = polarXY(cx, cy, or, a2);
  const [x3, y3] = polarXY(cx, cy, ir, a2);
  const [x4, y4] = polarXY(cx, cy, ir, a1);
  const large = span > 180 ? 1 : 0;
  return `M${x1},${y1}A${or},${or} 0 ${large},1 ${x2},${y2}L${x3},${y3}A${ir},${ir} 0 ${large},0 ${x4},${y4}Z`;
}

interface HoldingRow {
  holding: Holding;
  quote?: Quote;
  mv: number;
  pct: number;
  gainLoss: number;
  gainLossPct: number;
}

function seedRng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function finavaScore(ticker: string): number {
  const rng = seedRng(ticker + "finava25");
  return Math.floor(rng() * 30 + 60);
}

// Tier-colored score pill
function ScorePill({ score }: { score: number }) {
  const color =
    score >= 70 ? "var(--color-bull)"
    : score >= 60 ? "var(--color-warn)"
    : "var(--color-bear)";
  const bg =
    score >= 80 ? "color-mix(in oklab, var(--color-bull) 13%, transparent)"
    : score >= 70 ? "color-mix(in oklab, var(--color-bull) 8%, transparent)"
    : score >= 60 ? "color-mix(in oklab, var(--color-warn) 13%, transparent)"
    : "color-mix(in oklab, var(--color-bear) 15%, transparent)";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: 30, padding: "3px 8px", borderRadius: 5,
      fontSize: 11.5, fontWeight: 700, color, background: bg,
      fontVariantNumeric: "tabular-nums",
    }}>{score}</span>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 10, fontWeight: 700, textTransform: "uppercase",
      letterSpacing: "0.16em", color: "var(--color-muted)", margin: 0,
    }}>{children as string}</p>
  );
}

// KPI block used in the strip below the hero card
function KpiStat({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Eyebrow>{label}</Eyebrow>
      <span className="serif" style={{
        fontSize: 26, fontWeight: 800, letterSpacing: "-0.015em",
        color: accent ?? "var(--color-text)", lineHeight: 1,
      }}>{value}</span>
      {sub && <span style={{ fontSize: 11.5, color: "var(--color-muted)" }}>{sub}</span>}
    </div>
  );
}

// Pill-style segmented range toggle
function RangeToggle({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div style={{ display: "flex", gap: 2, background: "var(--color-surface)", borderRadius: 99, padding: 3 }}>
      {PERIODS.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          style={{
            fontSize: 10.5, fontWeight: 600, letterSpacing: "0.02em",
            padding: "4px 9px", borderRadius: 99, border: "none", cursor: "pointer",
            color: value === p ? "#fff" : "var(--color-text-secondary)",
            background: value === p ? "var(--color-accent)" : "transparent",
            transition: "background 140ms, color 140ms",
          }}
        >{p}</button>
      ))}
    </div>
  );
}

const SPX_RETURNS: Record<Period, number> = {
  "1D": 0.12, "1W": 0.8, "1M": 2.1, "YTD": 6.8, "1Y": 24.2, "5Y": 80, "ALL": 150,
};
const PERIOD_SCALE: Record<Period, number> = {
  "1D": 0.002, "1W": 0.008, "1M": 0.025, "YTD": 0.08, "1Y": 0.25, "5Y": 0.72, "ALL": 1,
};
const PERIOD_LABELS: Record<Period, string[]> = {
  "1D":  ["9:30", "11", "1", "3", "4"],
  "1W":  ["Mon", "Tue", "Wed", "Thu", "Fri"],
  "1M":  ["Wk 1", "Wk 2", "Wk 3", "Wk 4"],
  "YTD": ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
  "1Y":  ["Jul", "Sep", "Nov", "Jan", "Mar", "Jun"],
  "5Y":  ["'21", "'22", "'23", "'24", "'25", "'26"],
  "ALL": ["'20", "'21", "'22", "'23", "'24", "'25", "'26"],
};

// You vs S&P 500 area chart. Portfolio = filled accent area + solid line;
// S&P 500 = dashed muted line. End dot marks the current value.
function BenchmarkChart({
  totalGainPct,
  period,
  seed,
}: {
  totalGainPct: number;
  period: Period;
  seed: string;
}) {
  const W = 520, H = 172;

  const { portPts, spxPts, portAreaPath, lastPortPt, yourReturn, spxRet } = useMemo(() => {
    const n = 60;
    const yourReturn = totalGainPct * PERIOD_SCALE[period];
    const spxRet = SPX_RETURNS[period];
    const rng = seedRng(seed + period);
    const port: number[] = [];
    const spx: number[] = [];

    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const pN = (rng() - 0.5) * Math.max(Math.abs(yourReturn), 1) * 0.22;
      const sN = (rng() - 0.5) * Math.max(Math.abs(spxRet), 1) * 0.22;
      port.push(i === n - 1 ? yourReturn : yourReturn * t + pN);
      spx.push(i === n - 1 ? spxRet : spxRet * t + sN);
    }

    const allVals = [...port, ...spx];
    const vMin = Math.min(...allVals, 0);
    const vMax = Math.max(...allVals, 0);
    const vSpan = vMax - vMin || 1;
    const padY = 6;
    const xp = (i: number) => (i / (n - 1)) * W;
    const yp = (v: number) => padY + (1 - (v - vMin) / vSpan) * (H - padY * 2);

    const portCoords = port.map((v, i) => [xp(i), yp(v)] as [number, number]);
    const spxCoords = spx.map((v, i) => [xp(i), yp(v)] as [number, number]);

    const portPts = portCoords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const spxPts = spxCoords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

    // Closed path for the filled area
    const linePath = portCoords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const portAreaPath = `${linePath} L${W.toFixed(1)},${H} L0,${H} Z`;
    const lastPortPt = portCoords[portCoords.length - 1];

    return { portPts, spxPts, portAreaPath, lastPortPt, yourReturn, spxRet };
  }, [totalGainPct, period, seed]);

  const outperforming = yourReturn >= spxRet;
  const labels = PERIOD_LABELS[period];

  return (
    <div>
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ display: "block", overflow: "visible" }}
      >
        <defs>
          <linearGradient id="pf-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Horizontal grid lines */}
        {[0.2, 0.5, 0.8].map((f, i) => (
          <line
            key={i}
            x1="0" y1={6 + f * (H - 12)} x2={W} y2={6 + f * (H - 12)}
            stroke="var(--color-border)" strokeWidth="1" vectorEffect="non-scaling-stroke"
          />
        ))}
        {/* Area fill under portfolio line */}
        <path d={portAreaPath} fill="url(#pf-area-grad)" />
        {/* S&P 500 — dashed muted */}
        <polyline
          points={spxPts}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth="1.6"
          strokeDasharray="4 4"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* Portfolio line — solid accent */}
        <polyline
          points={portPts}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* End dot */}
        {lastPortPt && (
          <circle
            cx={lastPortPt[0]}
            cy={lastPortPt[1]}
            r="3.5"
            fill="var(--color-accent)"
            stroke="var(--color-bg)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/* Axis labels */}
      <div className="mono" style={{
        display: "flex", justifyContent: "space-between",
        fontSize: 10, color: "var(--color-muted)", letterSpacing: "0.04em", marginTop: 6,
      }}>
        {labels.map((l, i) => <span key={l + i}>{l}</span>)}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 18, alignItems: "center", marginTop: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "var(--color-text-secondary)" }}>
          <span style={{ width: 14, height: 2.5, borderRadius: 2, background: "var(--color-accent)" }} />
          You{" "}
          <b className="mono" style={{ fontWeight: 700, color: yourReturn >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}>
            {yourReturn >= 0 ? "+" : ""}{fmt(yourReturn, 1)}%
          </b>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "var(--color-text-secondary)" }}>
          <span style={{ width: 14, height: 0, borderTop: "2.5px dashed var(--color-muted)" }} />
          S&P 500{" "}
          <b className="mono" style={{ fontWeight: 700, color: "var(--color-text-secondary)" }}>
            {spxRet >= 0 ? "+" : ""}{fmt(spxRet, 1)}%
          </b>
        </span>
        {Math.abs(yourReturn - spxRet) > 0.05 && (
          <div style={{
            marginLeft: "auto", fontSize: 10.5, fontWeight: 700,
            letterSpacing: "0.08em", textTransform: "uppercase",
            padding: "2px 8px", borderRadius: 4,
            background: outperforming
              ? "color-mix(in oklab, var(--color-bull) 10%, transparent)"
              : "color-mix(in oklab, var(--color-bear) 10%, transparent)",
            color: outperforming ? "var(--color-bull)" : "var(--color-bear)",
          }}>
            {outperforming ? "▲" : "▼"} {fmt(Math.abs(yourReturn - spxRet), 1)}% vs index
          </div>
        )}
      </div>
    </div>
  );
}

function TrendSparkline({ ticker, gainLossPct }: { ticker: string; gainLossPct: number }) {
  const W = 68, H = 22;
  const pts = useMemo(() => {
    const n = 20;
    const rng = seedRng(ticker + "trend");
    return Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1);
      const noise = (rng() - 0.5) * Math.max(Math.abs(gainLossPct), 2) * 0.45;
      return i === n - 1 ? gainLossPct : gainLossPct * t + noise;
    });
  }, [ticker, gainLossPct]);

  const min = Math.min(...pts), max = Math.max(...pts);
  const span = max - min || 1;
  const stroke = gainLossPct >= 0 ? "var(--color-bull)" : "var(--color-bear)";
  const ptStr = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * W;
    const y = 2 + (1 - (v - min) / span) * (H - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <polyline points={ptStr} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function PortfolioPage() {
  const router = useRouter();
  const toast = useToast();
  const {
    holdings, cashBalance, setCashBalance, refresh,
    plaidConnected, plaidInstitutions, syncPlaid,
    error: portfolioError,
  } = usePortfolio();
  const [syncing, setSyncing] = useState(false);
  const [period, setPeriod] = useState<Period>("YTD");
  const institutionName = plaidInstitutions[0]?.name ?? null;

  async function handleSync() {
    setSyncing(true);
    try { await syncPlaid(); } catch { /* surfaced via SWR */ } finally { setSyncing(false); }
  }

  const { quoteMap, error: quotesError } = useQuotes(holdings.map((h) => h.ticker));
  const { setPendingMessage, reset } = useChatStore();

  useEffect(() => {
    if (portfolioError) toast.error("Couldn't load your portfolio. Check your connection and retry.");
  }, [portfolioError, toast]);
  useEffect(() => {
    if (quotesError) toast.error("Couldn't refresh live prices. They'll retry automatically.");
  }, [quotesError, toast]);

  const [hoveredTicker, setHoveredTicker] = useState<string | null>(null);
  const [editingCash, setEditingCash] = useState(false);
  const [cashInput, setCashInput] = useState("");
  const cashInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingCash && cashInputRef.current) cashInputRef.current.focus();
  }, [editingCash]);

  function startEditCash() { setCashInput(cashBalance > 0 ? String(cashBalance) : ""); setEditingCash(true); }
  async function commitCash() {
    const val = parseFloat(cashInput.replace(/,/g, ""));
    if (!isNaN(val) && val >= 0) await setCashBalance(val);
    setEditingCash(false);
  }

  const rows: HoldingRow[] = holdings.map((h) => {
    const quote = quoteMap.get(h.ticker);
    const price = quote?.price ?? 0;
    const mv = price > 0 ? price * h.shares : h.avgCost * h.shares;
    const cost = h.avgCost * h.shares;
    const gainLoss = price > 0 ? mv - cost : 0;
    const gainLossPct = cost > 0 && price > 0 ? (gainLoss / cost) * 100 : 0;
    return { holding: h, quote, mv, pct: 0, gainLoss, gainLossPct };
  });

  const equityValue = rows.reduce((s, r) => s + r.mv, 0);
  const totalAccountValue = equityValue + cashBalance;
  const totalCost = holdings.reduce((s, h) => s + h.avgCost * h.shares, 0);
  const totalGain = equityValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
  rows.forEach((r) => { r.pct = equityValue > 0 ? (r.mv / equityValue) * 100 : 0; });

  const hasQuotes = rows.some((r) => !!r.quote);
  const totalDayChange = rows.reduce((s, r) => {
    if (!r.quote) return s;
    return s + r.quote.change * r.holding.shares;
  }, 0);
  const totalDayChangePct =
    totalAccountValue > 0 ? (totalDayChange / (totalAccountValue - totalDayChange)) * 100 : 0;

  // Donut segments — SVG 172×172, center 86×86, or=84, ir=56
  const GAP = rows.length > 1 ? 3 : 0;
  const sweeps = rows.map((r) => Math.max((r.pct / 100) * 360 - GAP, 0.5));
  const segments = rows.map((r, i) => {
    const start = sweeps.slice(0, i).reduce((s, w) => s + w + GAP, 0);
    return {
      path: arcPath(86, 86, 84, 56, start, start + sweeps[i]),
      color: segColor(i, rows.length),
      ticker: r.holding.ticker,
    };
  });

  const benchmarkSeed = holdings.map((h) => h.ticker).sort().join(",");
  const ytdReturn = totalGainPct * PERIOD_SCALE["YTD"];
  const ytdOutperform = ytdReturn - SPX_RETURNS["YTD"];

  const positionLabel = holdings.length === 0
    ? "NO POSITIONS"
    : `${holdings.length} POSITION${holdings.length !== 1 ? "S" : ""}`;

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden" style={{ background: "var(--color-bg)" }}>

      {/* ── Topbar ── */}
      <PageHeader
        title="Portfolio"
        subtitle={`${positionLabel} · ACCOUNT OVERVIEW`}
        actions={
          <>
            <ChatContextButton context="portfolio" />
            {plaidConnected ? (
              // Synced status pill — the little glowing dot signals a live link;
              // the institution name comes straight from the connected brokerage.
              // Click to re-pull holdings; the dot turns amber while syncing.
              <button
                onClick={handleSync}
                className="tbtn"
                disabled={syncing}
                title={`Refresh holdings from ${institutionName ?? "your brokerage"}`}
                style={{ gap: 7 }}
              >
                <span
                  className="rounded-full"
                  style={{
                    width: 6, height: 6, flexShrink: 0,
                    background: syncing ? "var(--color-warn)" : "var(--color-bull)",
                    boxShadow: `0 0 0 3px color-mix(in oklab, ${syncing ? "var(--color-warn)" : "var(--color-bull)"} 22%, transparent)`,
                  }}
                />
                {syncing ? "Syncing…" : `${institutionName ?? "Brokerage"} · Synced`}
              </button>
            ) : (
              <>
                <button onClick={startEditCash} className="tbtn" title="Update buying power">
                  {editingCash ? (
                    <input
                      ref={cashInputRef}
                      value={cashInput}
                      onChange={(e) => setCashInput(e.target.value)}
                      onBlur={commitCash}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitCash();
                        if (e.key === "Escape") setEditingCash(false);
                      }}
                      className="w-24 bg-transparent border-b border-[var(--color-accent)] focus:outline-none text-right"
                      style={{ fontSize: 11 }}
                      placeholder="0.00"
                    />
                  ) : (
                    <span>{cashBalance > 0 ? `$${fmt(cashBalance, 0)} CASH` : "ADD CASH"}</span>
                  )}
                </button>
                <ConnectBrokerageButton className="tbtn" label="Connect brokerage" onLinked={refresh} />
              </>
            )}
            <button
              className="tbtn on"
              onClick={() => { reset(); setPendingMessage("Give me a full portfolio analysis"); router.push("/chat"); }}
            >
              ASK FINAVA
            </button>
          </>
        }
      />

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto pb-[150px]" style={{ scrollbarGutter: "stable both-edges" }}>
        {holdings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
            {plaidConnected ? (
              <>
                <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                  Connected to {institutionName ?? "your brokerage"}, but no positions were found.
                  <br />Refresh to re-pull, or confirm the account holds investments.
                </p>
                <button onClick={handleSync} className="tbtn on" disabled={syncing}>
                  {syncing ? "SYNCING…" : "REFRESH"}
                </button>
              </>
            ) : (
              <>
                <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                  No holdings yet — connect a brokerage to import them automatically,
                  <br />or add one manually from the sidebar.
                </p>
                <ConnectBrokerageButton className="tbtn on" onLinked={refresh} />
              </>
            )}
          </div>
        ) : (
          <div style={{
            maxWidth: 1100, margin: "0 auto",
            padding: "26px var(--page-gutter) 8px",
            display: "flex", flexDirection: "column", gap: 22,
          }}>

            {/* ── HERO: editorial serif value + benchmark chart ── */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "minmax(300px, 0.9fr) 1.4fr",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-xl)",
              overflow: "hidden",
              boxShadow: "var(--shadow-card)",
            }}>
              {/* Left: gradient background, serif hero number */}
              <div style={{
                padding: "26px 30px",
                display: "flex", flexDirection: "column", justifyContent: "center", gap: 10,
                background: "linear-gradient(118deg, var(--color-accent-light), var(--color-bg) 60%)",
              }}>
                <Eyebrow>Total account value</Eyebrow>
                <div className="serif" style={{
                  fontSize: 54, fontWeight: 900,
                  letterSpacing: "-0.025em", color: "var(--color-text)", lineHeight: 0.95,
                }}>
                  ${fmt0(totalAccountValue)}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
                  {hasQuotes ? (
                    <>
                      <span className="mono" style={{
                        fontSize: 13, fontWeight: 700,
                        color: totalDayChange >= 0 ? "var(--color-bull)" : "var(--color-bear)",
                      }}>
                        {totalDayChange >= 0 ? "▲" : "▼"}{" "}
                        {totalDayChange >= 0 ? "+" : "−"}${fmt0(Math.abs(totalDayChange))}{"  "}
                        {totalDayChangePct >= 0 ? "+" : ""}{fmt(totalDayChangePct, 2)}%
                      </span>
                      <span style={{ fontSize: 11.5, color: "var(--color-muted)" }}>today</span>
                    </>
                  ) : (
                    <span style={{ fontSize: 11.5, color: "var(--color-muted)" }}>
                      {holdings.length} positions · {cashBalance > 0 ? `$${fmt0(cashBalance)} cash` : "no cash"}
                    </span>
                  )}
                </div>
                {/* All-time + Invested */}
                <div style={{
                  display: "flex", gap: 24, marginTop: 12,
                  paddingTop: 14, borderTop: "1px solid var(--color-border)",
                }}>
                  <div>
                    <Eyebrow>All-time</Eyebrow>
                    <div className="mono" style={{
                      fontSize: 15, fontWeight: 700, marginTop: 4,
                      color: totalGain >= 0 ? "var(--color-bull)" : "var(--color-bear)",
                    }}>
                      {totalGain >= 0 ? "+" : "−"}${fmt0(Math.abs(totalGain))} · {totalGain >= 0 ? "+" : ""}{fmt(totalGainPct, 1)}%
                    </div>
                  </div>
                  <div>
                    <Eyebrow>Invested</Eyebrow>
                    <div className="mono" style={{ fontSize: 15, fontWeight: 700, marginTop: 4, color: "var(--color-text)" }}>
                      ${fmt0(totalCost)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: benchmark chart */}
              <div style={{
                padding: "20px 28px 18px",
                borderLeft: "1px solid var(--color-border)",
                background: "var(--color-bg)",
                display: "flex", flexDirection: "column", justifyContent: "center",
              }}>
                <div style={{
                  display: "flex", alignItems: "center",
                  justifyContent: "space-between", marginBottom: 10, gap: 12,
                }}>
                  <Eyebrow>Growth vs S&amp;P 500</Eyebrow>
                  <RangeToggle value={period} onChange={setPeriod} />
                </div>
                <BenchmarkChart totalGainPct={totalGainPct} period={period} seed={benchmarkSeed} />
              </div>
            </div>

            {/* ── KPI strip ── */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
              gap: 28, padding: "0 4px",
            }}>
              <KpiStat
                label="Buying power"
                value={cashBalance > 0 ? `$${fmt0(cashBalance)}` : "—"}
                sub="Available cash"
              />
              <KpiStat
                label="Equity"
                value={`$${fmt0(equityValue)}`}
                sub={`${holdings.length} holding${holdings.length !== 1 ? "s" : ""}`}
              />
              <KpiStat
                label="vs S&P 500 YTD"
                value={`${ytdOutperform >= 0 ? "+" : ""}${fmt(ytdOutperform, 1)}%`}
                sub="Outperformance"
                accent={ytdOutperform >= 0 ? "var(--color-bull)" : "var(--color-bear)"}
              />
              <KpiStat
                label="Day change"
                value={hasQuotes ? `${totalDayChange >= 0 ? "+" : "−"}$${fmt0(Math.abs(totalDayChange))}` : "—"}
                sub={hasQuotes ? `${totalDayChangePct >= 0 ? "+" : ""}${fmt(totalDayChangePct, 2)}% today` : undefined}
                accent={totalDayChange >= 0 ? "var(--color-bull)" : "var(--color-bear)"}
              />
            </div>

            {/* ── Allocation + Holdings ── */}
            <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 18, alignItems: "start" }}>

              {/* Allocation donut */}
              <div style={{
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                padding: 20,
                background: "var(--color-surface)",
              }}>
                <Eyebrow>Allocation</Eyebrow>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginTop: 14 }}>
                  <svg width="172" height="172" viewBox="0 0 172 172" style={{ flexShrink: 0 }}>
                    {segments.map((seg) => (
                      <path
                        key={seg.ticker}
                        d={seg.path}
                        fill={seg.color}
                        opacity={hoveredTicker && hoveredTicker !== seg.ticker ? 0.25 : 1}
                        style={{ transition: "opacity 140ms", cursor: "pointer" }}
                        onMouseEnter={() => setHoveredTicker(seg.ticker)}
                        onMouseLeave={() => setHoveredTicker(null)}
                      />
                    ))}
                    <text x="86" y="79" textAnchor="middle" fontSize="9.5" fill="var(--color-muted)" fontWeight="700" letterSpacing="0.16em">EQUITY</text>
                    <text x="86" y="101" textAnchor="middle" fontSize="21" fontWeight="800" fill="var(--color-text)" fontFamily="var(--font-serif)">
                      {equityValue >= 100_000 ? `$${fmt(equityValue / 1000, 0)}k` : equityValue >= 1_000 ? `$${fmt(equityValue / 1000, 1)}k` : `$${fmt0(equityValue)}`}
                    </text>
                  </svg>
                  {/* Legend */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 14px", width: "100%" }}>
                    {rows.map((r, i) => (
                      <div
                        key={r.holding.ticker}
                        style={{
                          display: "flex", alignItems: "center", gap: 7,
                          opacity: hoveredTicker && hoveredTicker !== r.holding.ticker ? 0.4 : 1,
                          transition: "opacity 140ms",
                        }}
                        onMouseEnter={() => setHoveredTicker(r.holding.ticker)}
                        onMouseLeave={() => setHoveredTicker(null)}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: segColor(i, rows.length), flexShrink: 0 }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-accent)" }}>{r.holding.ticker}</span>
                        <span className="mono" style={{ fontSize: 11, color: "var(--color-muted)", marginLeft: "auto" }}>
                          {fmt(r.pct, 1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Holdings table */}
              <div style={{
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                overflow: "hidden",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 18px",
                  background: "var(--color-surface)",
                  borderBottom: "1px solid var(--color-border)",
                }}>
                  <Eyebrow>Holdings</Eyebrow>
                  <span style={{ fontSize: 11, color: "var(--color-muted)" }}>Click a row to open its stock page</span>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {[
                        { label: "Ticker",    right: false },
                        { label: "Finava",    right: false },
                        { label: "Price",     right: true  },
                        { label: "Day",       right: true  },
                        { label: "Mkt Value", right: true  },
                        { label: "Return",    right: true  },
                        { label: "Trend",     right: true  },
                      ].map(({ label, right }) => (
                        <th
                          key={label}
                          className="mono"
                          style={{
                            textAlign: right ? "right" : "left",
                            fontSize: 9.5, fontWeight: 700,
                            letterSpacing: "0.1em", textTransform: "uppercase",
                            color: "var(--color-muted)",
                            padding: "9px 16px",
                            borderBottom: "1px solid var(--color-border)",
                          }}
                        >{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const score = finavaScore(r.holding.ticker);
                      const dayPct = r.quote?.changePct ?? 0;
                      const isDayPos = dayPct >= 0;
                      const isPos = r.gainLoss >= 0;
                      return (
                        <tr
                          key={r.holding.ticker}
                          className="portfolio-row"
                          style={{ borderBottom: "1px solid var(--color-border)", cursor: "pointer" }}
                          onClick={() => router.push(`/stock/${r.holding.ticker}`)}
                        >
                          {/* Ticker chip + company name */}
                          <td style={{ padding: "10px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{
                                fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
                                color: "var(--color-accent)", background: "var(--color-accent-light)",
                                padding: "3px 7px", borderRadius: 5,
                              }}>{r.holding.ticker}</span>
                              <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                                {r.holding.companyName ?? ""}
                              </span>
                            </div>
                          </td>
                          {/* Finava score pill */}
                          <td style={{ padding: "10px 16px" }}>
                            <ScorePill score={score} />
                          </td>
                          {/* Price */}
                          <td className="mono" style={{
                            textAlign: "right", padding: "10px 16px",
                            fontSize: 12.5, color: "var(--color-text)",
                          }}>
                            {r.quote?.price ? `$${fmt(r.quote.price)}` : "—"}
                          </td>
                          {/* Day % */}
                          <td className="mono" style={{
                            textAlign: "right", padding: "10px 16px",
                            fontSize: 12.5, fontWeight: 600,
                            color: r.quote
                              ? isDayPos ? "var(--color-bull)" : "var(--color-bear)"
                              : "var(--color-muted)",
                          }}>
                            {r.quote ? `${isDayPos ? "+" : ""}${fmt(dayPct, 2)}%` : "—"}
                          </td>
                          {/* Market value */}
                          <td className="mono" style={{
                            textAlign: "right", padding: "10px 16px",
                            fontSize: 12.5, fontWeight: 600, color: "var(--color-text)",
                          }}>
                            ${fmt0(r.mv)}
                          </td>
                          {/* Return */}
                          <td className="mono" style={{
                            textAlign: "right", padding: "10px 16px",
                            fontSize: 12.5, fontWeight: 700,
                            color: isPos ? "var(--color-bull)" : "var(--color-bear)",
                          }}>
                            {isPos ? "+" : ""}{fmt(r.gainLossPct, 1)}%
                          </td>
                          {/* Sparkline */}
                          <td style={{ textAlign: "right", padding: "10px 16px" }}>
                            <div style={{ display: "inline-block" }}>
                              <TrendSparkline ticker={r.holding.ticker} gainLossPct={r.gainLossPct} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}
      </div>

    </div>
  );
}
