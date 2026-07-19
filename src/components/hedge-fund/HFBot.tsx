"use client";
import { useState } from "react";
import useSWR from "swr";
import type { BotSection, Strategy, StrategyTag } from "./types";
import type { BotResponse } from "@/app/api/bot/route";
import { authFetcher } from "@/lib/authFetch";

const botFetcher = authFetcher;

function fmt(n: number, d = 0) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtSigned(n: number, d = 0) {
  return (n >= 0 ? "+" : "") + fmt(Math.abs(n), d);
}

function StatCell({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="hf-cell">
      <div className="hf-cell-label">{label}</div>
      <div className="hf-cell-value" style={{ color: accent ?? "var(--color-text)" }}>{value}</div>
      {sub && <div className="hf-cell-sub">{sub}</div>}
    </div>
  );
}

function TagBadge({ tag }: { tag: StrategyTag }) {
  const cls =
    tag === "Live"  ? "hf-tag hf-tag-live"  :
    tag === "Paper" ? "hf-tag hf-tag-paper" :
                      "hf-tag hf-tag-draft";
  return <span className={cls}>{tag}</span>;
}

// ── Strategy arm row (inline expand + two-step confirm) ───────────────────────

function ArmRow({ strategy }: { strategy: Strategy }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [armed, setArmed] = useState(strategy.active);

  function handleArm() {
    setArmed(true);
    setOpen(false);
    setConfirming(false);
  }

  return (
    <div style={{ borderBottom: "1px solid var(--color-border)" }}>
      {/* Collapsed row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "11px 14px",
          cursor: "pointer",
        }}
        onClick={() => { setOpen((v) => !v); setConfirming(false); }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>
              {strategy.name}
            </span>
            <TagBadge tag={strategy.tag} />
            {armed && (
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--color-bull)", letterSpacing: "0.1em" }}>
                ARMED
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 20, fontSize: 11.5 }}>
          <span>
            <span style={{ color: "var(--color-muted)" }}>Sharpe </span>
            <strong>{strategy.sharpe.toFixed(2)}</strong>
          </span>
          <span>
            <span style={{ color: "var(--color-muted)" }}>CAGR </span>
            <strong className="hf-up">+{strategy.cagr.toFixed(1)}%</strong>
          </span>
        </div>
        <span style={{ fontSize: 12, color: "var(--color-muted)", marginLeft: 4 }}>
          {open ? "▲" : "▼"}
        </span>
      </div>

      {/* Expanded detail */}
      {open && (
        <div
          style={{
            padding: "14px 14px 16px",
            borderTop: "1px solid var(--color-border)",
            background: "var(--color-surface)",
          }}
        >
          <p style={{ fontSize: 12.5, color: "var(--color-text-secondary)", marginBottom: 14, lineHeight: 1.55 }}>
            {strategy.desc}
          </p>
          <div style={{ display: "flex", gap: 24, marginBottom: 16 }}>
            <div>
              <div className="hf-bot-lbl">Sharpe</div>
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "var(--font-serif)" }}>
                {strategy.sharpe.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="hf-bot-lbl">CAGR</div>
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "var(--font-serif)", color: "var(--color-bull)" }}>
                +{strategy.cagr.toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="hf-bot-lbl">Max DD</div>
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "var(--font-serif)", color: "var(--color-bear)" }}>
                {strategy.maxDD.toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="hf-bot-lbl">Win %</div>
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "var(--font-serif)" }}>
                {strategy.winRate.toFixed(1)}%
              </div>
            </div>
          </div>

          {!confirming ? (
            <button className="hf-btn hf-btn-primary" onClick={() => setConfirming(true)}>
              Run this strategy
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "var(--color-warn)", fontWeight: 600 }}>
                This will arm the bot with <strong>{strategy.name}</strong>. Existing positions are unaffected.
              </span>
              <button className="hf-btn hf-btn-primary" onClick={handleArm}>
                I confirm — Launch
              </button>
              <button className="hf-btn hf-btn-ghost" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface Props {
  bot: BotSection;
  strategies?: Strategy[];
  onPause?: () => void;
  onKill?: () => void;
}

