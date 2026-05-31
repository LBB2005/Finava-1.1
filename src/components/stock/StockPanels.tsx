"use client";
import type {
  KeyStats as KeyStatsType,
  AnalystRatings,
  InsiderTrade,
  NewsItem,
} from "@/lib/stockData";
import type { FundamentalTimeSeries } from "@/lib/edgar";

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function compact(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${fmt(n / 1e12, 2)}T`;
  if (abs >= 1e9) return `${fmt(n / 1e9, 2)}B`;
  if (abs >= 1e6) return `${fmt(n / 1e6, 1)}M`;
  if (abs >= 1e3) return `${fmt(n / 1e3, 1)}K`;
  return fmt(n, 0);
}

// Shared card shell.
function Card({ title, children, empty }: { title: string; children?: React.ReactNode; empty?: boolean }) {
  return (
    <div className="rounded-[var(--radius-lg)] p-5" style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)] mb-4">{title}</p>
      {empty ? (
        <p className="text-[12px] text-[var(--color-muted)]">Not available</p>
      ) : (
        children
      )}
    </div>
  );
}

/* ── Key stats ─────────────────────────────────────────────────────────── */

export function KeyStatsPanel({ stats }: { stats: KeyStatsType | null }) {
  if (!stats) return <Card title="Key Stats" empty />;
  const rows: [string, string][] = [
    ["Market cap", stats.marketCap != null ? `$${compact(stats.marketCap * 1e6)}` : "—"],
    ["P/E (TTM)", stats.peTTM != null ? fmt(stats.peTTM, 1) : "—"],
    ["EPS (TTM)", stats.epsTTM != null ? `$${fmt(stats.epsTTM)}` : "—"],
    ["52-wk high", stats.high52 != null ? `$${fmt(stats.high52)}` : "—"],
    ["52-wk low", stats.low52 != null ? `$${fmt(stats.low52)}` : "—"],
    ["Beta", stats.beta != null ? fmt(stats.beta, 2) : "—"],
    ["Dividend yield", stats.dividendYield != null ? `${fmt(stats.dividendYield, 2)}%` : "—"],
  ];
  return (
    <Card title="Key Stats">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-2 py-0.5" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <span className="text-[11.5px] text-[var(--color-muted)]">{label}</span>
            <span className="text-[12px] font-semibold tabular-nums text-[var(--color-text)]">{value}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ── Analysts ──────────────────────────────────────────────────────────── */

const RATING_ROWS: { key: keyof Pick<AnalystRatings, "strongBuy" | "buy" | "hold" | "sell" | "strongSell">; label: string; color: string }[] = [
  { key: "strongBuy", label: "Strong Buy", color: "var(--color-bull)" },
  { key: "buy", label: "Buy", color: "color-mix(in oklch, var(--color-bull) 70%, var(--color-surface))" },
  { key: "hold", label: "Hold", color: "var(--color-muted)" },
  { key: "sell", label: "Sell", color: "color-mix(in oklch, var(--color-bear) 70%, var(--color-surface))" },
  { key: "strongSell", label: "Strong Sell", color: "var(--color-bear)" },
];

export function AnalystPanel({ analysts, price }: { analysts: AnalystRatings | null; price: number | null }) {
  if (!analysts) return <Card title="Analyst Ratings" empty />;
  const total = analysts.strongBuy + analysts.buy + analysts.hold + analysts.sell + analysts.strongSell;
  const upside = price && price > 0 && analysts.targetMean != null ? ((analysts.targetMean - price) / price) * 100 : null;

  return (
    <Card title="Analyst Ratings">
      <div className="flex flex-col gap-2 mb-4">
        {RATING_ROWS.map((r) => {
          const v = analysts[r.key];
          const pct = total > 0 ? (v / total) * 100 : 0;
          return (
            <div key={r.key} className="grid items-center gap-2" style={{ gridTemplateColumns: "72px 1fr 22px" }}>
              <span className="text-[11px] text-[var(--color-text-secondary)]">{r.label}</span>
              <div className="h-[8px] rounded-full overflow-hidden" style={{ background: "var(--color-surface-2)" }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: r.color }} />
              </div>
              <span className="text-[11px] tabular-nums text-[var(--color-muted)] text-right">{v}</span>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-2 pt-3" style={{ borderTop: "1px solid var(--color-border)" }}>
        <div>
          <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-muted)] mb-0.5">Target</p>
          <p className="text-[13px] font-semibold tabular-nums text-[var(--color-text)]">{analysts.targetMean != null ? `$${fmt(analysts.targetMean)}` : "—"}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-muted)] mb-0.5">Range</p>
          <p className="text-[13px] font-semibold tabular-nums text-[var(--color-text)]">
            {analysts.targetLow != null && analysts.targetHigh != null ? `$${fmt(analysts.targetLow, 0)}–$${fmt(analysts.targetHigh, 0)}` : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--color-muted)] mb-0.5">Upside</p>
          <p className="text-[13px] font-semibold tabular-nums" style={{ color: upside == null ? "var(--color-text)" : upside >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}>
            {upside == null ? "—" : `${upside >= 0 ? "+" : ""}${fmt(upside, 1)}%`}
          </p>
        </div>
      </div>
    </Card>
  );
}

/* ── Fundamentals ──────────────────────────────────────────────────────── */

function TrendBars({ data, label, color }: { data: { year: number; value: number }[]; label: string; color: string }) {
  const recent = data.slice(-5);
  const max = Math.max(...recent.map((d) => Math.abs(d.value)), 1);
  return (
    <div>
      <p className="text-[11px] text-[var(--color-text-secondary)] mb-2">{label}</p>
      <div className="flex items-end gap-2 h-[68px]">
        {recent.map((d) => {
          const h = Math.max((Math.abs(d.value) / max) * 60, 2);
          const neg = d.value < 0;
          return (
            <div key={d.year} className="flex-1 flex flex-col items-center justify-end gap-1">
              <span className="text-[9px] tabular-nums text-[var(--color-muted)]">{compact(d.value)}</span>
              <div className="w-full rounded-t-[3px]" style={{ height: h, background: neg ? "var(--color-bear)" : color }} />
              <span className="text-[9px] tabular-nums text-[var(--color-muted)]">{`'${String(d.year).slice(2)}`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FundamentalsPanel({ fundamentals }: { fundamentals: FundamentalTimeSeries | null }) {
  if (!fundamentals || (fundamentals.revenue.length === 0 && fundamentals.netIncome.length === 0)) {
    return <Card title="Fundamentals" empty />;
  }
  return (
    <Card title="Fundamentals">
      <div className="grid grid-cols-2 gap-5">
        {fundamentals.revenue.length > 0 && <TrendBars data={fundamentals.revenue} label="Revenue" color="var(--color-accent)" />}
        {fundamentals.netIncome.length > 0 && <TrendBars data={fundamentals.netIncome} label="Net income" color="var(--color-bull)" />}
        {fundamentals.operatingCashFlow.length > 0 && <TrendBars data={fundamentals.operatingCashFlow} label="Operating cash flow" color="var(--color-accent-medium)" />}
        {fundamentals.totalDebt.length > 0 && <TrendBars data={fundamentals.totalDebt} label="Total debt" color="var(--color-warn)" />}
      </div>
      <p className="text-[10px] text-[var(--color-muted)] mt-3">Annual figures from SEC EDGAR filings.</p>
    </Card>
  );
}

