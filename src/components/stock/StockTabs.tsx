"use client";
import { useState } from "react";
import { authFetch } from "@/lib/authFetch";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useQuotes } from "@/hooks/useQuotes";
import { useNewsImages } from "@/hooks/useNewsImages";
import type {
  StockProfile,
  KeyStats,
  AnalystRatings,
  NewsItem,
  SentimentRead,
} from "@/lib/stockData";
import type { FundamentalTimeSeries, YearlyMetric } from "@/lib/edgar";
import Rule from "@/components/ui/Rule";

/* ── format helpers ──────────────────────────────────────────────────────── */
function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function compact(n: number) {
  const a = Math.abs(n);
  if (a >= 1e12) return `${fmt(n / 1e12, 2)}T`;
  if (a >= 1e9) return `${fmt(n / 1e9, 2)}B`;
  if (a >= 1e6) return `${fmt(n / 1e6, 1)}M`;
  if (a >= 1e3) return `${fmt(n / 1e3, 1)}K`;
  return fmt(n, 0);
}
function signed(n: number, d = 2) {
  return `${n >= 0 ? "+" : ""}${fmt(n, d)}`;
}
function timeAgo(unixSec: number) {
  if (!unixSec) return "";
  const diff = Date.now() / 1000 - unixSec;
  const h = Math.floor(diff / 3600);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/* ── shared primitives (flat, ruled — the research-surface vocabulary) ───── */
function Fact({ l, v, color, big }: { l: string; v: string; color?: string; big?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "9px 0", borderBottom: "1px solid var(--color-border)", gap: 12 }}>
      <span style={{ fontSize: "var(--text-meta)", color: "var(--color-muted)", whiteSpace: "nowrap" }}>{l}</span>
      <span className="mono" style={{ fontSize: big ? "var(--text-body)" : "var(--text-sm)", fontWeight: 600, color: color || "var(--color-text)" }}>{v}</span>
    </div>
  );
}

/* Small inline icons (24-box grammar, stroke 2) for glyphs that used to be
   unicode pseudo-icons (↗ ↻ ▾ ● |). */
function ExternalLinkIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}
function RefreshIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}
function ChevronIcon({ open, size = 10 }: { open: boolean; size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ opacity: 0.7, transform: open ? "rotate(180deg)" : undefined, transition: "transform 130ms ease-out" }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function RangeBar({ lo, hi, cur, mean }: { lo: number; hi: number; cur: number; mean?: number }) {
  const pos = (x: number) => Math.max(0, Math.min(100, ((x - lo) / (hi - lo || 1)) * 100));
  return (
    <div style={{ margin: "4px 0 2px" }}>
      <div style={{ position: "relative", height: 4, background: "var(--color-surface-2)", borderRadius: 99 }}>
        <div style={{ position: "absolute", left: 0, width: `${pos(cur)}%`, height: "100%", background: "var(--color-accent)", borderRadius: 99 }} />
        {mean != null && <div style={{ position: "absolute", left: `${pos(mean)}%`, top: -3, width: 2, height: 10, background: "var(--color-warn)", transform: "translateX(-50%)" }} />}
        <div style={{ position: "absolute", left: `${pos(cur)}%`, top: -3, width: 10, height: 10, borderRadius: 99, background: "var(--color-accent)", border: "2px solid var(--color-bg)", transform: "translateX(-50%)" }} />
      </div>
      <div className="mono" style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-micro)", color: "var(--color-muted)", marginTop: 6 }}>
        <span>${fmt(lo, 0)}</span>
        <span>${fmt(hi, 0)}</span>
      </div>
    </div>
  );
}

