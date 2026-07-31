"use client";
import { useState } from "react";
import Sparkline from "@/components/ui/Sparkline";
import type { Regime, Strategy, WatchItem, Order, Fill, BotLogEntry } from "./types";

// ── V10 "Dual Pane" layout ──────────────────────────────────────────────────
// Asymmetric 60/40 split. Left pane changes per tab; the right pane keeps NAV +
// bot pill persistent with a rotating third panel. Recreates the approved
// "Hedge fund - V10 prototype" design against live Finava data.

export type DualTab = "dashboard" | "strategies" | "trading" | "activity";

export interface V10Account {
  nav: number;
  dayPnL: number;
  dayPnLPct: number;
  cash: number;
  buyingPower: number;
  trades: number;
  history: number[];
}
export interface V10Composite {
  bias: Regime;
  avgBull: number;
  avgSideways: number;
  avgBear: number;
  avgSharpe: number;
  equityPct: number;
}
export interface V10Index {
  ticker: string;
  name: string;
  bias: Regime;
  /** Normalized regime mix — bull + sideways + bear always sums to 100. */
  bull: number;
  sideways: number;
  bear: number;
  sharpe: number;
  equity: number;
  px: number;
  dayPct: number;
}
export interface V10Bot {
  running: boolean;
  uptime: string;
  todayTrades: number;
  todayPnL: number;
  cashAllocated: number;
  lastHeartbeat: string;
}

interface Props {
  tab: DualTab;
  onTab: (t: DualTab) => void;
  isLive: boolean;
  asOf: string;
  account: V10Account;
  composite: V10Composite;
  indices: V10Index[];
  bot: V10Bot;
  log: BotLogEntry[];
  strategies: Strategy[];
  watchlist: WatchItem[];
  openOrders: Order[];
  fills: Fill[];
  onToggleStrategy: (id: string) => void;
}

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt = (n: number, d = 0) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtSigned = (n: number, d = 0) =>
  (n >= 0 ? "+" : "−") + fmt(Math.abs(n), d);

const biasCls = (b: Regime) => (b === "Bull" ? "bull" : b === "Bear" ? "bear" : "side");
const pillCls = (b: Regime) => (b === "Bull" ? "pill-bull" : b === "Bear" ? "pill-bear" : "pill-side");

function RegimePill({ bias }: { bias: Regime }) {
  return <span className={`pill ${pillCls(bias)}`}>{bias}</span>;
}

function lvlColor(lvl: BotLogEntry["lvl"]) {
  return lvl === "ORDER" ? "var(--color-accent)"
    : lvl === "SIGNAL" ? "var(--color-bull)"
    : lvl === "RISK" ? "var(--color-bear)"
    : "var(--color-muted)";
}

// ── Persistent right-pane pieces ──────────────────────────────────────────────
function NavCard({ a }: { a: V10Account }) {
  return (
    <div className="nav-card">
      <div className="l">Net portfolio value</div>
      <div className="big">${fmt(a.nav, 2)}</div>
      <div className="pnl">
        <span>{fmtSigned(a.dayPnL, 2)}</span>
        <span className="pct">{fmtSigned(a.dayPnLPct, 2)}%</span>
        <span style={{ color: "color-mix(in oklab, var(--color-on-accent) 70%, transparent)", fontFamily: "var(--font-sans)", fontWeight: 400, fontSize: "var(--text-sm)" }}>today</span>
      </div>
      <div style={{ marginTop: 14 }}>
        <Sparkline
          data={a.history}
          width={300}
          height={40}
          strokeWidth={1.4}
          stroke="color-mix(in oklab, var(--color-bull) 45%, #fff)"
          fill
          className="spark"
        />
      </div>
      <div className="kpis">
        <div>
          <div className="l">Cash</div>
          <div className="v">${fmt(a.cash, 0)}</div>
        </div>
        <div>
          <div className="l">Buying pwr</div>
          <div className="v">${fmt(a.buyingPower, 0)}</div>
        </div>
        <div>
          <div className="l">Trades</div>
          <div className="v">{a.trades}</div>
        </div>
      </div>
    </div>
  );
}

