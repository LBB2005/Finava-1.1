"use client";
import Markdown from "./Markdown";
import { usePortfolio } from "@/hooks/usePortfolio";
import type { ChatMessage } from "@/types/chat";
import type { DiscoverMessageContent, ScoutPick, WaveEvidence } from "@/lib/scoutTypes";

const ACCENT = "var(--color-discover)";

function LucraAvatar() {
  return (
    <div
      className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center flex-shrink-0 text-white text-[13px] font-black"
      style={{ background: ACCENT, fontFamily: "var(--font-serif)", letterSpacing: "0.04em" }}
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

function PickCard({ p, held }: { p: ScoutPick; held?: boolean }) {
  const cap = fmtCap(p.marketCap);
  return (
    <div
      className="flex gap-3 px-3.5 py-3 rounded-[11px]"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <div
        className="flex-shrink-0 w-7 h-7 rounded-[8px] flex items-center justify-center text-[12px] font-bold tabular-nums"
        style={{ background: "var(--color-discover-light)", color: ACCENT }}
      >
        {p.fitRank}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13.5px] font-bold" style={{ color: "var(--color-text)" }}>{p.ticker}</span>
          <span
            className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-[5px]"
            style={{ background: "var(--color-surface-2)", color: scoreColor(p.score) }}
          >
            {p.grade} · {p.score}
          </span>
          {held && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-[5px] uppercase tracking-[0.08em]"
              style={{ background: "var(--color-accent-light)", color: "var(--color-accent)" }}
            >
              ✓ Held
            </span>
          )}
          <span className="text-[11.5px] truncate" style={{ color: "var(--color-muted)" }}>
            {p.name} · {p.sector}
          </span>
        </div>
        {p.reason && (
          <p className="text-[12px] mt-1 leading-[1.45]" style={{ color: "var(--color-text-secondary)" }}>
            {p.reason}
          </p>
        )}
        {(cap || (p.pe != null && p.pe > 0)) && (
          <p className="text-[10.5px] mt-1 tabular-nums" style={{ color: "var(--color-muted)" }}>
            {cap}{cap && p.pe != null && p.pe > 0 ? " · " : ""}{p.pe != null && p.pe > 0 ? `P/E ${p.pe.toFixed(0)}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

function Shortlist({
  tier,
  query,
  framing,
  picks,
  held,
  onDeeper,
}: {
  tier: "quick" | "deep";
  query: string;
  framing?: string;
  picks: ScoutPick[];
  held: Set<string>;
  onDeeper?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: ACCENT }}>
          {tier === "quick" ? "Discover" : "Deep Discover"} · {picks.length} ideas
        </span>
        <span className="text-[11px] truncate" style={{ color: "var(--color-muted)" }}>for “{query}”</span>
      </div>

      {framing && (
        <div className="discover-narrative">
          <Markdown>{framing}</Markdown>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {picks.map((p) => <PickCard key={p.ticker} p={p} held={held.has(p.ticker)} />)}
      </div>

      {tier === "quick" && onDeeper && (
        <button
          onClick={onDeeper}
          className="self-start inline-flex items-center gap-1.5 mt-1 px-3.5 py-2 rounded-[10px] text-[12.5px] font-semibold transition-opacity hover:opacity-90"
          style={{ background: ACCENT, color: "white" }}
        >
          Go deeper on these {picks.length}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
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
      className="rounded-[11px] px-4 py-3"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-[5px]"
          style={{ background: "var(--color-discover-light)", color: ACCENT }}
        >
          WAVE {wave.waveIndex + 1}/{totalWaves}
        </span>
        <span className="text-[12px] font-semibold" style={{ color: "var(--color-text)" }}>
          {wave.tickers.join(" · ")}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {batchAgents.map((a) => (
          <span
            key={a}
            className="text-[10px] px-1.5 py-0.5 rounded-[5px]"
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
        <p className="text-[10.5px] mt-2" style={{ color: "var(--color-muted)" }}>
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
      <LucraAvatar />
      <div className="flex-1 min-w-0 pt-1">
        {content.kind === "shortlist" && (
          <Shortlist
            tier={content.tier}
            query={content.query}
            framing={content.framing}
            picks={content.picks}
            held={held}
            onDeeper={onDiscoverDeeper ? () => onDiscoverDeeper(content.query) : undefined}
          />
        )}

        {content.kind === "wave" && <WaveCard wave={content.wave} totalWaves={content.totalWaves} />}

        {content.kind === "final" && (
          <>
            <Markdown>{content.report}</Markdown>
            {message.followups && message.followups.length > 0 && onSuggestion && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: "9.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-muted)", fontWeight: 600, marginBottom: 8 }}>
                  Pick a direction
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {message.followups.map((q) => (
                    <button
                      key={q}
                      onClick={() => onSuggestion(q)}
                      className="followup-chip"
                      style={{ padding: "7px 13px", borderRadius: 99, fontSize: 12, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", transition: "all 140ms" }}
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