/* ── Insider ───────────────────────────────────────────────────────────── */

export function InsiderPanel({ trades }: { trades: InsiderTrade[] | null }) {
  if (!trades || trades.length === 0) return <Card title="Insider Activity" empty />;
  return (
    <Card title="Insider Activity">
      <div className="flex flex-col gap-1.5">
        {trades.slice(0, 8).map((t, i) => {
          const buy = t.direction === "buy";
          return (
            <div key={`${t.name}-${t.transactionDate}-${i}`} className="flex items-center justify-between gap-2 py-1" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <div className="min-w-0">
                <p className="text-[11.5px] font-medium text-[var(--color-text)] truncate max-w-[150px]">{t.name}</p>
                <p className="text-[10px] text-[var(--color-muted)]">{t.transactionDate || t.filingDate}</p>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: buy ? "var(--color-bull)" : "var(--color-bear)" }}>
                  {buy ? "Buy" : "Sell"}
                </span>
                <p className="text-[11px] tabular-nums text-[var(--color-text-secondary)]">{compact(Math.abs(t.shares))} sh</p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ── News ──────────────────────────────────────────────────────────────── */

function timeAgo(unixSec: number) {
  if (!unixSec) return "";
  const diff = Date.now() / 1000 - unixSec;
  const h = Math.floor(diff / 3600);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function NewsPanel({ news }: { news: NewsItem[] | null }) {
  if (!news || news.length === 0) return <Card title="Recent News" empty />;
  return (
    <Card title="Recent News">
      <div className="flex flex-col gap-3">
        {news.slice(0, 8).map((n, i) => (
          <a
            key={`${n.url}-${i}`}
            href={n.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block group"
          >
            <p className="text-[12.5px] font-medium leading-snug text-[var(--color-text)] group-hover:text-[var(--color-accent)] transition-colors duration-100">
              {n.headline}
            </p>
            <p className="text-[10.5px] text-[var(--color-muted)] mt-0.5">
              {n.source}{n.source && n.datetime ? " · " : ""}{timeAgo(n.datetime)}
            </p>
          </a>
        ))}
      </div>
    </Card>
  );
}
