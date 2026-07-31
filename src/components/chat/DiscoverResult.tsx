"use client";
import { useState } from "react";
import Markdown from "./Markdown";
import { usePortfolio } from "@/hooks/usePortfolio";
import type { ChatMessage } from "@/types/chat";
import type { ConvictionTier, DiscoverLayout, DiscoverMessageContent, ScoutPick, WaveEvidence } from "@/lib/scoutTypes";

const ACCENT = "var(--color-discover)";

/** Conviction band → header label for the tiers layout. */
const TIER_META: Record<ConvictionTier, { label: string }> = {
  high: { label: "High conviction" },
  look: { label: "Worth a look" },
  wildcard: { label: "Wildcard" },
};
const TIER_ORDER: ConvictionTier[] = ["high", "look", "wildcard"];

/** Drawn tier glyphs (star / eye / shuffle) — no emoji as UI. */
function TierGlyph({ tier }: { tier: ConvictionTier }) {
  const common = {
    width: 12,
    height: 12,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (tier === "high") {
    return (
      <svg {...common}>
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    );
  }
  if (tier === "look") {
    return (
      <svg {...common}>
        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      <line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </svg>
  );
}

/** Conviction is optional on the wire — fall back to score bands so older
 *  messages (and any pick the LLM left untagged) still group sensibly. */
function convictionOf(p: ScoutPick): ConvictionTier {
  if (p.conviction) return p.conviction;
  return p.score >= 67 ? "high" : p.score >= 45 ? "look" : "wildcard";
}

function FinavaAvatar() {
  return (
    <div
      className="w-[30px] h-[30px] rounded-[var(--radius-md)] flex items-center justify-center flex-shrink-0 text-[length:var(--text-sm)] font-black"
      style={{ background: ACCENT, color: "var(--color-on-accent)", fontFamily: "var(--font-serif)", letterSpacing: "0.04em" }}
    >
      L
    </div>
  );
}

function scoreColor(score: number): string {
  return score >= 67 ? "var(--color-bull)" : score >= 40 ? "var(--color-warn)" : "var(--color-bear)";
}

function fmtCap(cap?: number | null): string | null {
  if (cap == null || !Number.isFinite(cap)) return null;
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(1)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(0)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(0)}M`;
  return `$${cap}`;
}

const AGENT_LABEL: Record<string, string> = {
  run_risk_agent: "Risk",
  run_news_agent: "News",
  run_technical_agent: "Technicals",
  run_analyst_agent: "Analyst",
  run_earnings_agent: "Earnings",
  run_insider_agent: "Insider",
  run_sentiment_agent: "Sentiment",
  run_options_agent: "Options",
  run_macro_agent: "Macro",
  run_dcf_agent: "DCF",
  run_graham_agent: "Graham",
  run_fundamentals_agent: "Fundamentals",
  run_comparables_agent: "Comparables",
  run_hype_agent: "Hype",
  run_competitor_agent: "Competitor",
};

function PickCard({ p, held, revealIndex = 0 }: { p: ScoutPick; held?: boolean; revealIndex?: number }) {
  const cap = fmtCap(p.marketCap);
  return (
    <div
      className="flex gap-3 px-3.5 py-3 rounded-[var(--radius-md)] fade-in"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        // Staggered "scanning" reveal — picks ease in one at a time. Capped so a
        // long list never feels slow; reduced-motion users get instant render.
        animationDelay: `${Math.min(revealIndex, 7) * 70}ms`,
      }}
    >
      <div
        className="mono flex-shrink-0 w-7 h-7 rounded-[var(--radius-sm)] flex items-center justify-center text-[length:var(--text-sm)] font-bold"
        style={{ background: "var(--color-discover-light)", color: ACCENT }}
      >
        {p.fitRank}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="mono text-[length:var(--text-sm)] font-bold" style={{ color: "var(--color-text)" }}>{p.ticker}</span>
          <span
            className="mono text-[length:var(--text-micro)] font-bold px-1.5 py-0.5 rounded-[var(--radius-xs)]"
            style={{ background: "var(--color-surface-2)", color: scoreColor(p.score) }}
          >
            {p.grade} · {p.score}
          </span>
          {held && (
            <span
              className="inline-flex items-center gap-1 text-[length:var(--text-micro)] font-bold px-1.5 py-0.5 rounded-[var(--radius-xs)] uppercase tracking-[0.08em]"
              style={{ background: "var(--color-accent-light)", color: "var(--color-accent)" }}
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Held
            </span>
          )}
          <span className="text-[length:var(--text-meta)] truncate" style={{ color: "var(--color-muted)" }}>
            {p.name} · {p.sector}
          </span>
        </div>
        {p.reason && (
          <p className="text-[length:var(--text-sm)] mt-1 leading-[1.45]" style={{ color: "var(--color-text-secondary)" }}>
            {p.reason}
          </p>
        )}
        {(cap || (p.pe != null && p.pe > 0)) && (
          <p className="mono text-[length:var(--text-micro)] mt-1" style={{ color: "var(--color-muted)" }}>
            {cap}{cap && p.pe != null && p.pe > 0 ? " · " : ""}{p.pe != null && p.pe > 0 ? `P/E ${p.pe.toFixed(0)}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

/** Grid of pick cards with a continuous stagger index for the reveal effect. */
function PickGrid({ picks, held, startIndex = 0 }: { picks: ScoutPick[]; held: Set<string>; startIndex?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {picks.map((p, i) => (
        <PickCard key={p.ticker} p={p} held={held.has(p.ticker)} revealIndex={startIndex + i} />
      ))}
    </div>
  );
}

function Shortlist({
  tier,
  query,
  framing,
  picks,
  held,
  layout: initialLayout,
  onDeeper,
}: {
  tier: "quick" | "deep";
  query: string;
  framing?: string;
  picks: ScoutPick[];
  held: Set<string>;
  layout?: DiscoverLayout;
  onDeeper?: () => void;
}) {
  // The scout hints a layout; the user can recast the SAME picks client-side
  // (no network) by toggling. Seed from the hint, default to ranked.
  const [layout, setLayout] = useState<DiscoverLayout>(initialLayout ?? "ranked");
  const ranked = [...picks].sort((a, b) => a.fitRank - b.fitRank);
  const groups = TIER_ORDER.map((t) => ({ t, items: ranked.filter((p) => convictionOf(p) === t) })).filter(
    (g) => g.items.length > 0
  );
  const otherLayout: DiscoverLayout = layout === "tiers" ? "ranked" : "tiers";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="eyebrow-label" style={{ color: ACCENT }}>
          {tier === "quick" ? "Discover" : "Deep Discover"} · {picks.length} {picks.length === 1 ? "idea" : "ideas"}
        </span>
        <span className="text-[length:var(--text-meta)] truncate flex-1 min-w-0" style={{ color: "var(--color-muted)" }}>for “{query}”</span>
        {/* Swap affordance — recast the same picks in the other layout. */}
        <button
          onClick={() => setLayout(otherLayout)}
          className="text-[length:var(--text-micro)] font-medium px-2 py-1 rounded-[var(--radius-sm)] transition-opacity hover:opacity-80 whitespace-nowrap"
          style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)" }}
        >
          {layout === "tiers" ? "Conviction tiers" : "Ranked"} · swap to {otherLayout === "tiers" ? "tiers" : "ranked"}
        </button>
      </div>

      {framing && (
        <div>
          <Markdown>{framing}</Markdown>
        </div>
      )}

      {layout === "tiers" ? (
        <div className="flex flex-col gap-3.5">
          {groups.map((g, gi) => {
            const start = groups.slice(0, gi).reduce((acc, x) => acc + x.items.length, 0);
            return (
              <div key={g.t} className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex" style={{ color: "var(--color-text-secondary)" }}><TierGlyph tier={g.t} /></span>
                  <span className="text-[length:var(--text-micro)] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--color-text-secondary)" }}>
                    {TIER_META[g.t].label}
                  </span>
                  <span className="mono text-[length:var(--text-micro)]" style={{ color: "var(--color-muted)" }}>
                    {g.items.length}
                  </span>
                </div>
                <PickGrid picks={g.items} held={held} startIndex={start} />
              </div>
            );
          })}
        </div>
      ) : (
        <PickGrid picks={ranked} held={held} />
      )}

      {tier === "quick" && onDeeper && (
        <button
          onClick={onDeeper}
          className="self-start inline-flex items-center gap-1.5 mt-1 px-3.5 py-2 rounded-[var(--radius-sm)] text-[length:var(--text-sm)] font-semibold transition-opacity hover:opacity-90"
          style={{ background: ACCENT, color: "var(--color-on-accent)" }}
        >
          Go deeper on these {picks.length}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      )}
    </div>
  );
}

