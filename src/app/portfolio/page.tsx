"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useQuotes } from "@/hooks/useQuotes";
import { useChatStore } from "@/stores/chatStore";
import { useToast } from "@/hooks/useToast";
import type { Holding, Quote } from "@/types/portfolio";
import TickerSearch from "@/components/stock/TickerSearch";
import ConnectBrokerageButton from "@/components/portfolio/ConnectBrokerageButton";

type Period = "1D" | "1W" | "1M" | "YTD" | "1Y" | "5Y" | "ALL";
const PERIODS: Period[] = ["1D", "1W", "1M", "YTD", "1Y", "5Y", "ALL"];

function segColor(i: number) {
  return `oklch(${0.55 - i * 0.04} 0.135 ${252 - i * 14})`;
}
const SEGMENT_COLORS = Array.from({ length: 10 }, (_, i) => segColor(i));

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtCompact(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${fmt(n / 1_000_000, 1)}M`;
  if (Math.abs(n) >= 1_000) return `${fmt(n / 1_000, 1)}k`;
  return fmt(n, 0);
}

function polarXY(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)] as [number, number];
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

// Seeded deterministic PRNG
function seedRng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
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
  return Math.floor(rng() * 30 + 60); // 60–90
}

function TrendLine({ ticker, gainLossPct }: { ticker: string; gainLossPct: number }) {
  const W = 68, H = 22;
  const closes = useMemo(() => {
    const n = 20;
    const rng = seedRng(ticker + "trend");
    return Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1);
      const trend = gainLossPct * t;
      const noise = (rng() - 0.5) * Math.max(Math.abs(gainLossPct), 2) * 0.45;
      return i === n - 1 ? gainLossPct : trend + noise;
    });
  }, [ticker, gainLossPct]);

  const min = Math.min(...closes), max = Math.max(...closes);
  const span = max - min || 1;
  const xp = (i: number) => (i / (closes.length - 1)) * W;
  const yp = (v: number) => 2 + (1 - (v - min) / span) * (H - 4);
  const stroke = gainLossPct >= 0 ? "var(--color-bull)" : "var(--color-bear)";
  const pts = closes.map((c, i) => `${xp(i).toFixed(1)},${yp(c).toFixed(1)}`).join(" ");

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const SPX_RETURNS: Record<Period, number> = {
  "1D": 0.12, "1W": 0.8, "1M": 2.1, "YTD": 6.8, "1Y": 24.2, "5Y": 80, "ALL": 150,
};
const PERIOD_SCALE: Record<Period, number> = {
  "1D": 0.002, "1W": 0.008, "1M": 0.025, "YTD": 0.08, "1Y": 0.25, "5Y": 0.72, "ALL": 1,
};

function BenchmarkChart({
  totalGainPct,
  period,
  seed,
}: {
  totalGainPct: number;
  period: Period;
  seed: string;
}) {
  const W = 460, H = 108;

  const { portPts, spxPts, yourReturn, spxRet, zeroY } = useMemo(() => {
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
    const xp = (i: number) => (i / (n - 1)) * W;
    const yp = (v: number) => 4 + (1 - (v - vMin) / vSpan) * (H - 8);

    return {
      portPts: port.map((v, i) => `${xp(i).toFixed(1)},${yp(v).toFixed(1)}`).join(" "),
      spxPts: spx.map((v, i) => `${xp(i).toFixed(1)},${yp(v).toFixed(1)}`).join(" "),
      yourReturn,
      spxRet,
      zeroY: yp(0),
    };
  }, [totalGainPct, period, seed]);

  const outperforming = yourReturn >= spxRet;

  return (
    <div>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "block", overflow: "visible", width: "100%", height: "auto" }}
      >
        {/* Zero baseline */}
        <line
          x1="0" y1={zeroY.toFixed(1)} x2={W} y2={zeroY.toFixed(1)}
          stroke="var(--color-border)" strokeWidth="1" strokeDasharray="4 4"
        />
        {/* S&P 500 */}
        <polyline
          points={spxPts}
          fill="none"
          stroke="var(--color-border-strong)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Portfolio */}
        <polyline
          points={portPts}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-5 mt-3">
        <div className="flex items-center gap-2">
          <div style={{ width: 24, height: 2, background: "var(--color-accent)", borderRadius: 1 }} />
          <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--color-text-secondary)" }}>You</span>
          <span
            className="tabular-nums"
            style={{ fontSize: 13, fontWeight: 700, color: yourReturn >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}
          >
            {yourReturn >= 0 ? "+" : ""}{fmt(yourReturn, 1)}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div style={{ width: 24, height: 2, background: "var(--color-border-strong)", borderRadius: 1 }} />
          <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--color-text-secondary)" }}>S&P 500</span>
          <span
            className="tabular-nums"
            style={{ fontSize: 13, fontWeight: 700, color: spxRet >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}
          >
            {spxRet >= 0 ? "+" : ""}{fmt(spxRet, 1)}%
          </span>
        </div>
        {Math.abs(yourReturn - spxRet) > 0.05 && (
          <div
            className="ml-auto"
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "2px 8px",
              borderRadius: 4,
              background: outperforming ? "#ecfdf5" : "#fef2f2",
              color: outperforming ? "var(--color-bull)" : "var(--color-bear)",
            }}
          >
            {outperforming ? "▲" : "▼"} {fmt(Math.abs(yourReturn - spxRet), 1)}% vs index
          </div>
        )}
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  const router = useRouter();
  const toast = useToast();
  const {
    holdings,
    cashBalance,
    setCashBalance,
    refresh,
    plaidConnected,
    plaidInstitutions,
    syncPlaid,
    error: portfolioError,
  } = usePortfolio();
  const [syncing, setSyncing] = useState(false);
  const [period, setPeriod] = useState<Period>("YTD");
  const institutionName = plaidInstitutions[0]?.name ?? null;

  async function handleSync() {
    setSyncing(true);
    try {
      await syncPlaid();
    } catch {
      /* surfaced via SWR */
    } finally {
      setSyncing(false);
    }
  }

  const { quoteMap, error: quotesError } = useQuotes(holdings.map((h) => h.ticker));
  const { setPendingMessage, reset } = useChatStore();

  useEffect(() => {
    if (portfolioError) toast.error("Couldn't load your portfolio. Check your connection and retry.");
  }, [portfolioError, toast]);

  useEffect(() => {
    if (quotesError) toast.error("Couldn't refresh live prices. They'll retry automatically.");
  }, [quotesError, toast]);

  const [askText, setAskText] = useState("");
  const [hoveredTicker, setHoveredTicker] = useState<string | null>(null);
  const [editingCash, setEditingCash] = useState(false);
  const [cashInput, setCashInput] = useState("");
  const cashInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingCash && cashInputRef.current) cashInputRef.current.focus();
  }, [editingCash]);

  function startEditCash() {
    setCashInput(cashBalance > 0 ? String(cashBalance) : "");
    setEditingCash(true);
  }

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

  const totalDayChange = rows.reduce((s, r) => {
    if (!r.quote) return s;
    return s + r.quote.change * r.holding.shares;
  }, 0);
  const totalDayChangePct =
    totalAccountValue > 0 ? (totalDayChange / (totalAccountValue - totalDayChange)) * 100 : 0;

  const GAP = rows.length > 1 ? 3 : 0;
  const sweeps = rows.map((r) => Math.max((r.pct / 100) * 360 - GAP, 0.5));
  const segments = rows.map((r, i) => {
    const start = sweeps.slice(0, i).reduce((sum, s) => sum + s + GAP, 0);
    return {
      path: arcPath(90, 90, 82, 52, start, start + sweeps[i]),
      color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
      ticker: r.holding.ticker,
      pct: r.pct,
    };
  });

  const maxAbsGain = Math.max(...rows.map((r) => Math.abs(r.gainLossPct)), 1);
  const benchmarkSeed = holdings.map((h) => h.ticker).sort().join(",");

  function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!askText.trim()) return;
    reset();
    setPendingMessage(askText.trim());
    router.push("/chat");
  }

  const positionLabel =
    holdings.length === 0
      ? "NO POSITIONS"
      : `${holdings.length} POSITION${holdings.length !== 1 ? "S" : ""}`;

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "var(--color-bg)" }}>
      {/* Topbar */}
      <div
        className="research-root cmdbar flex items-center flex-shrink-0"
        style={{ padding: "11px 22px", gap: 16 }}
      >
        <div className="flex items-baseline" style={{ gap: 10 }}>
          <span
            className="serif"
            style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em", color: "var(--color-text)" }}
          >
            Portfolio
          </span>
          <span
            className="mono"
            style={{ fontSize: 10.5, color: "var(--color-muted)", letterSpacing: "0.04em" }}
          >
            {positionLabel} · ACCOUNT OVERVIEW
          </span>
        </div>
        <div className="flex items-center" style={{ gap: 6, marginLeft: "auto" }}>
          <TickerSearch />
          {plaidConnected ? (
            <>
              <span className="tbtn" style={{ cursor: "default", opacity: 0.85 }} title="Synced from your brokerage">
                {cashBalance > 0 ? `$${fmt(cashBalance, 0)} CASH` : "—"}
              </span>
              <button
                onClick={handleSync}
                className="tbtn"
                disabled={syncing}
                title={`Synced via ${institutionName ?? "your brokerage"}${plaidInstitutions[0]?.lastSyncedAt ? ` · last ${new Date(plaidInstitutions[0].lastSyncedAt).toLocaleString()}` : ""}`}
              >
                <span className="inline-flex items-center" style={{ gap: 5 }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--color-bull)" }} />
                  {syncing ? "SYNCING…" : `${institutionName ? institutionName.toUpperCase() : "SYNCED"} · REFRESH`}
                </span>
              </button>
            </>
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
              <ConnectBrokerageButton className="tbtn" onLinked={refresh} />
            </>
          )}
          <button
            className="tbtn on"
            onClick={() => {
              reset();
              setPendingMessage("Give me a full portfolio analysis");
              router.push("/chat");
            }}
          >
            ASK FINAVA
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
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
          <div className="max-w-[1100px] mx-auto px-8 py-6 flex flex-col gap-6">

            {/* ── HERO: Editorial KPI + Benchmark Chart ── */}
            <div
              className="rounded-[var(--radius-lg)] px-7 py-6"
              style={{
                border: "1px solid var(--color-border)",
                background: "var(--color-bg)",
                boxShadow: "var(--shadow-card)",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1.5fr",
                  gap: 40,
                  alignItems: "start",
                }}
              >
                {/* Left: editorial hero number */}
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <div>
                    <p
                      style={{
                        fontSize: 10.5,
                        fontWeight: 600,
                        letterSpacing: "0.16em",
                        textTransform: "uppercase",
                        color: "var(--color-muted)",
                        marginBottom: 8,
                      }}
                    >
                      Total Account Value
                    </p>
                    <p
                      className="serif tabular-nums"
                      style={{
                        fontSize: 52,
                        fontWeight: 900,
                        lineHeight: 1,
                        letterSpacing: "-0.025em",
                        color: "var(--color-text)",
                      }}
                    >
                      ${fmtCompact(totalAccountValue)}
                    </p>

                    {/* Day change */}
                    <div className="flex items-center gap-2" style={{ marginTop: 10 }}>
                      {rows.some((r) => r.quote) ? (
                        <>
                          <span
                            className="tabular-nums"
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: totalDayChange >= 0 ? "var(--color-bull)" : "var(--color-bear)",
                            }}
                          >
                            {totalDayChange >= 0 ? "▲" : "▼"}{" "}
                            {totalDayChange >= 0 ? "+" : "−"}${fmt(Math.abs(totalDayChange), 0)}
                          </span>
                          <span
                            className="tabular-nums"
                            style={{
                              fontSize: 12.5,
                              fontWeight: 500,
                              color: totalDayChange >= 0 ? "var(--color-bull)" : "var(--color-bear)",
                            }}
                          >
                            {totalDayChangePct >= 0 ? "+" : ""}{fmt(totalDayChangePct, 2)}%
                          </span>
                          <span style={{ fontSize: 11.5, color: "var(--color-muted)" }}>today</span>
                        </>
                      ) : (
                        <span style={{ fontSize: 11.5, color: "var(--color-muted)" }}>
                          {holdings.length} positions · {cashBalance > 0 ? `$${fmtCompact(cashBalance)} cash` : "no cash"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Secondary stats */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: 16,
                      paddingTop: 16,
                      borderTop: "1px solid var(--color-border)",
                    }}
                  >
                    <div>
                      <p
                        style={{
                          fontSize: 9.5,
                          fontWeight: 600,
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                          color: "var(--color-muted)",
                          marginBottom: 5,
                        }}
                      >
                        All-Time
                      </p>
                      <p
                        className="tabular-nums"
                        style={{
                          fontSize: 17,
                          fontWeight: 700,
                          color: totalGain >= 0 ? "var(--color-bull)" : "var(--color-bear)",
                        }}
                      >
                        {totalGain >= 0 ? "+" : "−"}${fmtCompact(Math.abs(totalGain))}
                      </p>
                      <p
                        className="tabular-nums"
                        style={{
                          fontSize: 11.5,
                          fontWeight: 500,
                          color: totalGain >= 0 ? "var(--color-bull)" : "var(--color-bear)",
                          marginTop: 2,
                        }}
                      >
                        {totalGain >= 0 ? "+" : ""}{fmt(totalGainPct, 1)}%
                      </p>
                    </div>
                    <div>
                      <p
                        style={{
                          fontSize: 9.5,
                          fontWeight: 600,
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                          color: "var(--color-muted)",
                          marginBottom: 5,
                        }}
                      >
                        Invested
                      </p>
                      <p
                        className="tabular-nums"
                        style={{ fontSize: 17, fontWeight: 600, color: "var(--color-text)" }}
                      >
                        ${fmtCompact(totalCost)}
                      </p>
                      <p style={{ fontSize: 11.5, color: "var(--color-muted)", marginTop: 2 }}>
                        Cost basis
                      </p>
                    </div>
                    <div
                      className={plaidConnected ? "" : "cursor-pointer"}
                      onClick={plaidConnected ? undefined : startEditCash}
                      title={plaidConnected ? "Synced from your brokerage" : "Click to update"}
                    >
                      <p
                        style={{
                          fontSize: 9.5,
                          fontWeight: 600,
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                          color: "var(--color-muted)",
                          marginBottom: 5,
                        }}
                      >
                        Buying Power
                      </p>
                      <p
                        className="tabular-nums"
                        style={{ fontSize: 17, fontWeight: 600, color: "var(--color-text)" }}
                      >
                        {cashBalance > 0 ? `$${fmtCompact(cashBalance)}` : "—"}
                      </p>
                      <p style={{ fontSize: 11.5, color: "var(--color-muted)", marginTop: 2 }}>
                        {plaidConnected ? "Synced cash" : "Available cash"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right: Benchmark chart */}
                <div>
                  {/* Period tabs */}
                  <div className="flex items-center gap-0.5" style={{ marginBottom: 14 }}>
                    {PERIODS.map((p) => (
                      <button
                        key={p}
                        onClick={() => setPeriod(p)}
                        style={{
                          fontSize: 11,
                          fontWeight: period === p ? 700 : 500,
                          letterSpacing: "0.05em",
                          padding: "3px 8px",
                          borderRadius: 5,
                          border: "none",
                          cursor: "pointer",
                          background: period === p ? "var(--color-accent)" : "transparent",
                          color: period === p ? "#fff" : "var(--color-muted)",
                          transition: "background 140ms, color 140ms",
                        }}
                      >
                        {p}
                      </button>
                    ))}
                    <span
                      className="mono"
                      style={{ marginLeft: "auto", fontSize: 9.5, letterSpacing: "0.1em", color: "var(--color-muted)" }}
                    >
                      GROWTH VS S&P 500
                    </span>
                  </div>
                  <BenchmarkChart totalGainPct={totalGainPct} period={period} seed={benchmarkSeed} />
                </div>
              </div>
            </div>

            {/* ── Charts row ── */}
            <div className="grid grid-cols-2 gap-[18px]">
              {/* Allocation donut */}
              <div
                className="rounded-[var(--radius-lg)] p-5"
                style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)" }}
              >
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--color-muted)",
                    marginBottom: 14,
                  }}
                >
                  Allocation
                </p>
                <div className="flex items-center justify-center gap-5">
                  <svg width="200" height="200" viewBox="0 0 200 200" className="flex-shrink-0">
                    {segments.map((seg) => (
                      <path
                        key={seg.ticker}
                        d={seg.path}
                        fill={seg.color}
                        opacity={hoveredTicker && hoveredTicker !== seg.ticker ? 0.28 : 1}
                        className="transition-opacity duration-150 cursor-pointer"
                        onMouseEnter={() => setHoveredTicker(seg.ticker)}
                        onMouseLeave={() => setHoveredTicker(null)}
                      />
                    ))}
                    <text x="90" y="82" textAnchor="middle" fontSize="10" fill="var(--color-muted)" fontWeight="600" letterSpacing="0.18em">
                      EQUITY
                    </text>
                    <text x="90" y="100" textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--color-text)" fontFamily="var(--font-serif)">
                      ${equityValue >= 1000 ? fmt(equityValue / 1000, 1) + "k" : fmt(equityValue, 0)}
                    </text>
                  </svg>
                  <div className="flex flex-col gap-1 min-w-[100px]">
                    {rows.map((r, i) => (
                      <div
                        key={r.holding.ticker}
                        className="grid items-center gap-2.5 cursor-default rounded-[5px] px-[6px] py-[3px] -mx-[6px] transition-colors duration-100"
                        style={{
                          gridTemplateColumns: "10px 1fr auto",
                          background:
                            hoveredTicker === r.holding.ticker
                              ? "var(--color-accent-light)"
                              : "transparent",
                        }}
                        onMouseEnter={() => setHoveredTicker(r.holding.ticker)}
                        onMouseLeave={() => setHoveredTicker(null)}
                      >
                        <span
                          className="w-2 h-2 rounded-sm flex-shrink-0"
                          style={{ background: SEGMENT_COLORS[i] }}
                        />
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--color-text)" }}>
                          {r.holding.ticker}
                        </span>
                        <span
                          className="tabular-nums"
                          style={{ fontSize: 11.5, color: "var(--color-muted)" }}
                        >
                          {fmt(r.pct, 1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* P&L performance bars */}
              <div
                className="rounded-[var(--radius-lg)] p-5"
                style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)" }}
              >
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--color-muted)",
                    marginBottom: 14,
                  }}
                >
                  Performance — return since avg cost
                </p>
                <div className="flex flex-col gap-[7px]">
                  {rows.map((r) => {
                    const isPos = r.gainLossPct >= 0;
                    const w = Math.max((Math.abs(r.gainLossPct) / maxAbsGain) * 50, 1.5);
                    return (
                      <div
                        key={r.holding.ticker}
                        className="grid items-center gap-[10px]"
                        style={{ gridTemplateColumns: "44px 1fr 1fr 60px" }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                            color: "var(--color-accent)",
                          }}
                        >
                          {r.holding.ticker}
                        </span>
                        <div
                          className="h-[18px] flex justify-end"
                          style={{ borderRight: "1px solid var(--color-border-strong)", paddingRight: 1 }}
                        >
                          {!isPos && (
                            <div
                              className="h-full rounded-l-[3px]"
                              style={{ width: `${w}%`, background: "var(--color-bear)" }}
                            />
                          )}
                        </div>
                        <div className="h-[18px] flex">
                          {isPos && (
                            <div
                              className="h-full rounded-r-[3px]"
                              style={{ width: `${w}%`, background: "var(--color-bull)" }}
                            />
                          )}
                        </div>
                        <span
                          className="tabular-nums"
                          style={{
                            fontSize: 11.5,
                            fontWeight: 600,
                            textAlign: "right",
                            color: isPos ? "var(--color-bull)" : "var(--color-bear)",
                          }}
                        >
                          {isPos ? "+" : ""}{fmt(r.gainLossPct, 1)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Holdings table ── */}
            <div
              className="overflow-hidden"
              style={{ borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)" }}
            >
              <div
                className="flex items-center justify-between px-5 py-3"
                style={{
                  background: "var(--color-surface)",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--color-muted)",
                  }}
                >
                  Holdings
                </p>
                <p style={{ fontSize: 11, color: "var(--color-muted)" }}>
                  Click any row to open its stock page
                </p>
              </div>
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                    {["Ticker", "Company", "Finava", "Shares", "Price", "Day", "Mkt Value", "Return", "Trend"].map(
                      (col) => (
                        <th
                          key={col}
                          style={{
                            textAlign: "left",
                            fontSize: 10,
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.14em",
                            color: "var(--color-muted)",
                            padding: "10px 14px",
                          }}
                        >
                          {col}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isPos = r.gainLoss >= 0;
                    const dayPct = r.quote?.changePct ?? 0;
                    const isDayPos = dayPct >= 0;
                    const score = finavaScore(r.holding.ticker);
                    const scoreColor =
                      score >= 78
                        ? "var(--color-bull)"
                        : score >= 65
                        ? "var(--color-warn)"
                        : "var(--color-bear)";
                    return (
                      <tr
                        key={r.holding.ticker}
                        className="portfolio-row"
                        style={{
                          borderBottom: "1px solid var(--color-border)",
                          cursor: "pointer",
                          transition: "background 100ms",
                        }}
                        onClick={() => router.push(`/stock/${r.holding.ticker}`)}
                      >
                        <td style={{ padding: "11px 14px" }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: "3px 7px",
                              borderRadius: 5,
                              letterSpacing: "0.04em",
                              color: "var(--color-accent)",
                              background: "var(--color-accent-light)",
                            }}
                          >
                            {r.holding.ticker}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "11px 14px",
                            fontSize: 12.5,
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          {r.holding.companyName ?? "—"}
                        </td>
                        <td style={{ padding: "11px 14px" }}>
                          <div className="flex items-center gap-1.5">
                            <div
                              style={{
                                width: 28,
                                height: 4,
                                borderRadius: 2,
                                background: "var(--color-border)",
                                overflow: "hidden",
                                flexShrink: 0,
                              }}
                            >
                              <div
                                style={{
                                  width: `${score}%`,
                                  height: "100%",
                                  background: scoreColor,
                                  borderRadius: 2,
                                }}
                              />
                            </div>
                            <span
                              className="tabular-nums"
                              style={{ fontSize: 11.5, fontWeight: 700, color: scoreColor }}
                            >
                              {score}
                            </span>
                          </div>
                        </td>
                        <td
                          className="tabular-nums"
                          style={{
                            padding: "11px 14px",
                            fontSize: 12.5,
                            color: "var(--color-text)",
                          }}
                        >
                          {fmt(r.holding.shares, r.holding.shares % 1 === 0 ? 0 : 2)}
                        </td>
                        <td
                          className="tabular-nums"
                          style={{
                            padding: "11px 14px",
                            fontSize: 12.5,
                            color: "var(--color-text)",
                          }}
                        >
                          {r.quote?.price ? `$${fmt(r.quote.price)}` : "—"}
                        </td>
                        <td
                          className="tabular-nums"
                          style={{
                            padding: "11px 14px",
                            fontSize: 12.5,
                            fontWeight: 500,
                            color: r.quote
                              ? isDayPos
                                ? "var(--color-bull)"
                                : "var(--color-bear)"
                              : "var(--color-muted)",
                          }}
                        >
                          {r.quote ? `${isDayPos ? "+" : ""}${fmt(dayPct, 2)}%` : "—"}
                        </td>
                        <td
                          className="tabular-nums"
                          style={{
                            padding: "11px 14px",
                            fontSize: 12.5,
                            fontWeight: 500,
                            color: "var(--color-text)",
                          }}
                        >
                          ${fmt(r.mv, 0)}
                        </td>
                        <td
                          className="tabular-nums"
                          style={{
                            padding: "11px 14px",
                            fontSize: 12.5,
                            fontWeight: 600,
                            color: isPos ? "var(--color-bull)" : "var(--color-bear)",
                          }}
                        >
                          {isPos ? "+" : ""}{fmt(r.gainLossPct, 1)}%
                        </td>
                        <td style={{ padding: "11px 14px" }}>
                          <TrendLine ticker={r.holding.ticker} gainLossPct={r.gainLossPct} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Ask bar */}
      <div
        className="flex-shrink-0 px-6 pb-6 pt-5"
        style={{ background: "linear-gradient(to bottom, transparent 0%, var(--color-bg) 28%)" }}
      >
        <form onSubmit={handleAsk} className="max-w-[720px] mx-auto">
          <div
            className="relative flex transition-all duration-200"
            style={{
              borderRadius: 16,
              border: "1px solid var(--color-border)",
              background: "var(--color-bg)",
              boxShadow: "0 1px 6px rgba(15,23,42,0.04)",
            }}
          >
            <input
              type="text"
              value={askText}
              onChange={(e) => setAskText(e.target.value)}
              placeholder="Ask AI about this portfolio…"
              className="flex-1 bg-transparent text-[14px] focus:outline-none py-3.5 pl-4 pr-11 leading-relaxed"
              style={{ color: "var(--color-text)" }}
            />
            <button
              type="submit"
              className="absolute right-3 bottom-3 w-7 h-7 rounded-full flex items-center justify-center bg-[var(--color-accent)] text-white hover:opacity-80 transition-opacity duration-150 shadow-sm"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
          <p
            className="text-center mt-2 tracking-wide"
            style={{ fontSize: 10, color: "var(--color-muted)" }}
          >
            Sends to Chat with your portfolio context
          </p>
        </form>
      </div>
    </div>
  );
}
