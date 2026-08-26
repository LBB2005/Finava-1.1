"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useQuotes } from "@/hooks/useQuotes";
import { useFactorUniverse } from "@/hooks/useFactorUniverse";
import { useChatStore } from "@/stores/chatStore";
import { buildPortfolioSnapshot } from "@/lib/pageContext";
import { useToast } from "@/hooks/useToast";
import type { Holding, Quote } from "@/types/portfolio";
import ConnectBrokerageButton from "@/components/portfolio/ConnectBrokerageButton";
import ChatContextButton from "@/components/chat/ChatContextButton";
import PageHeader from "@/components/layout/PageHeader";
import Sparkline from "@/components/ui/Sparkline";
import RangeToggle from "@/components/ui/RangeToggle";
import ScorePill from "@/components/ui/ScorePill";
import { scoreForTicker } from "@/lib/compositeScore";
import { seedRng } from "@/lib/portfolioMock";

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

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="eyebrow-label" style={{ color: "var(--color-muted)", margin: 0 }}>
      {children as string}
    </p>
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
        fontSize: "var(--text-stat)", fontWeight: 800, letterSpacing: "-0.015em",
        color: accent ?? "var(--color-text)", lineHeight: 1,
      }}>{value}</span>
      {sub && <span style={{ fontSize: "var(--text-meta)", color: "var(--color-muted)" }}>{sub}</span>}
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
  const W = 900, H = 200;

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
            stroke="var(--color-border)" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke"
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
          strokeDasharray="3 4"
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
        fontSize: "var(--text-micro)", color: "var(--color-muted)", letterSpacing: "0.04em", marginTop: 6,
      }}>
        {labels.map((l, i) => <span key={l + i}>{l}</span>)}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 18, alignItems: "center", marginTop: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: "var(--text-meta)", color: "var(--color-text-secondary)" }}>
          <span style={{ width: 14, height: 2.5, borderRadius: 2, background: "var(--color-accent)" }} />
          You{" "}
          <b className="mono" style={{ fontWeight: 700, color: yourReturn >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}>
            {yourReturn >= 0 ? "+" : ""}{fmt(yourReturn, 1)}%
          </b>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: "var(--text-meta)", color: "var(--color-text-secondary)" }}>
          <span style={{ width: 14, height: 0, borderTop: "2.5px dashed var(--color-muted)" }} />
          S&P 500{" "}
          <b className="mono" style={{ fontWeight: 700, color: "var(--color-text-secondary)" }}>
            {spxRet >= 0 ? "+" : ""}{fmt(spxRet, 1)}%
          </b>
        </span>
        {Math.abs(yourReturn - spxRet) > 0.05 && (
          <div style={{
            marginLeft: "auto", fontSize: "var(--text-micro)", fontWeight: 700,
            letterSpacing: "0.08em", textTransform: "uppercase",
            padding: "2px 8px", borderRadius: "var(--radius-xs)",
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

// Seeded synthetic trend series for the holdings-table sparkline.
function trendSeries(ticker: string, gainLossPct: number): number[] {
  const n = 20;
  const rng = seedRng(ticker + "trend");
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const noise = (rng() - 0.5) * Math.max(Math.abs(gainLossPct), 2) * 0.45;
    return i === n - 1 ? gainLossPct : gainLossPct * t + noise;
  });
}

// Quiet shimmer block for in-cell and layout placeholders while data loads.
function Shimmer({ w, h = 12, style }: { w: number | string; h?: number; style?: React.CSSProperties }) {
  return (
    <span
      className="skeleton"
      style={{
        display: "inline-block", width: w, height: h,
        borderRadius: "var(--radius-xs)", ...style,
      }}
    />
  );
}

// Full-page placeholder mirroring the hero + KPI + table layout, shown while
// holdings load so the "no holdings" empty state can't flash first.
function PortfolioSkeleton() {
  return (
    <div style={{
      maxWidth: 1100, margin: "0 auto", padding: "26px var(--page-gutter) 8px",
      display: "flex", flexDirection: "column", gap: 22,
    }}>
      {/* Open hero shimmer — eyebrow, value, chart region (no card chrome) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Shimmer w={130} h={9} />
        <Shimmer w={240} h={40} />
        <Shimmer w={160} h={12} />
        <div className="skeleton" style={{ height: 160, borderRadius: "var(--radius-md)", marginTop: 8 }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 28, padding: "0 4px" }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Shimmer w="55%" h={9} />
            <Shimmer w="75%" h={22} />
          </div>
        ))}
      </div>
      <div style={{
        border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)",
        overflow: "hidden", padding: "12px 18px",
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        {[88, 70, 80, 64, 76].map((w, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Shimmer w={52} h={18} />
            <Shimmer w={`${w}%`} h={12} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  const router = useRouter();
  const toast = useToast();
  const {
    holdings, cashBalance, setCashBalance, refresh,
    plaidConnected, plaidInstitutions, syncPlaid,
    error: portfolioError, isLoading: holdingsLoading,
  } = usePortfolio();
  const [syncing, setSyncing] = useState(false);
  const [period, setPeriod] = useState<Period>("YTD");
  const institutionName = plaidInstitutions[0]?.name ?? null;

  async function handleSync() {
    setSyncing(true);
    try { await syncPlaid(); } catch { /* surfaced via SWR */ } finally { setSyncing(false); }
  }

  const { quoteMap, error: quotesError, isLoading: quotesLoading } = useQuotes(holdings.map((h) => h.ticker));
  // Real scored universe (S&P 500, live factors). A holding outside it has no
  // score and renders "—" — we never fabricate one.
  const { universe } = useFactorUniverse();
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

  // Publish a compact portfolio snapshot as app-wide page context so a chat sent
  // here ("how am I doing?", "which of my holdings is riskiest?") is scoped to
  // these positions. Full holdings detail still rides in portfolioContext. Built
  // inline (cheap) rather than memoized — `rows` is mutated above, which the
  // React Compiler won't let a useMemo depend on; the effect keys off the string.
  const portfolioSnapshot = buildPortfolioSnapshot({
    totalValue: totalAccountValue,
    totalGainPct,
    positions: holdings.length,
    cash: cashBalance,
    top: [...rows]
      .sort((a, b) => b.mv - a.mv)
      .map((r) => ({ ticker: r.holding.ticker, weightPct: r.pct, gainLossPct: r.gainLossPct })),
  });
  useEffect(() => {
    const setActivePageContext = useChatStore.getState().setActivePageContext;
    setActivePageContext({ kind: "portfolio", label: "Portfolio", snapshot: portfolioSnapshot });
    return () => setActivePageContext(null);
  }, [portfolioSnapshot]);

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
                      className="w-24 bg-transparent border-b border-[var(--color-accent)] focus:outline-none text-right text-[length:var(--text-lg)] sm:text-[length:var(--text-meta)]"
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
            <ChatContextButton context="portfolio" />
          </>
        }
      />

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarGutter: "stable both-edges", paddingBottom: "var(--content-pad-bottom)" }}>
        {holdingsLoading && holdings.length === 0 ? (
          <PortfolioSkeleton />
        ) : holdings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
            {plaidConnected ? (
              <>
                <p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>
                  Connected to {institutionName ?? "your brokerage"}, but no positions were found.
                  <br />Refresh to re-pull, or confirm the account holds investments.
                </p>
                <button onClick={handleSync} className="btn btn-primary" disabled={syncing}>
                  {syncing ? "Syncing…" : "Refresh"}
                </button>
              </>
            ) : (
              <>
                <p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>
                  No holdings yet — connect a brokerage to import them automatically,
                  <br />or add one manually from the sidebar.
                </p>
                <ConnectBrokerageButton className="btn btn-primary" label="Connect brokerage" onLinked={refresh} />
              </>
            )}
          </div>
        ) : (
          <div style={{
            maxWidth: 1100, margin: "0 auto",
            padding: "26px var(--page-gutter) 8px",
            display: "flex", flexDirection: "column", gap: 22,
          }}>

            {/* ── HERO: open chart canvas — value sits on the page, chart beneath ── */}
            <div className="portfolio-hero-open">
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <Eyebrow>Total account value</Eyebrow>
                  <div className="serif" style={{
                    fontSize: "var(--text-hero)", fontWeight: 900,
                    letterSpacing: "-0.025em", color: "var(--color-text)", lineHeight: 0.95,
                  }}>
                    ${fmt0(totalAccountValue)}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {hasQuotes ? (
                      <>
                        <span className="mono" style={{
                          fontSize: "var(--text-sm)", fontWeight: 700,
                          color: totalDayChange >= 0 ? "var(--color-bull)" : "var(--color-bear)",
                        }}>
                          {totalDayChange >= 0 ? "▲" : "▼"}{" "}
                          {totalDayChange >= 0 ? "+" : "−"}${fmt0(Math.abs(totalDayChange))}{"  "}
                          {totalDayChangePct >= 0 ? "+" : ""}{fmt(totalDayChangePct, 2)}%
                        </span>
                        <span style={{ fontSize: "var(--text-meta)", color: "var(--color-muted)" }}>today</span>
                      </>
                    ) : (
                      <span style={{ fontSize: "var(--text-meta)", color: "var(--color-muted)" }}>
                        {holdings.length} positions · {cashBalance > 0 ? `$${fmt0(cashBalance)} cash` : "no cash"}
                      </span>
                    )}
                  </div>
                </div>
                <RangeToggle options={PERIODS} value={period} onChange={setPeriod} />
              </div>
              <BenchmarkChart totalGainPct={totalGainPct} period={period} seed={benchmarkSeed} />
            </div>

            {/* ── KPI strip ── */}
            <div className="portfolio-kpis" style={{ gap: 28, padding: "0 4px" }}>
              <KpiStat
                label="All-time"
                value={`${totalGain >= 0 ? "+" : "−"}$${fmt0(Math.abs(totalGain))}`}
                sub={`${totalGainPct >= 0 ? "+" : ""}${fmt(totalGainPct, 1)}% overall`}
                accent={totalGain >= 0 ? "var(--color-bull)" : "var(--color-bear)"}
              />
              <KpiStat label="Invested" value={`$${fmt0(totalCost)}`} sub="Cost basis" />
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
            <div className="portfolio-alloc-grid" style={{ gap: 18, alignItems: "start" }}>

              {/* Allocation donut */}
              <div style={{
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                overflow: "hidden",
              }}>
                <div style={{
                  padding: "12px 18px",
                  background: "var(--color-surface)",
                  borderBottom: "1px solid var(--color-border)",
                }}>
                  <Eyebrow>Allocation</Eyebrow>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: 20 }}>
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
                        onClick={() => setHoveredTicker((prev) => (prev === seg.ticker ? null : seg.ticker))}
                      />
                    ))}
                    <text x="86" y="79" textAnchor="middle" style={{ fontSize: "var(--text-micro)" }} fill="var(--color-muted)" fontWeight="700" letterSpacing="0.16em">EQUITY</text>
                    <text x="86" y="101" textAnchor="middle" style={{ fontSize: "var(--text-display)" }} fontWeight="800" fill="var(--color-text)" fontFamily="var(--font-serif)">
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
                          transition: "opacity 140ms", cursor: "pointer",
                        }}
                        onMouseEnter={() => setHoveredTicker(r.holding.ticker)}
                        onMouseLeave={() => setHoveredTicker(null)}
                        onClick={() => setHoveredTicker((prev) => (prev === r.holding.ticker ? null : r.holding.ticker))}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: segColor(i, rows.length), flexShrink: 0 }} />
                        <span style={{ fontSize: "var(--text-meta)", fontWeight: 700, color: "var(--color-accent)" }}>{r.holding.ticker}</span>
                        <span className="mono" style={{ fontSize: "var(--text-meta)", color: "var(--color-muted)", marginLeft: "auto" }}>
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
                  <span style={{ fontSize: "var(--text-meta)", color: "var(--color-muted)" }}>Click a row to open its stock page</span>
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
                            fontSize: "var(--text-micro)", fontWeight: 700,
                            letterSpacing: "0.1em", textTransform: "uppercase",
                            color: "var(--color-muted)",
                            padding: "8px 12px",
                            borderBottom: "1px solid var(--color-border)",
                          }}
                        >{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, rowIdx) => {
                      const score = scoreForTicker(universe, r.holding.ticker);
                      const dayPct = r.quote?.changePct ?? 0;
                      const isDayPos = dayPct >= 0;
                      const isPos = r.gainLoss >= 0;
                      return (
                        <tr
                          key={r.holding.ticker}
                          className="portfolio-row std-focus"
                          style={{
                            borderBottom: rowIdx < rows.length - 1 ? "1px solid var(--color-border)" : "none",
                            cursor: "pointer",
                          }}
                          onClick={() => router.push(`/stock/${r.holding.ticker}`)}
                        >
                          {/* Ticker chip + company name */}
                          <td style={{ padding: "8px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{
                                fontSize: "var(--text-meta)", fontWeight: 700, letterSpacing: "0.04em",
                                color: "var(--color-accent)", background: "var(--color-accent-light)",
                                padding: "3px 7px", borderRadius: "var(--radius-xs)",
                              }}>{r.holding.ticker}</span>
                              <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
                                {r.holding.companyName ?? ""}
                              </span>
                            </div>
                          </td>
                          {/* Finava score pill — "—" until the factor universe covers this ticker */}
                          <td style={{ padding: "8px 12px" }}>
                            {score != null ? (
                              <ScorePill score={score} />
                            ) : (
                              <span className="mono" style={{ fontSize: "var(--text-meta)", color: "var(--color-muted)" }}>—</span>
                            )}
                          </td>
                          {/* Price */}
                          <td className="mono" style={{
                            textAlign: "right", padding: "8px 12px",
                            fontSize: "var(--text-sm)", color: "var(--color-text)",
                          }}>
                            {r.quote?.price ? `$${fmt(r.quote.price)}` : quotesLoading ? <Shimmer w={48} /> : "—"}
                          </td>
                          {/* Day % */}
                          <td className="mono" style={{
                            textAlign: "right", padding: "8px 12px",
                            fontSize: "var(--text-sm)", fontWeight: 600,
                            color: r.quote
                              ? isDayPos ? "var(--color-bull)" : "var(--color-bear)"
                              : "var(--color-muted)",
                          }}>
                            {r.quote ? `${isDayPos ? "+" : ""}${fmt(dayPct, 2)}%` : quotesLoading ? <Shimmer w={40} /> : "—"}
                          </td>
                          {/* Market value */}
                          <td className="mono" style={{
                            textAlign: "right", padding: "8px 12px",
                            fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-text)",
                          }}>
                            ${fmt0(r.mv)}
                          </td>
                          {/* Return */}
                          <td className="mono" style={{
                            textAlign: "right", padding: "8px 12px",
                            fontSize: "var(--text-sm)", fontWeight: 700,
                            color: isPos ? "var(--color-bull)" : "var(--color-bear)",
                          }}>
                            {isPos ? "+" : ""}{fmt(r.gainLossPct, 1)}%
                          </td>
                          {/* Sparkline */}
                          <td style={{ textAlign: "right", padding: "8px 12px" }}>
                            <div style={{ display: "inline-block" }}>
                              <Sparkline
                                data={trendSeries(r.holding.ticker, r.gainLossPct)}
                                width={68}
                                height={22}
                                stroke={r.gainLossPct >= 0 ? "var(--color-bull)" : "var(--color-bear)"}
                              />
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