export function HFBot({ bot: mockBot, strategies = [], onPause, onKill }: Props) {
  const { data: apiResp } = useSWR<BotResponse>("/api/bot", botFetcher, {
    refreshInterval: 5_000,
    revalidateOnFocus: false,
  });

  const isLive = apiResp?.live === true;
  const bot: BotSection = (isLive ? apiResp.data : null) ?? mockBot;

  const isRunning = bot.status === "Running";
  const [schedulePart0, schedulePart1] = bot.schedule.split(" · ");

  return (
    <>
      {/* Live / Demo badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.04em",
            padding: "2px 8px",
            borderRadius: 6,
            background: isLive
              ? "color-mix(in srgb, var(--color-bull) 12%, transparent)"
              : "color-mix(in srgb, var(--color-warn) 10%, transparent)",
            color: isLive ? "var(--color-bull)" : "var(--color-warn)",
            border: `1px solid ${
              isLive
                ? "color-mix(in srgb, var(--color-bull) 25%, transparent)"
                : "color-mix(in srgb, var(--color-warn) 25%, transparent)"
            }`,
          }}
        >
          {isLive ? "LIVE" : "DEMO"}
        </span>
        {isLive ? (
          <span style={{ fontSize: 11, color: "var(--color-muted)" }}>
            Alpaca Paper · refreshes every 5 s
          </span>
        ) : (
          <span style={{ fontSize: 11, color: "var(--color-muted)" }}>
            Run <code style={{ fontSize: 10 }}>python main.py</code> in{" "}
            <em>trading bot 1.0/</em> to see live data
          </span>
        )}
      </div>

      {/* Status bar */}
      <div className="hf-bot-bar">
        <div className={isRunning ? "hf-bot-light" : "hf-bot-light-off"} />

        <div>
          <div className="hf-bot-lbl">Status</div>
          <div className="hf-bot-val">{bot.status} · {bot.uptime}</div>
        </div>

        <div style={{ marginLeft: 30 }}>
          <div className="hf-bot-lbl">Strategies armed</div>
          <div className="hf-bot-val">{bot.strategiesActive}</div>
        </div>

        <div style={{ marginLeft: 30 }}>
          <div className="hf-bot-lbl">Today P&amp;L</div>
          <div className={`hf-bot-val ${bot.todayPnL >= 0 ? "hf-up" : "hf-dn"}`}>
            {fmtSigned(bot.todayPnL)}
          </div>
        </div>

        <div style={{ marginLeft: 30 }}>
          <div className="hf-bot-lbl">Today trades</div>
          <div className="hf-bot-val">{bot.todayTrades}</div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="hf-btn" onClick={onPause}>
            {isRunning ? "Pause" : "Resume"}
          </button>
          <button className="hf-btn hf-btn-danger" onClick={onKill}>
            Kill switch
          </button>
        </div>
      </div>

      {/* 3-up metrics */}
      <div className="hf-strip" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <StatCell
          label="Cash allocated"
          value={`$${fmt(bot.cashAllocated)}`}
          sub={`$${fmt(bot.cashFree)} free`}
        />
        <StatCell
          label="Schedule"
          value={schedulePart0}
          sub={schedulePart1}
        />
        <StatCell
          label="Heartbeat"
          value="OK"
          sub={bot.lastHeartbeat}
          accent="var(--color-bull)"
        />
      </div>

      {/* Strategy selector */}
      {strategies.length > 0 && (
        <div className="hf-card">
          <div className="hf-card-head">
            <span className="hf-card-title">Arm strategy</span>
            <div className="hf-grow" />
            <span className="hf-card-meta">Click a strategy to expand · confirm to launch</span>
          </div>
          {strategies.map((s) => (
            <ArmRow key={s.id} strategy={s} />
          ))}
        </div>
      )}

      {/* Activity log */}
      <div className="hf-card">
        <div className="hf-card-head">
          <span className="hf-card-title">Activity log</span>
          <div className="hf-grow" />
          <span className="hf-card-meta">Live tail · newest at top</span>
          <button className="hf-btn hf-btn-ghost">Export</button>
        </div>

        <div className="hf-log">
          {bot.log.map((entry, i) => (
            <div key={i} className="hf-log-row">
              <span className="hf-log-ts">{entry.ts}</span>
              <span className={`hf-log-lvl hf-log-${entry.lvl}`}>{entry.lvl}</span>
              <span style={{ color: "var(--color-text)" }}>{entry.msg}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Info note */}
      <div
        style={{
          fontSize: 11.5,
          color: "var(--color-muted)",
          lineHeight: 1.55,
          padding: "10px 14px",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 10,
        }}
      >
        <strong style={{ color: "var(--color-text-secondary)" }}>Checkpoints. </strong>
        The bot runs in checkpoint mode — each step logs a recoverable state. The kill switch
        halts new orders immediately but does not flatten existing positions. Use{" "}
        <strong>Pause</strong> to stop new signals while keeping open orders working. All
        activity is logged above with full order, signal, risk, and system events.
      </div>
    </>
  );
}
