"use client";
import useSWR from "swr";
import type { HFTab, HFData, Regime } from "./types";
import type { AlpacaAccount } from "@/app/api/alpaca/account/route";
import { authFetcher } from "@/lib/authFetch";

const fetcher = authFetcher;

function fmt(n: number, d = 0) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtSigned(n: number, d = 0) {
  return (n >= 0 ? "+" : "") + fmt(Math.abs(n), d);
}

function RegimePill({ bias }: { bias: Regime }) {
  const cls = bias.toLowerCase();
  return <span className={`hf-regime hf-regime-${cls}`}>{bias}</span>;
}

function StatCell({
  label, value, sub, accent,
}: {
  label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div className="hf-cell">
      <div className="hf-cell-label">{label}</div>
      <div className="hf-cell-value" style={{ color: accent ?? "var(--color-text)" }}>{value}</div>
      {sub && <div className="hf-cell-sub">{sub}</div>}
    </div>
  );
}

// ── Mini equity sparkline ─────────────────────────────────────────────────────

function Sparkline({ data, positive }: { data: { ts: number; equity: number }[]; positive: boolean }) {
  if (data.length < 2) return null;
  const W = 160, H = 36;
  const equities = data.map((d) => d.equity);
  const minE = Math.min(...equities);
  const maxE = Math.max(...equities);
  const range = maxE - minE || 1;
  const pts = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - ((d.equity - minE) / range) * (H - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const color = positive ? "var(--color-bull)" : "var(--color-bear)";
  return (
    <svg width={W} height={H} style={{ display: "block", flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

// ── Alpaca account hero ───────────────────────────────────────────────────────

function AccountHero() {
  const { data, isLoading } = useSWR<AlpacaAccount>("/api/alpaca/account", fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: false,
  });

  const live = data?.live === true ? data : null;
  const positive = live ? live.dayPl >= 0 : true;

  return (
    <div className="hf-card">
      <div className="hf-card-head">
        <span className="hf-card-title">Paper account</span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            padding: "2px 7px",
            borderRadius: 5,
            background: "color-mix(in srgb, var(--color-warn) 10%, transparent)",
            color: "var(--color-warn)",
            border: "1px solid color-mix(in srgb, var(--color-warn) 25%, transparent)",
            marginLeft: 4,
          }}
        >
          ALPACA PAPER
        </span>
        <div className="hf-grow" />
        {isLoading && (
          <span style={{ fontSize: 11, color: "var(--color-muted)" }}>Refreshing…</span>
        )}
        {data && !data.live && (
          <span style={{ fontSize: 11, color: "var(--color-bear)" }}>{data.error}</span>
        )}
        <span style={{ fontSize: 11, color: "var(--color-muted)" }}>Refreshes every 30 s</span>
      </div>

      <div style={{ padding: "14px 16px" }}>
        {/* Top row: big equity + sparkline + day P&L */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div className="hf-bot-lbl" style={{ marginBottom: 3 }}>Portfolio value</div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.01em" }}>
              {live ? `$${fmt(live.equity, 2)}` : isLoading ? "—" : "—"}
            </div>
            {live && (
              <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
                Last close ${fmt(live.lastEquity, 2)}
              </div>
            )}
          </div>

          {live && live.history.length > 1 && (
            <Sparkline data={live.history} positive={positive} />
          )}

          <div style={{ textAlign: "right" }}>
            <div className="hf-bot-lbl" style={{ marginBottom: 3 }}>Day P&L</div>
            <div
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 22,
                fontWeight: 700,
                lineHeight: 1,
                color: live ? (positive ? "var(--color-bull)" : "var(--color-bear)") : "var(--color-muted)",
              }}
            >
              {live ? `${fmtSigned(live.dayPl, 2)}` : "—"}
            </div>
            {live && (
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  marginTop: 3,
                  color: positive ? "var(--color-bull)" : "var(--color-bear)",
                }}
              >
                {fmtSigned(live.dayPlPct, 2)}%
              </div>
            )}
          </div>
        </div>

        {/* Bottom stat row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 0,
            borderTop: "1px solid var(--color-border)",
            paddingTop: 12,
          }}
        >
          {[
            { label: "Cash",          value: live ? `$${fmt(live.cash, 0)}`          : "—" },
            { label: "Buying power",  value: live ? `$${fmt(live.buyingPower, 0)}`   : "—" },
            { label: "Unrealized P&L",value: live ? `${fmtSigned(live.unrealizedPl, 2)}` : "—",
              accent: live ? (live.unrealizedPl >= 0 ? "var(--color-bull)" : "var(--color-bear)") : undefined },
            { label: "Trades today",  value: live ? String(live.dayTradeCount)       : "—" },
          ].map(({ label, value, accent }) => (
            <div key={label}>
              <div className="hf-bot-lbl" style={{ marginBottom: 3 }}>{label}</div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  fontWeight: 600,
                  color: accent ?? "var(--color-text)",
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main overview ─────────────────────────────────────────────────────────────

interface Props {
  data: HFData;
  onTab: (t: HFTab) => void;
}

export function HFOverview({ data, onTab }: Props) {
  const m   = data.markov.composite;
  const bot = data.bot;

  const biasAccent =
    m.bias === "Bull" ? "var(--color-bull)" :
    m.bias === "Bear" ? "var(--color-bear)" :
                        "var(--color-warn)";

  const now = new Date().toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });

  return (
    <>
      {/* Alpaca paper account hero */}
      <AccountHero />

      {/* Eyebrow + headline */}
      <div>
        <div className="hf-eyebrow">Hedge Fund — {now}</div>
        <h2 className="hf-headline">
          Composite read: market is {m.bias.toLowerCase()}, run {m.equityPct}% equity.
        </h2>
        <p className="hf-dek">
          Aggregating Markov regime posteriors across SPY, QQQ and DIA.{" "}
          {data.strategies.filter((s) => s.active).length} strategies live, the bot has
          been running {bot.uptime}, sitting on ${fmt(bot.cashFree)} deployable cash.
        </p>
      </div>

      {/* 4-up regime stat strip */}
      <div className="hf-strip">
        <StatCell
          label="Market Bias"
          value={m.bias}
          sub="SPY · QQQ · DIA composite"
          accent={biasAccent}
        />
        <StatCell
          label="Avg Bull Prob."
          value={`${m.avgBull.toFixed(1)}%`}
          sub="long-run stationary"
          accent="var(--color-bull)"
        />
        <StatCell
          label="Avg Sharpe (WF)"
          value={m.avgSharpe.toFixed(2)}
          sub="walk-forward, no lookahead"
          accent="var(--color-accent)"
        />
        <StatCell
          label="Rec. Equity"
          value={`${m.equityPct}%`}
          sub="regime-weighted"
          accent="var(--color-accent)"
        />
      </div>

      {/* Quick actions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <div className="hf-card" style={{ cursor: "pointer" }} onClick={() => onTab("bot")}>
          <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div className="hf-bot-lbl" style={{ marginBottom: 3 }}>Trading bot</div>
              <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                {bot.status === "Running" && (
                  <span style={{ width: 6, height: 6, borderRadius: "99px", background: "var(--color-bull)", display: "inline-block", flexShrink: 0 }} />
                )}
                {bot.status}
              </div>
              <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 2 }}>
                {bot.uptime} uptime · {bot.todayTrades} trades today
              </div>
            </div>
            <button className="hf-btn" onClick={(e) => { e.stopPropagation(); onTab("bot"); }}>Open →</button>
          </div>
        </div>

        <div className="hf-card" style={{ cursor: "pointer" }} onClick={() => onTab("strategies")}>
          <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div className="hf-bot-lbl" style={{ marginBottom: 3 }}>Strategies</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {data.strategies.filter((s) => s.active).length} active
              </div>
              <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 2 }}>
                {data.strategies.length} total in library
              </div>
            </div>
            <button className="hf-btn" onClick={(e) => { e.stopPropagation(); onTab("strategies"); }}>Manage →</button>
          </div>
        </div>

        <div className="hf-card" style={{ cursor: "pointer" }} onClick={() => onTab("trading")}>
          <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div className="hf-bot-lbl" style={{ marginBottom: 3 }}>Manual trading</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>${fmt(data.trading.buyingPower)} buying power</div>
              <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 2 }}>
                {data.trading.openOrders.length} open orders
              </div>
            </div>
            <button className="hf-btn" onClick={(e) => { e.stopPropagation(); onTab("trading"); }}>Trade →</button>
          </div>
        </div>
      </div>

      {/* Two-column: bot live status + index regime snapshot */}
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 14 }}>

        {/* Bot + active strategies */}
        <div className="hf-card">
          <div className="hf-card-head">
            <span className="hf-card-title">Live status</span>
            <div className="hf-grow" />
            <button className="hf-btn hf-btn-ghost" onClick={() => onTab("bot")}>Open bot →</button>
          </div>
          <div style={{ padding: 14 }}>
            <div className="hf-bot-bar" style={{ marginBottom: 12 }}>
              <div className={bot.status === "Running" ? "hf-bot-light" : "hf-bot-light-off"} />
              <div>
                <div className="hf-bot-lbl">Bot</div>
                <div className="hf-bot-val">{bot.status} · {bot.uptime}</div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 24 }}>
                <div>
                  <div className="hf-bot-lbl">Today P&L</div>
                  <div className="hf-bot-val hf-up">{fmtSigned(bot.todayPnL)}</div>
                </div>
                <div>
                  <div className="hf-bot-lbl">Trades</div>
                  <div className="hf-bot-val">{bot.todayTrades}</div>
                </div>
              </div>
            </div>

            {data.strategies.filter((s) => s.active).map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "8px 0", borderBottom: "1px solid var(--color-border)",
                }}
              >
                <span className="hf-tag hf-tag-live">Live</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                <span style={{ fontSize: 11, color: "var(--color-muted)", fontFamily: "var(--font-mono)", marginLeft: "auto" }}>
                  {s.lastTrade}
                </span>
                <span style={{ display: "flex", gap: 14, fontSize: 11.5 }}>
                  <span>
                    <span style={{ color: "var(--color-muted)" }}>Sharpe </span>
                    <strong>{s.sharpe.toFixed(2)}</strong>
                  </span>
                  <span>
                    <span style={{ color: "var(--color-muted)" }}>CAGR </span>
                    <strong className="hf-up">+{s.cagr.toFixed(1)}%</strong>
                  </span>
                </span>
              </div>
            ))}

            {data.strategies.filter((s) => s.active).length === 0 && (
              <p style={{ fontSize: 12, color: "var(--color-muted)", padding: "8px 0" }}>
                No active strategies. Go to Strategies to activate one.
              </p>
            )}
          </div>
        </div>

        {/* Index regime snapshot */}
        <div className="hf-card">
          <div className="hf-card-head">
            <span className="hf-card-title">Index regime read</span>
            <div className="hf-grow" />
            <button className="hf-btn hf-btn-ghost" onClick={() => onTab("strategies")}>Open Strategies →</button>
          </div>
          <table className="hf-table">
            <thead>
              <tr>
                <th>Index</th>
                <th>Bias</th>
                <th className="col-r">Bull %</th>
                <th className="col-r">Sharpe</th>
                <th className="col-r">Equity</th>
              </tr>
            </thead>
            <tbody>
              {data.markov.tickers.map((t) => (
                <tr key={t.ticker}>
                  <td>
                    <span className="tk-chip">{t.ticker}</span>{" "}
                    <span style={{ fontSize: 11, color: "var(--color-muted)", marginLeft: 4 }}>{t.label}</span>
                  </td>
                  <td><RegimePill bias={t.bias} /></td>
                  <td className="col-r col-mono">{t.stationary.Bull.toFixed(1)}%</td>
                  <td className="col-r col-mono">{t.backtest.sharpe.toFixed(2)}</td>
                  <td className="col-r col-mono"><strong>{t.allocationRec.equityPct}%</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
