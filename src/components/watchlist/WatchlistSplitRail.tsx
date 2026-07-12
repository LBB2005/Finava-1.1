"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWatchlists } from "@/hooks/useWatchlists";
import { useWatchlistStore } from "@/stores/watchlistStore";
import { useToast } from "@/hooks/useToast";
import { useLiveBoard } from "@/hooks/useLiveBoard";
import { useFactorUniverse } from "@/hooks/useFactorUniverse";
import {
  FACTORS, WEIGHTS, grade, gradeClass, factorColor, NAME_BY_TICKER,
  type FactorScores, type Stock,
} from "@/lib/research";
import ChatContextButton from "@/components/chat/ChatContextButton";
import PageHeader from "@/components/layout/PageHeader";
import AddTickerSearch from "@/components/watchlist/AddTickerSearch";
import { useChatStore } from "@/stores/chatStore";
import { buildWatchlistSnapshot } from "@/lib/pageContext";

// ─── Data helpers ────────────────────────────────────────────────────────────

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function intradaySeries(ticker: string, dayPct: number, n = 30): number[] {
  let seed = 0;
  for (let i = 0; i < ticker.length; i++) seed = (seed * 31 + ticker.charCodeAt(i)) | 0;
  const rnd = mulberry32(seed);
  const target = dayPct / 100;
  const out: number[] = [];
  let v = 0;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    v += (rnd() - 0.5) * 0.006;
    v *= 0.9;
    const wobble = Math.sin(t * Math.PI * 1.4 + seed) * 0.004;
    out.push(100 * (1 + target * t + v + wobble * (1 - t)));
  }
  out[0] = 100;
  out[n - 1] = 100 * (1 + target);
  return out;
}

function factorFill(v: number): string {
  const c = v >= 67 ? "var(--color-bull)" : v >= 40 ? "var(--color-warn)" : "var(--color-bear)";
  return `color-mix(in oklab, ${c} 16%, transparent)`;
}

function scoreTierColor(s: number): string {
  if (s >= 80) return "var(--color-bull)";
  if (s >= 70) return "color-mix(in oklab, var(--color-bull) 78%, var(--color-warn))";
  if (s >= 60) return "var(--color-warn)";
  return "var(--color-bear)";
}

function scoreFor(stock: Stock): number {
  const w = WEIGHTS.month;
  let s = 0;
  for (const k in w) s += (w as Record<string, number>)[k] * (stock.f as Record<string, number>)[k];
  return Math.round(s);
}

const SIGNAL_TONE = {
  alert: { color: "var(--color-bear)", bg: "color-mix(in oklab, var(--color-bear) 11%, transparent)", glyph: "!" },
  earn:  { color: "var(--color-accent)", bg: "var(--color-accent-light)", glyph: "◴" },
  up:    { color: "var(--color-bull)", bg: "color-mix(in oklab, var(--color-bull) 11%, transparent)", glyph: "▲" },
  cross: { color: "var(--color-warn)", bg: "var(--color-warn-bg)", glyph: "↕" },
  high:  { color: "var(--color-bull)", bg: "color-mix(in oklab, var(--color-bull) 9%, transparent)", glyph: "★" },
} as const;

type SignalKind = keyof typeof SIGNAL_TONE;

interface Signal {
  k: SignalKind;
  label: string;
}

function deriveSignals(changePct: number | null, f: FactorScores | null): Signal[] {
  const sigs: Signal[] = [];
  if (changePct !== null) {
    if (changePct < -2.5) sigs.push({ k: "alert", label: `Down ${Math.abs(changePct).toFixed(1)}% today` });
    else if (changePct > 2.5) sigs.push({ k: "up", label: `Up ${changePct.toFixed(1)}% today` });
  }
  if (f) {
    if (f.analyst >= 78) sigs.push({ k: "high", label: "Strong analyst coverage" });
    else if (f.mom >= 80) sigs.push({ k: "high", label: "Momentum breakout" });
  }
  return sigs.slice(0, 1);
}

