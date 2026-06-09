"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useQuotes } from "@/hooks/useQuotes";
import { useChatStore } from "@/stores/chatStore";
import type { Holding, Quote } from "@/types/portfolio";
import TickerSearch from "@/components/stock/TickerSearch";
import ConnectBrokerageButton from "@/components/portfolio/ConnectBrokerageButton";

function segColor(i: number) {
  return `oklch(${0.55 - i * 0.04} 0.135 ${252 - i * 14})`;
}
// Keep a fallback array for the legend swatch
const SEGMENT_COLORS = Array.from({ length: 10 }, (_, i) => segColor(i));

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

// SVG donut chart helpers
function polarXY(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)] as [number, number];
}

function arcPath(cx: number, cy: number, or: number, ir: number, a1: number, a2: number) {
  const span = a2 - a1;
  // For very small segments don't try to render
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

export default function PortfolioPage() {
  const router = useRouter();
  const { holdings, cashBalance, setCashBalance, refresh, plaidConnected, plaidInstitutions, syncPlaid } = usePortfolio();
  const [syncing, setSyncing] = useState(false);
  const institutionName = plaidInstitutions[0]?.name ?? null;

  async function handleSync() {
    setSyncing(true);
    try {
      await syncPlaid();
    } catch {
      /* surfaced via SWR; keep the topbar quiet */
    } finally {
      setSyncing(false);
    }
  }
  const { quoteMap } = useQuotes(holdings.map((h) => h.ticker));
  const { setPendingMessage, reset } = useChatStore();
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

  // Build donut segments — 3° gap between each slice for clean separation
  const GAP = rows.length > 1 ? 3 : 0;
  const sweeps = rows.map((r) => Math.max((r.pct / 100) * 360 - GAP, 0.5));
  const segments = rows.map((r, i) => {
    // Start angle is the sum of all prior sweeps + gaps (no render-time mutation).
    const start = sweeps.slice(0, i).reduce((sum, s) => sum + s + GAP, 0);
    return {
      path: arcPath(90, 90, 82, 52, start, start + sweeps[i]),
      color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
      ticker: r.holding.ticker,
      pct: r.pct,
    };
  });

  const maxAbsGain = Math.max(...rows.map((r) => Math.abs(r.gainLossPct)), 1);

  function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!askText.trim()) return;
    reset();
    setPendingMessage(askText.trim());
    router.push("/chat");
  }

  const now = new Date();
  const timeLabel = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const dateLabel = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  const positionLabel = holdings.length === 0
    ? "NO POSITIONS"
    : `${holdings.length} POSITION${holdings.length !== 1 ? "S" : ""}`;

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "var(--color-bg)" }}>
      {/* Topbar */}
      <div className="research-root cmdbar flex items-center flex-shrink-0" style={{ padding: "11px 22px", gap: 16 }}>
        <div className="flex items-baseline" style={{ gap: 10 }}>
          <span className="serif" style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em", color: "var(--color-text)" }}>
            Portfolio
          </span>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--color-muted)", letterSpacing: "0.04em" }}>
            {positionLabel} · ACCOUNT OVERVIEW
          </span>
        </div>
        <div className="flex items-center" style={{ gap: 6, marginLeft: "auto" }}>
          <TickerSearch />
          {plaidConnected ? (
            <>
              {/* Synced book — cash is read-only, refresh re-pulls from the brokerage. */}
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
              <button
                onClick={startEditCash}
                className="tbtn"
                title="Update buying power"
              >
                {editingCash ? (
                  <input
                    ref={cashInputRef}
                    value={cashInput}
                    onChange={(e) => setCashInput(e.target.value)}
                    onBlur={commitCash}
                    onKeyDown={(e) => { if (e.key === "Enter") commitCash(); if (e.key === "Escape") setEditingCash(false); }}
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
            onClick={() => { reset(); setPendingMessage("Give me a full portfolio analysis"); router.push("/chat"); }}
          >
            ASK AI
          </button>
        </div>
      </div>

      {/* KPI strip */}
      {holdings.length > 0 && (
        <div
          className="flex-shrink-0 px-8 py-5"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <div
            className="max-w-[1100px] mx-auto rounded-[var(--radius-lg)] px-6 py-5"
            style={{
              border: "1px solid var(--color-border)",
              background: "var(--color-bg)",
              boxShadow: "var(--shadow-card)",
              display: "grid",
              gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1.2fr",
              gap: 28,
              alignItems: "center",
            }}
          >
            {/* Total Account Value */}
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)] mb-1.5">
                Total Account Value
              </p>
              <p
                className="text-[30px] font-bold leading-[1.05] tabular-nums text-[var(--color-text)]"
                style={{ fontFamily: "var(--font-serif)", letterSpacing: "-0.015em" }}
              >
                ${totalAccountValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </p>
              <p className="text-[12px] mt-1 tabular-nums text-[var(--color-muted)]">
                {holdings.length} positions · {cashBalance > 0 ? `$${fmt(cashBalance, 0)} cash` : "no cash"}
              </p>
            </div>

            {/* All-Time */}
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)] mb-1.5">All-Time</p>
              <p
                className="text-[19px] font-semibold tabular-nums"
                style={{ color: totalGain >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}
              >
                {totalGain >= 0 ? "+" : ""}${fmt(Math.abs(totalGain), 0)}
              </p>
              <p
                className="text-[12px] mt-1 font-medium tabular-nums"
                style={{ color: totalGain >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}
              >
                {totalGain >= 0 ? "+" : ""}{fmt(totalGainPct, 2)}%
              </p>
            </div>

            {/* Cost Basis */}
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)] mb-1.5">Cost Basis</p>
              <p className="text-[19px] font-semibold tabular-nums text-[var(--color-text)]">
                ${fmt(totalCost, 0)}
              </p>
              <p className="text-[12px] mt-1 text-[var(--color-muted)]">Invested</p>
            </div>

            {/* Buying power — editable only when not synced from a brokerage */}
            <div
              className={plaidConnected ? "" : "cursor-pointer"}
              onClick={plaidConnected ? undefined : startEditCash}
              title={plaidConnected ? "Synced from your brokerage" : "Click to update"}
            >
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)] mb-1.5">Buying Power</p>
              <p className="text-[19px] font-semibold tabular-nums text-[var(--color-text)]">
                {cashBalance > 0 ? `$${fmt(cashBalance, 0)}` : "—"}
              </p>
              <p className="text-[12px] mt-1 text-[var(--color-muted)]">{plaidConnected ? "Synced cash" : "Available cash"}</p>
            </div>

            {/* vs S&P 500 */}
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)] mb-1.5">
                vs S&P 500 YTD
              </p>
              <div className="flex items-baseline gap-1.5">
                <span
                  className="text-[19px] font-semibold tabular-nums"
                  style={{ color: totalGainPct >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}
                >
                  {totalGainPct >= 0 ? "+" : ""}{fmt(totalGainPct, 1)}%
                </span>
                <span className="text-[11.5px] text-[var(--color-muted)]">you</span>
              </div>
              {/* Mini compare bars */}
              <div className="flex flex-col gap-[3px] mt-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9.5px] font-bold w-4" style={{ color: "var(--color-accent)" }}>YOU</span>
                  <div
                    className="h-[5px] rounded-full"
                    style={{ width: `${Math.min(Math.abs(totalGainPct) / 20 * 65, 65)}%`, background: "var(--color-accent)" }}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9.5px] font-bold w-4 text-[var(--color-muted)]">SPX</span>
                  <div
                    className="h-[5px] rounded-full"
                    style={{ width: "40%", background: "var(--color-border-strong)" }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {holdings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
            {plaidConnected ? (
              <>
                <p className="text-[var(--color-muted)] text-sm">
                  Connected to {institutionName ?? "your brokerage"}, but no positions were found.
                  <br />Refresh to re-pull, or confirm the account holds investments.
                </p>
                <button onClick={handleSync} className="tbtn on" disabled={syncing}>
                  {syncing ? "SYNCING…" : "REFRESH"}
                </button>
              </>
            ) : (
              <>
                <p className="text-[var(--color-muted)] text-sm">
                  No holdings yet — connect a brokerage to import them automatically,
                  <br />or add one manually from the sidebar.
                </p>
                <ConnectBrokerageButton className="tbtn on" onLinked={refresh} />
              </>
            )}
          </div>
        ) : (
          <div className="max-w-[1100px] mx-auto px-8 py-6 flex flex-col gap-6">
            {/* Charts row */}
            <div className="grid grid-cols-2 gap-[18px]">
              {/* Allocation donut */}
              <div
                className="rounded-[var(--radius-lg)] p-5"
                style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)" }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)] mb-[14px]">Allocation</p>
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
                    <text x="90" y="82" textAnchor="middle" fontSize="10" fill="var(--color-muted)" fontWeight="600" letterSpacing="0.18em">EQUITY</text>
                    <text x="90" y="100" textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--color-text)" fontFamily="var(--font-serif)">
                      ${equityValue >= 1000 ? fmt(equityValue / 1000, 1) + "k" : fmt(equityValue, 0)}
                    </text>
                  </svg>
                  {/* Legend */}
                  <div className="flex flex-col gap-1 min-w-[100px]">
                    {rows.map((r, i) => (
                      <div
                        key={r.holding.ticker}
                        className="grid items-center gap-2.5 cursor-default rounded-[5px] px-[6px] py-[3px] -mx-[6px] transition-colors duration-100"
                        style={{
                          gridTemplateColumns: "10px 1fr auto",
                          background: hoveredTicker === r.holding.ticker ? "var(--color-accent-light)" : "transparent",
                        }}
                        onMouseEnter={() => setHoveredTicker(r.holding.ticker)}
                        onMouseLeave={() => setHoveredTicker(null)}
                      >
                        <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: SEGMENT_COLORS[i] }} />
                        <span className="text-[11.5px] font-semibold text-[var(--color-text)]">{r.holding.ticker}</span>
                        <span className="text-[11.5px] text-[var(--color-muted)] tabular-nums">{fmt(r.pct, 1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* P&L performance bars — divergent chart */}
              <div
                className="rounded-[var(--radius-lg)] p-5"
                style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)" }}
              >
                <div className="flex items-center justify-between mb-[14px]">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    Performance — return since avg cost
                  </p>
                </div>
                <div className="flex flex-col gap-[7px]">
                  {rows.map((r) => {
                    const isPos = r.gainLossPct >= 0;
                    const w = Math.max((Math.abs(r.gainLossPct) / maxAbsGain) * 50, 1.5);
                    return (
                      <div key={r.holding.ticker} className="grid items-center gap-[10px]"
                        style={{ gridTemplateColumns: "44px 1fr 1fr 60px" }}>
                        <span className="text-[11px] font-bold tracking-[0.04em]" style={{ color: "var(--color-accent)" }}>{r.holding.ticker}</span>
                        {/* Negative side */}
                        <div className="h-[18px] flex justify-end" style={{ borderRight: "1px solid var(--color-border-strong)", paddingRight: 1 }}>
                          {!isPos && (
                            <div
                              className="h-full rounded-l-[3px]"
                              style={{ width: `${w}%`, background: "var(--color-bear)" }}
                            />
                          )}
                        </div>
                        {/* Positive side */}
                        <div className="h-[18px] flex">
                          {isPos && (
                            <div
                              className="h-full rounded-r-[3px]"
                              style={{ width: `${w}%`, background: "var(--color-bull)" }}
                            />
                          )}
                        </div>
                        <span
                          className="text-[11.5px] font-semibold text-right tabular-nums"
                          style={{ color: isPos ? "var(--color-bull)" : "var(--color-bear)" }}
                        >
                          {isPos ? "+" : ""}{fmt(r.gainLossPct, 1)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Holdings table */}
            <div
              className="overflow-hidden"
              style={{ borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)" }}
            >
              <div
                className="flex items-center justify-between px-5 py-3"
                style={{ background: "var(--color-surface)", borderBottom: "1px solid var(--color-border)" }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">Holdings</p>
                <p className="text-[11px] text-[var(--color-muted)]">Click any row to open its stock page</p>
              </div>
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                    {["Ticker", "Company", "Shares", "Price", "Day", "Mkt Value", "Gain/Loss", "P&L %", "Alloc"].map((h) => (
                      <th key={h} className="text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)] px-4 py-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isPos = r.gainLoss >= 0;
                    const dayPct = r.quote?.changePct ?? 0;
                    const isDayPos = dayPct >= 0;
                    return (
                      <tr
                        key={r.holding.ticker}
                        className="portfolio-row"
                        style={{ borderBottom: "1px solid var(--color-border)", cursor: "pointer", transition: "background 100ms" }}
                        onClick={() => router.push(`/stock/${r.holding.ticker}`)}
                      >
                        <td className="px-4 py-3">
                          <span
                            className="text-[11px] font-bold px-[7px] py-[3px] rounded-[5px] tracking-[0.04em]"
                            style={{ color: "var(--color-accent)", background: "var(--color-accent-light)" }}
                          >
                            {r.holding.ticker}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[12.5px] text-[var(--color-text-secondary)]">{r.holding.companyName ?? "—"}</td>
                        <td className="px-4 py-3 text-[12.5px] text-[var(--color-text)] tabular-nums">{fmt(r.holding.shares, r.holding.shares % 1 === 0 ? 0 : 2)}</td>
                        <td className="px-4 py-3 text-[12.5px] text-[var(--color-text)] tabular-nums">{r.quote?.price ? `$${fmt(r.quote.price)}` : "—"}</td>
                        <td className="px-4 py-3 text-[12.5px] font-medium tabular-nums"
                          style={{ color: r.quote ? (isDayPos ? "var(--color-bull)" : "var(--color-bear)") : "var(--color-muted)" }}>
                          {r.quote ? `${isDayPos ? "+" : ""}${fmt(dayPct, 2)}%` : "—"}
                        </td>
                        <td className="px-4 py-3 text-[12.5px] font-medium text-[var(--color-text)] tabular-nums">${fmt(r.mv, 0)}</td>
                        <td className="px-4 py-3 text-[12.5px] font-medium tabular-nums"
                          style={{ color: isPos ? "var(--color-bull)" : "var(--color-bear)" }}>
                          {isPos ? "+" : ""}${fmt(Math.abs(r.gainLoss), 0)}
                        </td>
                        <td className="px-4 py-3 text-[12.5px] font-semibold tabular-nums"
                          style={{ color: isPos ? "var(--color-bull)" : "var(--color-bear)" }}>
                          {isPos ? "+" : ""}{fmt(r.gainLossPct, 1)}%
                        </td>
                        <td className="px-4 py-3 text-[12.5px] text-[var(--color-muted)] tabular-nums">{fmt(r.pct, 1)}%</td>
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
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
          <p className="text-center text-[10px] text-[var(--color-muted)] mt-2 tracking-wide">
            Sends to Chat with your portfolio context
          </p>
        </form>
      </div>
    </div>
  );
}