function WaveCard({ wave, totalWaves }: { wave: WaveEvidence; totalWaves: number }) {
  const batchAgents = Object.keys(wave.batch);
  const errored = (s: string) => s.startsWith("Error:");
  return (
    <div
      className="rounded-[var(--radius-md)] px-4 py-3"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className="mono text-[length:var(--text-micro)] font-bold px-1.5 py-0.5 rounded-[var(--radius-xs)]"
          style={{ background: "var(--color-discover-light)", color: ACCENT }}
        >
          WAVE {wave.waveIndex + 1}/{totalWaves}
        </span>
        <span className="mono text-[length:var(--text-sm)] font-semibold" style={{ color: "var(--color-text)" }}>
          {wave.tickers.join(" · ")}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {batchAgents.map((a) => (
          <span
            key={a}
            className="text-[length:var(--text-micro)] px-1.5 py-0.5 rounded-[var(--radius-xs)]"
            style={{
              background: "var(--color-surface-2)",
              color: errored(wave.batch[a]) ? "var(--color-bear)" : "var(--color-text-secondary)",
            }}
          >
            {AGENT_LABEL[a] ?? a}
          </span>
        ))}
      </div>
      {wave.valuationTickers.length > 0 && (
        <p className="text-[length:var(--text-micro)] mt-2" style={{ color: "var(--color-muted)" }}>
          Deep valuation: {wave.valuationTickers.join(", ")}
        </p>
      )}
    </div>
  );
}