function SourceLogo({ domain, size = 18 }: { domain: string | null; size?: number }) {
  const [err, setErr] = useState(false);
  if (err || !domain) {
    return <span style={{ width: size, height: size, borderRadius: "var(--radius-xs)", background: "var(--color-surface-2)", display: "inline-block", flexShrink: 0 }} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?sz=64&domain=${domain}`}
      alt=""
      width={size}
      height={size}
      style={{ borderRadius: "var(--radius-xs)", flexShrink: 0, display: "block" }}
      onError={() => setErr(true)}
    />
  );
}

function NewsThumb({ src, domain, style }: { src: string; domain: string | null; style?: React.CSSProperties }) {
  const [err, setErr] = useState(false);
  const show = src && !err;
  return (
    <div style={{ background: "var(--color-surface-2)", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", ...style }}>
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          onError={() => setErr(true)}
        />
      ) : (
        // Real article image absent/blocked — fall back to the publication mark.
        <SourceLogo domain={domain} size={22} />
      )}
    </div>
  );
}

function FinMetric({ label, data, color, money = true }: { label: string; data: YearlyMetric[]; color: string; money?: boolean }) {
  const recent = data.slice(-5);
  if (recent.length === 0) return null;
  const latest = recent[recent.length - 1].value;
  const prev = recent.length > 1 ? recent[recent.length - 2].value : latest;
  const yoy = prev ? ((latest - prev) / Math.abs(prev)) * 100 : 0;
  const max = Math.max(...recent.map((d) => Math.abs(d.value)), 1);
  return (
    <div style={{ minWidth: 0 }}>
      <p className="mono eyebrow-label" style={{ margin: "0 0 6px", color: "var(--color-muted)" }}>{label}</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span className="serif mono" style={{ fontFamily: "var(--font-serif)", fontSize: "var(--text-display)", fontWeight: 800, letterSpacing: "-0.01em", color: "var(--color-text)" }}>
          {money ? "$" : ""}{compact(latest)}
        </span>
        <span className="mono" style={{ fontSize: "var(--text-meta)", fontWeight: 600, color: yoy >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}>{signed(yoy, 1)}%</span>
      </div>
      <p className="mono" style={{ margin: "1px 0 10px", fontSize: "var(--text-micro)", color: "var(--color-muted)" }}>FY{recent[recent.length - 1].year} · YoY</p>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 52 }}>
        {recent.map((d, i) => {
          const last = i === recent.length - 1;
          return (
            <div key={d.year} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ width: "100%", height: Math.max((Math.abs(d.value) / max) * 44, 3), background: last ? color : `color-mix(in oklab, ${color} 32%, var(--color-surface-2))`, borderRadius: "2px 2px 0 0" }} />
              <span className="mono" style={{ fontSize: "var(--text-micro)", color: "var(--color-muted)" }}>{`'${String(d.year).slice(2)}`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function chip(label: string) {
  return (
    <span key={label} className="mono" style={{ fontSize: "var(--text-micro)", fontWeight: 600, letterSpacing: "0.02em", padding: "4px 9px", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
      {label}
    </span>
  );
}

/* ── Overview ────────────────────────────────────────────────────────────── */
function sentimentColor(label: SentimentRead["label"]) {
  if (label === "positive") return "var(--color-bull)";
  if (label === "negative") return "var(--color-bear)";
  return "var(--color-warn)";
}

export function OverviewTab({
  ticker,
  profile,
  keyStats,
  sentiment,
}: {
  ticker: string;
  profile: StockProfile | null;
  keyStats: KeyStats | null;
  sentiment: SentimentRead | null;
}) {
  const { holdings } = usePortfolio();
  const { quoteMap } = useQuotes([ticker]);
  const [sentOpen, setSentOpen] = useState(false);
  const [take, setTake] = useState<string | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const price = quoteMap.get(ticker)?.price ?? 0;
  const held = holdings.find((h) => h.ticker.toUpperCase() === ticker.toUpperCase());

  async function generate() {
    setGenLoading(true);
    setGenError(null);
    try {
      const res = await authFetch(`/api/stock/${encodeURIComponent(ticker)}/ai-take`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setTake(body.take ?? "");
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Failed to generate take.");
    } finally {
      setGenLoading(false);
    }
  }

  const chips = [profile?.industry, profile?.exchange, profile?.currency].filter(Boolean) as string[];
  const has52 = keyStats?.high52 != null && keyStats?.low52 != null;
  const pos52 = has52 && price > 0 ? ((price - keyStats!.low52!) / (keyStats!.high52! - keyStats!.low52! || 1)) * 100 : null;

  // Position economics (only when held + we have a live price).
  let posRows: React.ReactNode = null;
  if (held && price > 0) {
    const mv = held.shares * price;
    const cb = held.shares * held.avgCost;
    const gl = mv - cb;
    const glp = cb > 0 ? (gl / cb) * 100 : 0;
    const gu = gl >= 0;
    posRows = (
      <div style={{ marginTop: 14 }}>
        <Rule>Your position</Rule>
        <Fact l={`${fmt(held.shares, held.shares % 1 === 0 ? 0 : 2)} sh · avg $${fmt(held.avgCost)}`} v={`$${compact(mv)}`} />
        <Fact l="Unrealized P/L" v={`${gu ? "+" : ""}$${compact(Math.abs(gl))} · ${signed(glp, 1)}%`} color={gu ? "var(--color-bull)" : "var(--color-bear)"} />
      </div>
    );
  }

  return (
    <div className="fade-in">
      {/* About strip */}
      {profile && (
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start", paddingBottom: 22, marginBottom: 22, borderBottom: "1px solid var(--color-border)" }}>
          <div style={{ width: 54, height: 54, borderRadius: "var(--radius-sm)", background: "var(--color-surface)", border: "1px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
            {profile.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.logo} alt="" width={40} height={40} style={{ objectFit: "contain", borderRadius: "var(--radius-xs)" }} />
            ) : (
              <span className="serif" style={{ color: "var(--color-accent)", fontWeight: 700, fontSize: "var(--text-lg)" }}>{ticker.slice(0, 2)}</span>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="mono eyebrow-label" style={{ margin: "2px 0 7px", color: "var(--color-muted)" }}>
              About · {profile.name ?? ticker}
            </p>
            <p style={{ margin: 0, fontSize: "var(--text-sm)", lineHeight: 1.62, color: "var(--color-text-secondary)", maxWidth: "82ch" }}>
              {profile.name ?? ticker}{profile.exchange ? ` trades on ${profile.exchange}` : ""}
              {profile.industry ? ` in the ${profile.industry} industry` : ""}.
              {keyStats?.marketCap != null ? ` Market capitalisation is approximately $${compact(keyStats.marketCap * 1e6)}.` : ""}
            </p>
            <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
              {chips.map((c) => chip(c))}
              {profile.weburl && (
                <a href={profile.weburl} target="_blank" rel="noopener noreferrer" className="mono" style={{ fontSize: "var(--text-micro)", fontWeight: 600, color: "var(--color-accent)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  Website <ExternalLinkIcon />
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 0 }} className="overview-grid">
        {/* left — AI take */}
        <div style={{ paddingRight: 32 }} className="overview-left">
          <Rule>The Finava Read</Rule>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {sentiment && (
              <button
                onClick={() => setSentOpen((o) => !o)}
                className="ghostbtn"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-meta)",
                  fontWeight: 600,
                  letterSpacing: "0.03em",
                  whiteSpace: "nowrap",
                  padding: "6px 11px",
                  borderRadius: "var(--radius-xs)",
                  cursor: "pointer",
                  border: "1px solid var(--color-accent-medium)",
                  background: "var(--color-accent-light)",
                  color: "var(--color-accent)",
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: 99, background: sentimentColor(sentiment.label) }} />
                SENTIMENT {sentiment.score} · {sentiment.label.toUpperCase()}
                <ChevronIcon open={sentOpen} />
              </button>
            )}
          </div>

          {sentiment && sentOpen && (
            <div className="fade-in" style={{ marginBottom: 16, padding: "14px 16px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-xs)", background: "var(--color-surface)" }}>
              <p className="mono eyebrow-label" style={{ margin: "0 0 12px", color: "var(--color-muted)" }}>
                Sentiment detail · {sentiment.sampleSize} {sentiment.sampleSize === 1 ? "item" : "items"}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 40px", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ height: 6, borderRadius: 99, background: "var(--color-surface-2)", overflow: "hidden" }}>
                  <div style={{ width: `${sentiment.score}%`, height: "100%", background: sentimentColor(sentiment.label) }} />
                </div>
                <span className="mono" style={{ fontSize: "var(--text-meta)", fontWeight: 600, textAlign: "right", color: "var(--color-text)" }}>{sentiment.score}</span>
              </div>
              <p style={{ margin: 0, fontSize: "var(--text-meta)", color: "var(--color-text-secondary)" }}>
                Based on {sentiment.basis}.
                {sentiment.placeholder ? " A lightweight heuristic — the full multi-source engine lands in a later phase." : ""}
              </p>
            </div>
          )}

          {take ? (
            <>
              <p style={{ margin: 0, fontSize: "var(--text-body)", lineHeight: 1.72, color: "var(--color-text-secondary)", whiteSpace: "pre-wrap" }}>{take}</p>
              <button
                onClick={generate}
                disabled={genLoading}
                className="mono"
                style={{ marginTop: 14, fontSize: "var(--text-micro)", color: "var(--color-accent)", background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 5 }}
              >
                {genLoading ? "Regenerating…" : <><RefreshIcon /> Regenerate</>}
              </button>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
              <p style={{ margin: 0, fontSize: "var(--text-body)", lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
                Generate a concise, balanced AI read on {ticker} from its latest fundamentals, analyst picture, and news. Nothing runs until you ask.
              </p>
              <button className="tbtn on" onClick={generate} disabled={genLoading} style={{ opacity: genLoading ? 0.6 : 1 }}>
                {genLoading ? "GENERATING…" : "GENERATE AI TAKE"}
              </button>
            </div>
          )}
          {genError && <p style={{ marginTop: 10, fontSize: "var(--text-meta)", color: "var(--color-bear)" }}>{genError}</p>}
          <p className="mono" style={{ margin: "16px 0 0", fontSize: "var(--text-micro)", color: "var(--color-muted)" }}>
            Generated from latest fundamentals, analyst coverage &amp; news · not investment advice.
          </p>
        </div>

        {/* right — flat ruled snapshot */}
        <div style={{ borderLeft: "1px solid var(--color-border)", paddingLeft: 32 }} className="overview-right">
          <Rule>Snapshot</Rule>
          <Fact l="Market cap" v={keyStats?.marketCap != null ? `$${compact(keyStats.marketCap * 1e6)}` : "—"} />
          <Fact l="P/E (TTM)" v={keyStats?.peTTM != null ? fmt(keyStats.peTTM, 1) : "—"} />
          <Fact l="EPS (TTM)" v={keyStats?.epsTTM != null ? `$${fmt(keyStats.epsTTM)}` : "—"} />
          <Fact l="Dividend yield" v={keyStats?.dividendYield != null ? `${fmt(keyStats.dividendYield, 2)}%` : "—"} />
          <Fact l="Beta" v={keyStats?.beta != null ? fmt(keyStats.beta, 2) : "—"} />
          {has52 && (
            <div style={{ padding: "14px 0 4px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: "var(--text-meta)", color: "var(--color-muted)", whiteSpace: "nowrap" }}>52-week range</span>
                {pos52 != null && <span className="mono" style={{ fontSize: "var(--text-meta)", color: "var(--color-text-secondary)" }}>{fmt(pos52, 0)}% of range</span>}
              </div>
              <RangeBar lo={keyStats!.low52!} hi={keyStats!.high52!} cur={price > 0 ? price : keyStats!.low52!} />
            </div>
          )}
          {posRows}
        </div>
      </div>
    </div>
  );
}

/* ── Financials ──────────────────────────────────────────────────────────── */
export function FinancialsTab({ fundamentals }: { fundamentals: FundamentalTimeSeries | null }) {
  if (!fundamentals || (fundamentals.revenue.length === 0 && fundamentals.netIncome.length === 0)) {
    return <div className="fade-in"><p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>Financial statements are not available for this symbol.</p></div>;
  }
  const metrics = [
    { label: "Revenue", data: fundamentals.revenue, color: "var(--color-accent)" },
    { label: "Net income", data: fundamentals.netIncome, color: "var(--color-bull)" },
    { label: "Operating cash flow", data: fundamentals.operatingCashFlow, color: "var(--color-warn)" },
    { label: "Total debt", data: fundamentals.totalDebt, color: "var(--color-text-secondary)" },
  ].filter((m) => m.data.length > 0);

  const rows = fundamentals.revenue;
  const niByYear = new Map(fundamentals.netIncome.map((d) => [d.year, d.value]));

  return (
    <div className="fade-in">
      <Rule>Annual performance</Rule>
      <div className="fin-grid" style={{ display: "grid", gridTemplateColumns: `repeat(${metrics.length}, 1fr)`, paddingBottom: 24, marginBottom: 22, borderBottom: "1px solid var(--color-border)" }}>
        {metrics.map((m, i) => (
          <div key={m.label} style={{ paddingLeft: i ? 24 : 0, paddingRight: 18, borderLeft: i ? "1px solid var(--color-border)" : "none" }}>
            <FinMetric label={m.label} data={m.data} color={m.color} />
          </div>
        ))}
      </div>

      {rows.length > 0 && (
        <>
          <Rule>Income statement</Rule>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 440 }}>
              <thead>
                <tr>
                  {["Fiscal year", "Revenue", "Net income", "Net margin"].map((h, i) => (
                    <th key={h} className="mono eyebrow-label" style={{ textAlign: i === 0 ? "left" : "right", color: "var(--color-muted)", padding: "8px 12px", borderBottom: "1px solid var(--color-border-strong)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const ni = niByYear.get(r.year);
                  const margin = ni != null && r.value ? (ni / r.value) * 100 : null;
                  const last = i === rows.length - 1;
                  return (
                    <tr key={r.year} style={{ background: last ? "var(--color-accent-light)" : "transparent" }}>
                      <td className="mono" style={{ fontSize: "var(--text-sm)", fontWeight: last ? 700 : 600, padding: "9px 12px", borderBottom: "1px solid var(--color-border)", color: last ? "var(--color-accent)" : "var(--color-text)" }}>FY{r.year}</td>
                      <td className="mono" style={{ textAlign: "right", fontSize: "var(--text-sm)", padding: "9px 12px", borderBottom: "1px solid var(--color-border)", color: "var(--color-text)" }}>${compact(r.value)}</td>
                      <td className="mono" style={{ textAlign: "right", fontSize: "var(--text-sm)", padding: "9px 12px", borderBottom: "1px solid var(--color-border)", color: "var(--color-text)" }}>{ni != null ? `$${compact(ni)}` : "—"}</td>
                      <td className="mono" style={{ textAlign: "right", fontSize: "var(--text-sm)", padding: "9px 12px", borderBottom: "1px solid var(--color-border)", color: margin != null ? "var(--color-bull)" : "var(--color-muted)" }}>{margin != null ? `${fmt(margin, 1)}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mono" style={{ fontSize: "var(--text-micro)", color: "var(--color-muted)", margin: "12px 0 0" }}>Figures from SEC EDGAR filings · highlighted row is most recent fiscal year.</p>
        </>
      )}
    </div>
  );
}

/* ── Analysts ────────────────────────────────────────────────────────────── */
export function AnalystsTab({ analysts, price }: { analysts: AnalystRatings | null; price: number | null }) {
  if (!analysts) {
    return <div className="fade-in"><p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>Analyst coverage is not available for this symbol.</p></div>;
  }
  const total = analysts.strongBuy + analysts.buy + analysts.hold + analysts.sell + analysts.strongSell;
  const buyish = analysts.strongBuy + analysts.buy;
  const upside = price && price > 0 && analysts.targetMean != null ? ((analysts.targetMean - price) / price) * 100 : null;
  const rows: [string, number, string][] = [
    ["Strong Buy", analysts.strongBuy, "var(--color-bull)"],
    ["Buy", analysts.buy, "color-mix(in oklab, var(--color-bull) 70%, var(--color-surface))"],
    ["Hold", analysts.hold, "var(--color-muted)"],
    ["Sell", analysts.sell, "color-mix(in oklab, var(--color-bear) 70%, var(--color-surface))"],
    ["Strong Sell", analysts.strongSell, "var(--color-bear)"],
  ];
  const hasTarget = analysts.targetLow != null && analysts.targetHigh != null;

  return (
    <div className="fade-in analyst-grid" style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 0 }}>
      <div style={{ paddingRight: 32 }} className="analyst-left">
        <Rule>Rating distribution{total > 0 ? ` · ${total} analysts` : ""}</Rule>
        {rows.map(([l, v, c]) => (
          <div key={l} style={{ display: "grid", gridTemplateColumns: "92px 1fr 24px", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: "var(--text-meta)", color: "var(--color-text-secondary)" }}>{l}</span>
            <div style={{ height: 8, borderRadius: 99, background: "var(--color-surface-2)", overflow: "hidden" }}>
              <div style={{ width: `${total > 0 ? (v / total) * 100 : 0}%`, height: "100%", background: c }} />
            </div>
            <span className="mono" style={{ fontSize: "var(--text-meta)", color: "var(--color-muted)", textAlign: "right" }}>{v}</span>
          </div>
        ))}
        {total > 0 && (
          <p className="mono" style={{ margin: "8px 0 0", fontSize: "var(--text-meta)", color: "var(--color-text-secondary)" }}>
            {Math.round((buyish / total) * 100)}% rate Buy or better.
          </p>
        )}
      </div>
      <div style={{ borderLeft: "1px solid var(--color-border)", paddingLeft: 32 }} className="analyst-right">
        <Rule>Price target</Rule>
        {analysts.targetMean == null ? (
          <p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)", margin: "10px 0 0", lineHeight: 1.5 }}>
            Unavailable — analyst price targets aren’t provided on the current data tier.
          </p>
        ) : (
          <>
            <Fact l="Mean target" v={`$${fmt(analysts.targetMean)}`} big />
            <Fact l="Implied upside" v={upside != null ? `${signed(upside, 1)}%` : "—"} color={upside == null ? undefined : upside >= 0 ? "var(--color-bull)" : "var(--color-bear)"} big />
            {hasTarget && (
              <div style={{ padding: "16px 0 4px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: "var(--text-meta)", color: "var(--color-muted)" }}>Target range</span>
                  {price && price > 0 && <span className="mono" style={{ fontSize: "var(--text-meta)", color: "var(--color-text-secondary)" }}>now ${fmt(price)}</span>}
                </div>
                <RangeBar lo={analysts.targetLow!} hi={analysts.targetHigh!} cur={price && price > 0 ? price : analysts.targetLow!} mean={analysts.targetMean ?? undefined} />
                <p className="mono" style={{ margin: "8px 0 0", fontSize: "var(--text-micro)", color: "var(--color-muted)", display: "flex", alignItems: "center", gap: 5 }}>
                  <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><circle cx="4" cy="4" r="3.5" fill="var(--color-accent)" /></svg>
                  price ·
                  <svg width="4" height="10" viewBox="0 0 4 10" aria-hidden="true"><line x1="2" y1="0.5" x2="2" y2="9.5" stroke="var(--color-warn)" strokeWidth="2" /></svg>
                  mean target
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── News ────────────────────────────────────────────────────────────────── */
export function NewsTab({ news }: { news: NewsItem[] | null }) {
  // Resolve accurate per-article images + publisher domains (Finnhub's url is a
  // redirect and its image is often a generic logo). Hook runs before any early
  // return so hook order stays stable.
  const og = useNewsImages((news ?? []).map((n) => n.url));
  if (!news || news.length === 0) {
    return <div className="fade-in"><p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>No recent coverage for this symbol.</p></div>;
  }
  // Prefer the scraped article image + resolved domain; fall back to Finnhub's
  // image and the redirect host until the scrape resolves.
  const pick = (n: NewsItem) => ({
    image: (og[n.url]?.image || n.image) ?? "",
    domain: og[n.url]?.domain || domainOf(n.url),
  });
  const featured = news[0];
  const f = pick(featured);
  const rest = news.slice(1);

  return (
    <div className="fade-in" style={{ maxWidth: 880 }}>
      <Rule>Latest coverage</Rule>
      {/* Featured */}
      <a
        href={featured.url}
        target="_blank"
        rel="noopener noreferrer"
        className="newslink"
        style={{ display: "grid", gridTemplateColumns: "1fr 1.15fr", gap: 24, alignItems: "center", paddingBottom: 24, marginBottom: 22, borderBottom: "1px solid var(--color-border)", textDecoration: "none" }}
      >
        <NewsThumb src={f.image} domain={f.domain} style={{ width: "100%", aspectRatio: "16 / 10", borderRadius: "var(--radius-md)" }} />
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <SourceLogo domain={f.domain} size={18} />
            <span className="mono eyebrow-label" style={{ color: "var(--color-text-secondary)" }}>{featured.source}</span>
            {featured.datetime > 0 && (
              <>
                <span style={{ width: 3, height: 3, borderRadius: 99, background: "var(--color-muted)" }} />
                <span className="mono" style={{ fontSize: "var(--text-micro)", color: "var(--color-muted)" }}>{timeAgo(featured.datetime)}</span>
              </>
            )}
          </div>
          <p className="serif h" style={{ margin: 0, fontSize: "var(--text-display)", fontWeight: 700, lineHeight: 1.22, letterSpacing: "-0.01em", color: "var(--color-text)" }}>{featured.headline}</p>
          {featured.summary && <p style={{ margin: "10px 0 0", fontSize: "var(--text-sm)", lineHeight: 1.6, color: "var(--color-text-secondary)", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{featured.summary}</p>}
        </div>
      </a>

      {/* Grid */}
      <div className="news-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px 28px" }}>
        {rest.map((n, i) => {
          const p = pick(n);
          return (
            <a key={`${n.url}-${i}`} href={n.url} target="_blank" rel="noopener noreferrer" className="newslink" style={{ display: "flex", gap: 14, alignItems: "flex-start", textDecoration: "none" }}>
              <NewsThumb src={p.image} domain={p.domain} style={{ width: 104, height: 72, borderRadius: "var(--radius-sm)" }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                  <SourceLogo domain={p.domain} size={14} />
                  <span className="mono" style={{ fontSize: "var(--text-micro)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-muted)" }}>{n.source}{n.datetime > 0 ? ` · ${timeAgo(n.datetime)}` : ""}</span>
                </div>
                <p className="h" style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 500, lineHeight: 1.4, color: "var(--color-text)" }}>{n.headline}</p>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