// ─── Primitives ──────────────────────────────────────────────────────────────

function Sparkline({ values, w = 54, h = 18, up = true }: {
  values: number[]; w?: number; h?: number; up?: boolean;
}) {
  const color = up ? "var(--color-bull)" : "var(--color-bear)";
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const stepX = w / (values.length - 1);
  const pts = values.map((v, i) => [
    i * stepX,
    pad + (h - pad * 2) * (1 - (v - min) / span),
  ]);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", overflow: "visible" }}>
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function ScoreBar({ score, w = 56 }: { score: number; w?: number }) {
  const c = scoreTierColor(score);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: w, height: 6, borderRadius: 99, background: "var(--color-surface-2)", overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", borderRadius: 99, background: c }} />
      </div>
      <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--color-text)", minWidth: 18 }}>
        {score}
      </span>
    </div>
  );
}

function FactorTiles({ f }: { f: FactorScores }) {
  return (
    <div style={{ display: "inline-flex", gap: 3 }}>
      {FACTORS.map((fac) => {
        const v = f[fac.key];
        return (
          <div
            key={fac.key}
            title={`${fac.short}: ${v}`}
            style={{
              width: 15, height: 15, borderRadius: 3,
              background: factorFill(v),
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <div style={{ width: 7, height: 7, borderRadius: 2, background: factorColor(v) }} />
          </div>
        );
      })}
    </div>
  );
}

function FactorSkeleton() {
  return (
    <div style={{ display: "inline-flex", gap: 3 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{ width: 15, height: 15, borderRadius: 3, background: "var(--color-surface-2)" }} />
      ))}
    </div>
  );
}

function GradePill({ g }: { g: string }) {
  return (
    <span
      className={"mono grade " + gradeClass(g)}
      style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 6px", borderRadius: 5, letterSpacing: "0.01em", whiteSpace: "nowrap" }}
    >
      {g}
    </span>
  );
}

function SignalChip({ sig }: { sig: Signal }) {
  const tone = SIGNAL_TONE[sig.k];
  return (
    <span
      className="mono"
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        fontSize: 10, fontWeight: 600,
        color: tone.color, background: tone.bg,
        padding: "2px 8px", borderRadius: 99, whiteSpace: "nowrap", letterSpacing: "0.01em",
      }}
    >
      <span style={{ fontSize: 8.5 }}>{tone.glyph}</span>
      {sig.label}
    </span>
  );
}

// ─── Table ───────────────────────────────────────────────────────────────────

const COLS = ["#", "Ticker", "Last", "Day", "Factor profile", "Finava", "Grd", "Signal", "30m"] as const;
const RIGHT_COLS = new Set(["Last", "Day", "30m"]);

function TableHead() {
  return (
    <thead>
      <tr>
        {COLS.map((h) => (
          <th
            key={h}
            className="mono"
            style={{
              textAlign: RIGHT_COLS.has(h) ? "right" : "left",
              fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
              color: "var(--color-muted)", padding: "8px 12px",
              background: "var(--color-surface)", borderBottom: "1px solid var(--color-border-strong)",
              whiteSpace: "nowrap",
            }}
          >
            {h}
          </th>
        ))}
        <th style={{ width: 30, background: "var(--color-surface)", borderBottom: "1px solid var(--color-border-strong)" }} />
      </tr>
    </thead>
  );
}

interface RowData {
  ticker: string;
  name: string;
  price: number | null;
  changePct: number | null;
  f: FactorScores | null;
  score: number;
  grade: string;
  series: number[];
  signals: Signal[];
}