function BotPill({ running, setRunning, bot }: { running: boolean; setRunning: (v: boolean) => void; bot: V10Bot }) {
  return (
    <div className="bot-pill">
      <span className={`bot-led ${running ? "" : "off"}`} />
      <div>
        <div className="bot-title">Bot · {running ? "Running" : "Paused"}</div>
        <div className="bot-meta">
          {bot.uptime} · {bot.todayTrades} trades · today{" "}
          <strong style={{ color: "var(--color-bull)", fontFamily: "var(--font-mono)" }}>{fmtSigned(bot.todayPnL, 2)}</strong>
        </div>
      </div>
      <button
        type="button"
        aria-label={running ? "Pause bot" : "Resume bot"}
        className={`bot-toggle ${running ? "on" : ""}`}
        onClick={() => setRunning(!running)}
      />
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function HFDualPane({
  tab, onTab, isLive, asOf, account: a, composite, indices, bot, log,
  strategies, watchlist, openOrders, fills, onToggleStrategy,
}: Props) {
  const [running, setRunning] = useState(bot.running);
  const [prevBotRunning, setPrevBotRunning] = useState(bot.running);
  const [stratFilter, setStratFilter] = useState<"all" | "live" | "paper" | "draft">("all");
  const [logFilter, setLogFilter] = useState<"all" | "order" | "signal" | "risk" | "info">("all");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [ticker, setTicker] = useState("AAPL");
  const [qty, setQty] = useState("25");
  const [limit, setLimit] = useState("192.40");

  // Re-sync the local toggle when the bot's running state changes upstream
  // (render-phase reset, no effect).
  if (bot.running !== prevBotRunning) {
    setPrevBotRunning(bot.running);
    setRunning(bot.running);
  }

  const armedCount = strategies.filter((s) => s.active).length;
  const headlineWord = composite.bias === "Bull" ? "rallies" : composite.bias === "Bear" ? "wavers" : "drifts";

  const tape = [...watchlist, ...watchlist].map((w, i) => (
    <span key={i}>
      <strong>{w.ticker}</strong>{" "}
      {w.px.toFixed(2)}{" "}
      <span className={w.dayPct >= 0 ? "pos" : "neg"}>{fmtSigned(w.dayPct, 2)}%</span>
      <span className="sep">·</span>
    </span>
  ));

  // ── DASHBOARD LEFT ──
  const DashboardLeft = (
    <>
      <div>
        <div className="kicker">— Composite Markov Read —</div>
        <h1 className="headline">
          Tape <em className={biasCls(composite.bias)}>{headlineWord}</em>;
          bot holds <em className="bull">{composite.equityPct}%</em> equity.
        </h1>
        <p className="dek">
          Across SPY, QQQ and DIA the long-run stationary distribution sits at{" "}
          {composite.avgBull.toFixed(1)}% Bull, {composite.avgSideways.toFixed(1)}% Sideways and{" "}
          {composite.avgBear.toFixed(1)}% Bear — a mean-reverting regime our walk-forward tests
          Sharpe at {composite.avgSharpe.toFixed(2)}.
        </p>
        <div className="byline">
          By <em>Markov &amp; HMM ensemble</em> · 5-yr lookback · {bot.lastHeartbeat}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="t">Index regime · 5y posterior</span>
          <span style={{ flex: 1 }} />
          <span className="m">walk-forward</span>
        </div>
        <div className="card-body">
          <div className="reg-bars">
            {indices.map((i) => (
              <div key={i.ticker} className="reg-bar">
                <div className="nm">
                  <span className="tk">{i.ticker}</span>
                  <span className="nme">{i.name}</span>
                </div>
                <div
                  className="reg-track"
                  title={`Current: ${i.bias} · Bull ${i.bull.toFixed(0)}% · Sideways ${i.sideways.toFixed(0)}% · Bear ${i.bear.toFixed(0)}%`}
                >
                  {/* Active regime segment is full-strength; the rest dim back so the
                      bar visually agrees with the Bull/Bear pill on the right. */}
                  <div style={{ width: `${i.bull}%`, height: "100%", background: "var(--color-bull)", opacity: i.bias === "Bull" ? 1 : 0.28, boxShadow: i.bias === "Bull" ? "inset 0 0 0 1.5px color-mix(in oklab, var(--color-on-accent) 55%, transparent)" : "none", transition: "opacity 200ms ease" }} />
                  <div style={{ width: `${i.sideways}%`, height: "100%", background: "var(--color-warn)", opacity: i.bias === "Sideways" ? 1 : 0.28, boxShadow: i.bias === "Sideways" ? "inset 0 0 0 1.5px color-mix(in oklab, var(--color-on-accent) 55%, transparent)" : "none", transition: "opacity 200ms ease" }} />
                  <div style={{ width: `${i.bear}%`, height: "100%", background: "var(--color-bear)", opacity: i.bias === "Bear" ? 1 : 0.28, boxShadow: i.bias === "Bear" ? "inset 0 0 0 1.5px color-mix(in oklab, var(--color-on-accent) 55%, transparent)" : "none", transition: "opacity 200ms ease" }} />
                </div>
                <div style={{ textAlign: "right" }}><RegimePill bias={i.bias} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="idx-grid">
        {indices.map((i) => (
          <div key={i.ticker} className="idx-tile">
            <div className="tk">{i.ticker}</div>
            <div className="nm">{i.name}</div>
            <div className="px">
              {i.px > 0 ? `$${i.px.toFixed(2)}` : <span style={{ color: "var(--color-text-secondary)" }}>—</span>}
            </div>
            <div className="day" style={{ color: i.px <= 0 ? "var(--color-text-secondary)" : i.dayPct >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}>
              {i.px > 0 ? `${fmtSigned(i.dayPct, 2)}%` : "—"}
            </div>
            <div className="row">
              <span className="rec">Rec <strong>{i.equity}%</strong></span>
              <span className="rec">Shp <strong>{i.sharpe.toFixed(2)}</strong></span>
            </div>
          </div>
        ))}
      </div>
    </>
  );

  // ── STRATEGIES LEFT ──
  const tagCounts = {
    live: strategies.filter((s) => s.tag === "Live").length,
    paper: strategies.filter((s) => s.tag === "Paper").length,
    draft: strategies.filter((s) => s.tag === "Draft").length,
  };
  const filteredStrategies = strategies.filter((s) =>
    stratFilter === "all" ? true : s.tag.toLowerCase() === stratFilter,
  );

  const StrategiesLeft = (
    <>
      <div>
        <div className="eyebrow">Strategies · Markov-gated</div>
        <h1 className="headline" style={{ maxWidth: "26ch" }}>
          {armedCount} armed; <em className="bull">${fmt(bot.cashAllocated)}</em> allocated of <em>${fmt(a.nav)}</em> NAV.
        </h1>
      </div>

      <div className="filters">
        {([
          ["all", "All", strategies.length],
          ["live", "Live", tagCounts.live],
          ["paper", "Paper", tagCounts.paper],
          ["draft", "Draft", tagCounts.draft],
        ] as const).map(([k, l, c]) => (
          <button key={k} className={`filter-chip ${stratFilter === k ? "on" : ""}`} onClick={() => setStratFilter(k)}>
            {l}<span className="count">{c}</span>
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button className="filter-chip" style={{ background: "var(--color-accent)", color: "var(--color-on-accent)", borderColor: "var(--color-accent)", fontWeight: 600 }}>+ New strategy</button>
      </div>

      <div className="card">
        <div className="card-body flush">
          {filteredStrategies.map((s) => {
            const cls = s.tag === "Live" ? "live" : s.tag === "Paper" ? "paper" : "draft";
            return (
              <div key={s.id} className="strat-full">
                <div>
                  <span className="name">{s.name}<span className={`tag-soft ${cls}`}>{s.tag.toUpperCase()}</span></span>
                  <div className="desc">{s.desc}</div>
                  <div className="tk-list">
                    {s.tickers.map((t) => (
                      <span key={t} className="tk" style={{ fontSize: "var(--text-micro)" }}>{t}</span>
                    ))}
                  </div>
                </div>
                <div className="stat" style={{ textAlign: "right" }}>
                  <div className="l">Sharpe</div>
                  <div className="v">{s.sharpe.toFixed(2)}</div>
                </div>
                <div className="stat" style={{ textAlign: "right" }}>
                  <div className="l">CAGR</div>
                  <div className="v" style={{ color: "var(--color-bull)" }}>+{s.cagr.toFixed(1)}%</div>
                </div>
                <div className="stat" style={{ textAlign: "right" }}>
                  <div className="l">Max DD</div>
                  <div className="v" style={{ color: "var(--color-bear)" }}>{s.maxDD.toFixed(1)}%</div>
                </div>
                <div className="stat" style={{ textAlign: "right" }}>
                  <div className="l">Win</div>
                  <div className="v">{s.winRate.toFixed(0)}%</div>
                </div>
                <button
                  type="button"
                  aria-label={s.active ? `Disarm ${s.name}` : `Arm ${s.name}`}
                  className={`arm ${s.active ? "on" : ""}`}
                  onClick={() => onToggleStrategy(s.id)}
                />
              </div>
            );
          })}
          {filteredStrategies.length === 0 && (
            <div className="empty-note">No strategies in this filter.</div>
          )}
        </div>
      </div>
    </>
  );

  // ── TRADING LEFT ──
  const estValue = (parseFloat(qty) * parseFloat(limit)) || 0;
  const TradingLeft = (
    <>
      <div>
        <div className="eyebrow">Manual trade · Alpaca paper</div>
        <h1 className="headline" style={{ maxWidth: "26ch" }}>
          ${fmt(a.buyingPower)} buying power · <em className="bull">{armedCount} bots armed</em>
        </h1>
        <p className="dek" style={{ fontSize: "var(--text-sm)" }}>
          Manual orders bypass strategy logic but still honor bot guardrails — concentration caps, regime gates, max daily DD.
        </p>
      </div>

      <div className="card">
        <div className="card-head"><span className="t">New order</span></div>
        <div className="card-body">
          <div className="ticket">
            <div className="field">
              <label>Ticker</label>
              <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} />
            </div>
            <div className="field">
              <label>Side</label>
              <div className="side-pick">
                <button className={`buy ${side === "BUY" ? "on" : ""}`} onClick={() => setSide("BUY")}>BUY</button>
                <button className={`sell ${side === "SELL" ? "on" : ""}`} onClick={() => setSide("SELL")}>SELL</button>
              </div>
            </div>
            <div className="field">
              <label>Qty</label>
              <input value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="field">
              <label>Type</label>
              <select defaultValue="LMT"><option>LMT</option><option>MKT</option><option>STP</option></select>
            </div>
            <div className="field">
              <label>Limit px</label>
              <input value={limit} onChange={(e) => setLimit(e.target.value)} />
            </div>
            <div className="field">
              <label>TIF</label>
              <select defaultValue="DAY"><option>DAY</option><option>GTC</option><option>IOC</option></select>
            </div>
          </div>
          <div className="ticket-foot">
            <div className="est">Est. value <strong>${fmt(estValue, 2)}</strong></div>
            <div className="est" style={{ color: "var(--color-muted)" }}>· Concentration check pending</div>
            <button className={`submit ${side === "SELL" ? "sell" : ""}`}>
              {side} {qty} {ticker} @ ${limit}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><span className="t">Watchlist</span><span style={{ flex: 1 }} /><span className="m">live</span></div>
        <div className="card-body flush">
          <table className="t">
            <thead>
              <tr>
                <th>Ticker</th>
                <th className="r">Last</th>
                <th className="r">Day</th>
                <th className="r">Bid</th>
                <th className="r">Ask</th>
                <th>Signal</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {watchlist.map((w) => (
                <tr key={w.ticker}>
                  <td>
                    <span className="tk">{w.ticker}</span>{" "}
                    <span style={{ color: "var(--color-muted)", fontSize: "var(--text-meta)" }}>{w.name}</span>
                  </td>
                  <td className="r">${w.px.toFixed(2)}</td>
                  <td className="r" style={{ color: w.dayPct >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}>{fmtSigned(w.dayPct, 2)}%</td>
                  <td className="r" style={{ color: "var(--color-muted)" }}>{w.bid.toFixed(2)}</td>
                  <td className="r" style={{ color: "var(--color-muted)" }}>{w.ask.toFixed(2)}</td>
                  <td><RegimePill bias={w.signal} /></td>
                  <td className="r">
                    <button className="trade-btn" onClick={() => { setTicker(w.ticker); setLimit(w.px.toFixed(2)); }}>
                      Trade
                    </button>
                  </td>
                </tr>
              ))}
              {watchlist.length === 0 && (
                <tr><td colSpan={7} className="empty-note">No quotes yet — arm a strategy to populate the watchlist.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );

  // ── ACTIVITY LEFT ──
  const logCounts = {
    all: log.length,
    order: log.filter((e) => e.lvl === "ORDER").length,
    signal: log.filter((e) => e.lvl === "SIGNAL").length,
    risk: log.filter((e) => e.lvl === "RISK").length,
    info: log.filter((e) => e.lvl === "INFO").length,
  };
  const filteredLog = log.filter((e) => (logFilter === "all" ? true : e.lvl === logFilter.toUpperCase()));

  const ActivityLeft = (
    <>
      <div>
        <div className="eyebrow">Activity · today</div>
        <h1 className="headline" style={{ maxWidth: "26ch" }}>
          {log.length} events · <em className="bull">{logCounts.order} orders</em> · {logCounts.signal} signals
        </h1>
      </div>

      <div className="filters">
        {([
          ["all", "All", logCounts.all],
          ["order", "Orders", logCounts.order],
          ["signal", "Signals", logCounts.signal],
          ["risk", "Risk", logCounts.risk],
          ["info", "Info", logCounts.info],
        ] as const).map(([k, l, c]) => (
          <button key={k} className={`filter-chip ${logFilter === k ? "on" : ""}`} onClick={() => setLogFilter(k)}>
            {l}<span className="count">{c}</span>
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button className="filter-chip">Export CSV</button>
      </div>

      <div className="card">
        <div className="card-body flush">
          {filteredLog.map((e, i) => {
            const c = lvlColor(e.lvl);
            return (
              <div key={i} className="log-row">
                <span className="ts">{e.ts}</span>
                <span className="lvl-pill" style={{ color: c, background: `color-mix(in oklab, ${c} 10%, transparent)` }}>{e.lvl}</span>
                <span className="msg">{e.msg}</span>
              </div>
            );
          })}
          {filteredLog.length === 0 && (
            <div className="empty-note">No activity yet. Start the bot to see live order, signal, and risk events.</div>
          )}
        </div>
      </div>
    </>
  );

  // ── RIGHT PANE — rotating third panel ──
  const RightStrategiesMini = (
    <div className="card" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div className="card-head">
        <span className="t">Strategies</span>
        <span style={{ flex: 1 }} />
        <span className="m">{armedCount} armed</span>
      </div>
      <div style={{ overflow: "auto", flex: 1 }}>
        {strategies.slice(0, 5).map((s) => {
          const cls = s.tag === "Live" ? "live" : s.tag === "Paper" ? "paper" : "draft";
          return (
            <div key={s.id} className="strat-row">
              <div>
                <span className="strat-name">{s.name}<span className={`tag-soft ${cls}`}>{s.tag.toUpperCase()}</span></span>
                <div className="strat-desc">
                  Shp {s.sharpe.toFixed(2)} · CAGR <span style={{ color: "var(--color-bull)" }}>+{s.cagr.toFixed(1)}%</span> · Win {s.winRate.toFixed(0)}%
                </div>
              </div>
              <button
                type="button"
                aria-label={s.active ? `Disarm ${s.name}` : `Arm ${s.name}`}
                className={`arm ${s.active ? "on" : ""}`}
                onClick={() => onToggleStrategy(s.id)}
              />
            </div>
          );
        })}
        {strategies.length === 0 && <div className="empty-note">No strategies yet.</div>}
      </div>
    </div>
  );

  const RightTodayMini = (
    <div className="card">
      <div className="card-head"><span className="t">Today</span><span style={{ flex: 1 }} /><span className="m">since 09:35 ET</span></div>
      <div className="summary-strip">
        <div className="it">
          <div className="l">P&amp;L</div>
          <div className="v up">{fmtSigned(bot.todayPnL, 2)}</div>
        </div>
        <div className="it">
          <div className="l">Trades</div>
          <div className="v">{bot.todayTrades}</div>
        </div>
        <div className="it">
          <div className="l">Composite</div>
          <div className="v"><RegimePill bias={composite.bias} /></div>
        </div>
        <div className="it">
          <div className="l">Rec equity</div>
          <div className="v">{composite.equityPct}%</div>
        </div>
      </div>
      <div className="card-body" style={{ borderTop: "1px solid var(--color-border)" }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Last signal</div>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
          {log.find((e) => e.lvl === "SIGNAL") ? (
            <>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-bull)", fontWeight: 700, fontSize: "var(--text-meta)" }}>
                SIGNAL {log.find((e) => e.lvl === "SIGNAL")!.ts}
              </span><br />
              {log.find((e) => e.lvl === "SIGNAL")!.msg}
            </>
          ) : (
            <span style={{ color: "var(--color-muted)" }}>No signals yet today.</span>
          )}
        </div>
      </div>
    </div>
  );

  const RightOpenOrders = (
    <div className="card" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div className="card-head">
        <span className="t">Open orders</span>
        <span style={{ flex: 1 }} />
        <span className="m">{openOrders.length}</span>
      </div>
      <div style={{ overflow: "auto", flex: 1 }}>
        {openOrders.map((o) => (
          <div key={o.id} style={{ padding: "12px 18px", borderBottom: "1px solid var(--color-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "var(--text-micro)", fontWeight: 700, letterSpacing: "0.1em", color: o.side === "BUY" ? "var(--color-bull)" : "var(--color-bear)" }}>
                {o.side}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", fontWeight: 700 }}>
                {o.qty} {o.ticker}
              </span>
              <span style={{ color: "var(--color-muted)", fontSize: "var(--text-meta)" }}>@ ${o.px == null ? "MKT" : o.px.toFixed(2)} {o.type}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: "var(--text-micro)", fontWeight: 700, letterSpacing: "0.1em", padding: "2px 7px", borderRadius: "var(--radius-xs)", color: o.status === "Working" ? "var(--color-accent)" : "var(--color-warn)", background: o.status === "Working" ? "color-mix(in oklab, var(--color-accent) 10%, transparent)" : "color-mix(in oklab, var(--color-warn) 10%, transparent)" }}>
                {o.status.toUpperCase()}
              </span>
            </div>
            <div style={{ fontSize: "var(--text-meta)", color: "var(--color-muted)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
              {o.id} · {o.tif}{o.filled > 0 ? ` · ${o.filled}/${o.qty} filled` : ""}
            </div>
          </div>
        ))}
        {openOrders.length === 0 && <div className="empty-note">No open orders.</div>}
      </div>
    </div>
  );

  const RightEventBreakdown = (
    <div className="card">
      <div className="card-head"><span className="t">Event breakdown</span><span style={{ flex: 1 }} /><span className="m">today</span></div>
      <div>
        {([
          ["ORDER", "Orders", logCounts.order, "var(--color-accent)"],
          ["SIGNAL", "Signals", logCounts.signal, "var(--color-bull)"],
          ["RISK", "Risk", logCounts.risk, "var(--color-bear)"],
          ["INFO", "Info", logCounts.info, "var(--color-muted)"],
        ] as const).map(([k, l, c, color]) => (
          <div key={k} className="breakdown-row">
            <div className="swatch" style={{ background: color }} />
            <div>{l}</div>
            <div className="cnt" style={{ color }}>{c}</div>
          </div>
        ))}
      </div>
      <div className="card-body" style={{ borderTop: "1px solid var(--color-border)" }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Bot P&amp;L today</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-display)", fontWeight: 800, color: "var(--color-bull)" }}>
          {fmtSigned(bot.todayPnL, 2)}
        </div>
        <div style={{ fontSize: "var(--text-meta)", color: "var(--color-muted)", marginTop: 4 }}>
          across {bot.todayTrades} trades · {fills.length} fills
        </div>
      </div>
    </div>
  );

  return (
    <div className="v10">
      <div className="top">
        <div className="brand">
          <span className="mast">Finava HF</span>
          <span className="vol">{asOf}</span>
        </div>
        {([
          ["dashboard", "Dashboard"],
          ["strategies", "Strategies"],
          ["trading", "Trading"],
          ["activity", "Activity"],
        ] as const).map(([k, l]) => (
          <button key={k} className={`tab ${tab === k ? "active" : ""}`} onClick={() => onTab(k)}>{l}</button>
        ))}
        <div className="right">
          {isLive ? (
            <span className="pill-soft live"><span className="led" />Live · Alpaca paper</span>
          ) : (
            <span className="pill-soft demo"><span className="led" />Demo · sample data</span>
          )}
        </div>
      </div>

      <div className="tape">
        <div className="marquee">{tape}{tape}</div>
      </div>

      <div className="panes">
        <div className="pane left">
          {tab === "dashboard" && DashboardLeft}
          {tab === "strategies" && StrategiesLeft}
          {tab === "trading" && TradingLeft}
          {tab === "activity" && ActivityLeft}
        </div>
        <div className="pane right">
          <NavCard a={a} />
          <BotPill running={running} setRunning={setRunning} bot={bot} />
          {tab === "dashboard" && RightStrategiesMini}
          {tab === "strategies" && RightTodayMini}
          {tab === "trading" && RightOpenOrders}
          {tab === "activity" && RightEventBreakdown}
        </div>
      </div>
    </div>
  );
}