export default function DiscoverResult({
  content,
  message,
  onSuggestion,
  onDiscoverDeeper,
}: {
  content: DiscoverMessageContent;
  message: ChatMessage;
  onSuggestion?: (text: string) => void;
  onDiscoverDeeper?: (query: string) => void;
}) {
  // Held names are tagged purely client-side — the LLM never sees the portfolio,
  // so Discover stays generic while still flagging what the user already owns.
  const { holdings } = usePortfolio();
  const held = new Set(holdings.map((h) => h.ticker.toUpperCase()));

  return (
    <div style={{ display: "flex", gap: 14 }}>
      <FinavaAvatar />
      <div className="flex-1 min-w-0 pt-1">
        {content.kind === "shortlist" && (
          <Shortlist
            tier={content.tier}
            query={content.query}
            framing={content.framing}
            picks={content.picks}
            held={held}
            layout={content.layout}
            onDeeper={onDiscoverDeeper ? () => onDiscoverDeeper(content.query) : undefined}
          />
        )}

        {content.kind === "wave" && <WaveCard wave={content.wave} totalWaves={content.totalWaves} />}

        {content.kind === "final" && (
          <>
            <Markdown>{content.report}</Markdown>
            {message.followups && message.followups.length > 0 && onSuggestion && (
              <div style={{ marginTop: 14 }}>
                <div className="eyebrow-label" style={{ color: "var(--color-muted)", marginBottom: 8 }}>
                  Pick a direction
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {message.followups.map((q) => (
                    <button
                      key={q}
                      onClick={() => onSuggestion(q)}
                      className="followup-chip"
                      style={{ padding: "7px 13px", borderRadius: 999, fontSize: "var(--text-sm)", fontWeight: 500, fontFamily: "inherit", cursor: "pointer", transition: "all 140ms" }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