function TableRow({ data, rank, onRemove, onClick }: {
  data: RowData;
  rank: number;
  onRemove: (t: string) => void;
  onClick: (t: string) => void;
}) {
  const up = (data.changePct ?? 0) >= 0;
  const fmtPrice = data.price == null
    ? "—"
    : data.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtChange = data.changePct == null
    ? "—"
    : `${data.changePct >= 0 ? "▲ +" : "▼ "}${Math.abs(data.changePct).toFixed(2)}%`;

  return (
    <tr
      className="b-row"
      onClick={() => onClick(data.ticker)}
      style={{ borderBottom: "1px solid var(--color-border)" }}
    >
      <td className="mono" style={{ fontSize: 10.5, color: "var(--color-muted)", padding: "9px 12px" }}>
        {String(rank).padStart(2, "0")}
      </td>
      <td style={{ padding: "9px 12px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.02em", color: "var(--color-accent)" }}>
            {data.ticker}
          </span>
          <span style={{ fontSize: 10.5, color: "var(--color-muted)", maxWidth: 104, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {data.name}
          </span>
        </div>
      </td>
      <td className="mono" style={{ textAlign: "right", fontSize: 12, color: "var(--color-text)", padding: "9px 12px" }}>
        {fmtPrice}
      </td>
      <td style={{ textAlign: "right", padding: "9px 12px" }}>
        <span
          className="mono"
          style={{
            color: data.changePct == null ? "var(--color-muted)" : up ? "var(--color-bull)" : "var(--color-bear)",
            fontWeight: 700, fontSize: 12, whiteSpace: "nowrap",
          }}
        >
          {fmtChange}
        </span>
      </td>
      <td style={{ padding: "9px 12px" }}>
        {data.f ? <FactorTiles f={data.f} /> : <FactorSkeleton />}
      </td>
      <td style={{ padding: "9px 12px" }}>
        <ScoreBar score={data.score} w={56} />
      </td>
      <td style={{ padding: "9px 12px" }}>
        <GradePill g={data.grade} />
      </td>
      <td style={{ padding: "9px 12px" }}>
        {data.signals[0]
          ? <SignalChip sig={data.signals[0]} />
          : <span className="mono" style={{ fontSize: 10.5, color: "var(--color-muted)" }}>—</span>
        }
      </td>
      <td style={{ padding: "9px 12px", textAlign: "right" }}>
        <Sparkline values={data.series} w={54} h={18} up={up} />
      </td>
      <td style={{ padding: "9px 10px", textAlign: "right" }}>
        <button
          aria-label={`Remove ${data.ticker}`}
          onClick={(e) => { e.stopPropagation(); onRemove(data.ticker); }}
          className="wl-x mono"
          style={{ width: 20, height: 20, border: "none", background: "transparent", color: "var(--color-muted)", cursor: "pointer", fontSize: 14 }}
        >
          ×
        </button>
      </td>
    </tr>
  );
}

// ─── Rail ─────────────────────────────────────────────────────────────────────

function RailSection({ title, count, children }: {
  title: string; count?: number; children: React.ReactNode;
}) {
  return (
    <div className="b-railsec">
      <div className="b-railhead">
        <span className="mono b-railtitle" style={{ textTransform: "uppercase", fontSize: 9.5, letterSpacing: "0.1em", color: "var(--color-muted)" }}>
          {title}
        </span>
        {count != null && <span className="mono b-railcount">{count}</span>}
      </div>
      {children}
    </div>
  );
}

// ─── KPI tile ─────────────────────────────────────────────────────────────────

function KpiTile({ label, value, accent, last }: {
  label: string; value: string; accent?: string; last?: boolean;
}) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 3,
      paddingRight: last ? 0 : 20,
      borderRight: last ? "none" : "1px solid var(--color-border)",
    }}>
      <span className="mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-muted)", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <span className="mono" style={{ fontSize: 16, fontWeight: 700, color: accent ?? "var(--color-text)", lineHeight: 1, whiteSpace: "nowrap" }}>
        {value}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WatchlistSplitRail() {
  const router = useRouter();
  const toast = useToast();
  const { watchlists, isLoading, error, createWatchlist, updateWatchlist, deleteWatchlist, addTicker, removeTicker } = useWatchlists();
  const { activeId, setActiveId } = useWatchlistStore();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (error) toast.error("Couldn't load your watchlists. Check your connection and retry.");
  }, [error, toast]);

  useEffect(() => {
    if (watchlists.length === 0) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    if (!activeId || !watchlists.some((w) => w.id === activeId)) {
      setActiveId(watchlists[0].id);
    }
  }, [watchlists, activeId, setActiveId]);

  const active = watchlists.find((w) => w.id === activeId) ?? null;
  const tickers = active?.tickers ?? [];

  // Publish the active watchlist as app-wide page context, so a chat sent here
  // ("which of these looks strongest?") is scoped to these names.
  useEffect(() => {
    const setActivePageContext = useChatStore.getState().setActivePageContext;
    if (active) {
      setActivePageContext({
        kind: "watchlist",
        label: active.name,
        snapshot: buildWatchlistSnapshot(active.name, active.tickers),
      });
    }
    return () => setActivePageContext(null);
  }, [active?.id, active?.name, tickers.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const { liveMap } = useLiveBoard(tickers);
  const { universe } = useFactorUniverse();

  // Build enriched row data
  const rows: RowData[] = tickers.map((ticker) => {
    const live = liveMap.get(ticker);
    const stock = universe?.find((s) => s.ticker === ticker) ?? null;
    const f = stock?.f ?? null;
    const changePct = live?.changePct ?? null;
    const sc = stock ? scoreFor(stock) : 0;
    const g = grade(sc);
    const signals = deriveSignals(changePct, f);
    return {
      ticker,
      name: NAME_BY_TICKER[ticker] ?? ticker,
      price: live?.price ?? null,
      changePct,
      f,
      score: sc,
      grade: g,
      series: intradaySeries(ticker, changePct ?? 0),
      signals,
    };
  }).sort((a, b) => b.score - a.score);

  // KPI summary
  const n = rows.length;
  const changes = rows.map((r) => r.changePct).filter((c): c is number => c != null);
  const gainers = changes.filter((c) => c >= 0).length;
  const decliners = n - gainers;
  const avg = changes.length ? changes.reduce((s, c) => s + c, 0) / changes.length : null;
  const avgScore = rows.length ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length) : 0;
  const signalCount = rows.reduce((s, r) => s + r.signals.length, 0);

  // Rail data
  const movers = [...rows].sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
  const feed = rows.flatMap((r) => r.signals.map((sig) => ({ ...sig, ticker: r.ticker })));

  async function handleCreate() {
    try {
      const created = await createWatchlist("New watchlist");
      setActiveId(created.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create watchlist.");
    }
  }

  function startRename() {
    setDraft(active?.name ?? "");
    setRenaming(true);
  }
  function commitRename() {
    if (active && draft.trim()) updateWatchlist(active.id, { name: draft.trim() });
    setRenaming(false);
  }

  async function handleDelete() {
    if (!active) return;
    if (!window.confirm(`Delete "${active.name}"?`)) return;
    try {
      await deleteWatchlist(active.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete watchlist.");
    }
  }

  return (
    <div className="research-root term" style={{ height: "100%", background: "var(--color-bg)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Standardized page header — list tabs + management controls, with the
          KPI strip as the standardized second row */}
      <PageHeader
        title="Watchlist"
        subtitle={`${n} TICKER${n !== 1 ? "S" : ""} · LIVE`}
        center={
          watchlists.length > 0 ? (
            <div className="b-lenses b-lenses-pill">
              {watchlists.map((w) => (
                <button key={w.id} className={"b-lens" + (w.id === activeId ? " on" : "")} onClick={() => setActiveId(w.id)}>
                  {w.name}
                </button>
              ))}
            </div>
          ) : undefined
        }
        actions={
          <>
            {active && !renaming && (
              <button className="mono" onClick={startRename} style={{ fontSize: 10.5, color: "var(--color-muted)", border: "none", background: "transparent", cursor: "pointer", padding: "0 8px", height: 28, display: "inline-flex", alignItems: "center", borderRadius: 3, transition: "color 120ms" }}>
                Rename
              </button>
            )}
            {renaming && (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(false); }}
                className="tsel mono"
                style={{ width: 160 }}
              />
            )}
            {active && !renaming && (
              <button className="mono" onClick={handleDelete} style={{ fontSize: 10.5, color: "var(--color-muted)", border: "none", background: "transparent", cursor: "pointer", padding: "0 8px", height: 28, display: "inline-flex", alignItems: "center", borderRadius: 3, transition: "color 120ms" }}>
                Delete
              </button>
            )}
            <button className="tbtn" onClick={handleCreate}>
              + New
            </button>
            <span className="mono b-asof">
              {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
            <button className="tbtn on" onClick={() => router.push("/chat")}>
              ASK AI
            </button>
            <ChatContextButton context="watchlist" />
          </>
        }
        secondRow={
          active ? (
            <>
              <KpiTile label="Tracked" value={`${n}`} />
              <KpiTile label="Gainers" value={`${gainers}`} accent={gainers ? "var(--color-bull)" : undefined} />
              <KpiTile label="Decliners" value={`${decliners}`} accent={decliners ? "var(--color-bear)" : undefined} />
              <KpiTile
                label="Avg day"
                value={avg == null ? "—" : `${avg >= 0 ? "+" : ""}${avg.toFixed(2)}%`}
                accent={avg == null ? undefined : avg >= 0 ? "var(--color-bull)" : "var(--color-bear)"}
              />
              <KpiTile label="Avg score" value={`${avgScore}`} />
              <KpiTile label="Signals" value={`${signalCount}`} accent="var(--color-accent)" last />
              <div style={{ marginLeft: "auto" }}>
                <AddTickerSearch
                  existing={active?.tickers ?? []}
                  onAdd={(t) => active && addTicker(active.id, t)}
                />
              </div>
            </>
          ) : undefined
        }
      />

      {/* Scroll region — the soft top fade is owned by PageHeader */}
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>

        {isLoading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <span className="mono" style={{ fontSize: 11.5, color: "var(--color-muted)" }}>Loading…</span>
          </div>
        ) : watchlists.length === 0 ? (
          // No lists state
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, padding: "40px 24px", textAlign: "center" }}>
            <p style={{ fontSize: 14, color: "var(--color-text)", fontFamily: "var(--font-serif)", fontWeight: 700 }}>No watchlists yet</p>
            <p style={{ fontSize: 12.5, color: "var(--color-text-secondary)" }}>Create a list to start tracking stocks you care about.</p>
            <button className="tbtn on" onClick={handleCreate}>＋ Create watchlist</button>
          </div>
        ) : tickers.length === 0 ? (
          // Empty list state
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, padding: "40px 24px", textAlign: "center" }}>
            <p style={{ fontSize: 14, color: "var(--color-text)", fontFamily: "var(--font-serif)", fontWeight: 700 }}>Nothing in {active?.name ?? "this list"} yet</p>
            <p style={{ fontSize: 12.5, color: "var(--color-text-secondary)" }}>Add a ticker using the search bar above.</p>
          </div>
        ) : (
          // Split rail layout
          <div style={{ height: "100%", overflowY: "auto", scrollbarGutter: "stable both-edges", padding: "var(--content-pad-top) var(--page-gutter) var(--content-pad-bottom)", display: "grid", gridTemplateColumns: "minmax(0,1fr) 268px", gap: 16, alignItems: "start" }}>
            {/* Table */}
            <div className="b-board">
              <div className="b-boardhead">
                <span className="b-boardtitle">{active?.name ?? "Watchlist"}</span>
                <span className="mono b-live">● LIVE</span>
                <span className="mono" style={{ fontSize: 10, color: "var(--color-muted)", marginLeft: "auto" }}>SORTED · FINAVA SCORE</span>
              </div>
              <table className="b-table" style={{ width: "100%" }}>
                <TableHead />
                <tbody>
                  {rows.map((row, i) => (
                    <TableRow
                      key={row.ticker}
                      data={row}
                      rank={i + 1}
                      onRemove={(t) => active && removeTicker(active.id, t)}
                      onClick={(t) => router.push(`/stock/${t}`)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Rail */}
            <div className="b-rail">
              {/* Signals */}
              <RailSection title="Signals" count={signalCount}>
                {feed.length === 0 ? (
                  <div style={{ padding: "11px 13px" }}>
                    <span className="mono" style={{ fontSize: 10.5, color: "var(--color-muted)" }}>No active signals</span>
                  </div>
                ) : (
                  feed.slice(0, 5).map((sig, i) => {
                    const tone = SIGNAL_TONE[sig.k];
                    return (
                      <div
                        key={i}
                        className="b-railrow"
                        onClick={() => router.push(`/stock/${sig.ticker}`)}
                        style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "9px 13px", borderBottom: i < Math.min(feed.length, 5) - 1 ? "1px solid var(--color-border)" : "none" }}
                      >
                        <span style={{ flexShrink: 0, marginTop: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 19, height: 19, borderRadius: 99, background: tone.bg, color: tone.color, fontSize: 10, fontWeight: 700 }}>
                          {tone.glyph}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <span className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: "var(--color-accent)" }}>{sig.ticker}</span>
                          <p style={{ margin: "2px 0 0", fontSize: 10.5, color: "var(--color-text-secondary)", lineHeight: 1.35 }}>{sig.label}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </RailSection>

              {/* Today's movers */}
              <RailSection title="Today's movers">
                {movers.slice(0, 5).map((row) => (
                  <div
                    key={row.ticker}
                    className="b-railrow"
                    onClick={() => router.push(`/stock/${row.ticker}`)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 13px", borderBottom: "1px solid var(--color-border)" }}
                  >
                    <span className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: "var(--color-accent)", width: 46 }}>{row.ticker}</span>
                    <div style={{ flex: 1 }}>
                      <Sparkline values={row.series} w={60} h={16} up={(row.changePct ?? 0) >= 0} />
                    </div>
                    <span className="mono" style={{ color: (row.changePct ?? 0) >= 0 ? "var(--color-bull)" : "var(--color-bear)", fontWeight: 700, fontSize: 11.5, whiteSpace: "nowrap" }}>
                      {row.changePct == null ? "—" : `${(row.changePct ?? 0) >= 0 ? "▲ +" : "▼ "}${Math.abs(row.changePct).toFixed(2)}%`}
                    </span>
                  </div>
                ))}
              </RailSection>

              {/* Score leaders */}
              <RailSection title="Score leaders">
                {rows.slice(0, 5).map((row) => (
                  <div
                    key={row.ticker}
                    className="b-railrow"
                    onClick={() => router.push(`/stock/${row.ticker}`)}
                    style={{ display: "grid", gridTemplateColumns: "44px 1fr auto", alignItems: "center", gap: 9, padding: "8px 13px", borderBottom: "1px solid var(--color-border)" }}
                  >
                    <span className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: "var(--color-accent)" }}>{row.ticker}</span>
                    <div style={{ height: 6, borderRadius: 99, background: "var(--color-surface-2)", overflow: "hidden" }}>
                      <div style={{ width: `${row.score}%`, height: "100%", borderRadius: 99, background: scoreTierColor(row.score) }} />
                    </div>
                    <span className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: "var(--color-text)" }}>{row.score}</span>
                  </div>
                ))}
              </RailSection>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
