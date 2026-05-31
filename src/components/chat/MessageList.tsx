"use client";
import { useEffect, useRef, useState } from "react";
import Markdown from "./Markdown";
import Message from "./Message";
import AgentDetailModal from "@/components/agent/AgentDetailModal";
import { AGENT_LABELS } from "@/types/chat";
import type { ChatMessage, ChatMode, AgentStep } from "@/types/chat";
import { useMarketPulse } from "@/hooks/useMarketPulse";
import { usMarketStatus } from "@/lib/marketHours";

/* ── Starter prompts with tags ──────────────────────────────────────────── */
const SUGGESTIONS = [
  { tag: "RISK",  text: "What are my biggest position risks right now?" },
  { tag: "VALUE", text: "Run a full DCF on my largest holding" },
  { tag: "TRIM",  text: "Which positions should I consider trimming?" },
  { tag: "MACRO", text: "How does today's macro environment affect my book?" },
];

/* ── Tiny helpers ───────────────────────────────────────────────────────── */
function LucraAvatar() {
  return (
    <div
      className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center flex-shrink-0 text-white text-[13px] font-black"
      style={{ background: "var(--color-accent)", fontFamily: "var(--font-serif)", letterSpacing: "0.04em" }}
    >
      L
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block rounded-full border-2 border-[var(--color-accent)] border-t-transparent flex-shrink-0"
      style={{ width: 12, height: 12, animation: "spin 0.9s linear infinite" }}
    />
  );
}

/* ── Agent activity panel ("Research crew") ─────────────────────────────── */
function AgentActivityPanel({ steps, ceoThinking }: { steps: AgentStep[]; ceoThinking?: string }) {
  const [detailStep, setDetailStep] = useState<AgentStep | null>(null);
  const complete  = steps.filter((s) => s.status === "complete").length;
  const running   = steps.filter((s) => s.status === "running").length;
  const total     = steps.length;
  const isCompiling = ceoThinking === "Compiling all reports…";

  return (
    <>
      {detailStep && (
        <AgentDetailModal step={detailStep} onClose={() => setDetailStep(null)} />
      )}

      {/* Mobile compact bar */}
      <div
        className="flex sm:hidden items-center gap-3 px-4 py-3 rounded-[var(--radius-md)] fade-in"
        style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)" }}
      >
        <span className="flex gap-1 flex-shrink-0">
          {[0, 1, 2].map((i) => (
            <span key={i} className="typing-dot inline-block w-[5px] h-[5px] rounded-full" style={{ background: "var(--color-accent)", animationDelay: `${i * 160}ms` }} />
          ))}
        </span>
        <span className="flex-1 text-[12px] text-[var(--color-text-secondary)]">
          {!total ? "Deploying agents…" : running > 0 ? `${running} agent${running > 1 ? "s" : ""} analyzing…` : `${complete} of ${total} complete`}
        </span>
        {total > 0 && (
          <div className="rounded-full overflow-hidden flex-shrink-0" style={{ width: 60, height: 3, background: "var(--color-surface-2)" }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${total > 0 ? (complete / total) * 100 : 0}%`, background: "var(--color-accent)" }} />
          </div>
        )}
      </div>

      {/* Desktop full panel */}
      <div className="hidden sm:flex gap-[14px]">
      <LucraAvatar />
      <div className="flex-1 min-w-0 pt-0">
        <div
          className="rounded-[var(--radius-lg)] overflow-hidden fade-in"
          style={{ border: "1px solid var(--color-border-strong)", boxShadow: "var(--shadow-card)" }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-[14px] py-[11px]"
            style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)" }}
          >
            <div
              className="w-[22px] h-[22px] rounded-[6px] flex items-center justify-center text-white flex-shrink-0"
              style={{ background: "var(--color-accent)" }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className="flex flex-col gap-[1px]">
              <span className="text-[12.5px] font-semibold text-[var(--color-text)]">Research crew</span>
              <span className="text-[11px] text-[var(--color-muted)]">
                {!total
                  ? "Deploying agents…"
                  : running > 0
                  ? `${running} analyzing · ${complete} complete`
                  : `${complete} of ${total} complete`}
              </span>
            </div>
            {/* Progress meter */}
            {total > 0 && (
              <div className="ml-auto flex items-center gap-[10px]">
                <span className="text-[11.5px] font-semibold text-[var(--color-text-secondary)] tabular-nums">
                  {complete}/{total}
                </span>
                <div
                  className="rounded-full overflow-hidden"
                  style={{ width: 80, height: 4, background: "var(--color-surface-2)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: total > 0 ? `${(complete / total) * 100}%` : "0%",
                      background: "var(--color-accent)",
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Skeleton rows while no steps yet */}
          {!total && (
            <div className="px-[14px] py-3 flex flex-col gap-2.5">
              {[90, 68, 78].map((w, i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <span className="w-3 h-3 rounded-full bg-[var(--color-border-strong)] flex-shrink-0" />
                  <span className="h-2.5 rounded-full bg-[var(--color-border)]" style={{ width: w }} />
                </div>
              ))}
            </div>
          )}

          {/* Agent rows */}
          {total > 0 && (
            <div>
              {steps.map((step) => {
                const isSkeptic = step.agent === "skeptic_review";
                const label = isSkeptic ? "Skeptic Review" : (AGENT_LABELS[step.agent] ?? step.agent);
                const focus = AGENT_FOCUS[step.agent] ?? "";

                return (
                  <div
                    key={step.agent}
                    className="flex items-center gap-3 px-[14px] py-[9px]"
                    style={{
                      borderBottom: "1px solid var(--color-border)",
                      borderTop: isSkeptic ? "1px solid color-mix(in oklab, #f59e0b 30%, transparent)" : undefined,
                    }}
                  >
                    {/* Status icon */}
                    <div className="flex justify-center" style={{ width: 16 }}>
                      {step.status === "complete" && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-bull)" strokeWidth="3" strokeLinecap="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                      {step.status === "running" && <Spinner />}
                      {step.status === "error" && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round">
                          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                      )}
                      {step.status === "pending" && (
                        <span
                          className="inline-block rounded-full"
                          style={{ width: 8, height: 8, border: "1.5px solid var(--color-border-strong)" }}
                        />
                      )}
                    </div>

                    {/* Name + focus */}
                    <div className="flex-1 min-w-0 flex items-baseline gap-2">
                      <span
                        className="text-[12.5px] font-semibold"
                        style={{ color: step.status === "pending" ? "var(--color-muted)" : "var(--color-text)" }}
                      >
                        {isSkeptic ? "🔍 " : ""}{label}
                      </span>
                      {focus && (
                        <span className="text-[11px] text-[var(--color-muted)] truncate">{focus}</span>
                      )}
                    </div>

                    {/* Status badge / view full button */}
                    {(step.status === "complete" || step.status === "error") && step.result ? (
                      <button
                        onClick={() => setDetailStep(step)}
                        className="text-[9.5px] font-semibold uppercase tracking-[0.1em] flex-shrink-0 px-[7px] py-[3px] rounded-[5px] transition-colors duration-100"
                        style={{ background: "var(--color-accent-light)", color: "var(--color-accent)", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                      >
                        View
                      </button>
                    ) : (
                      <span
                        className="text-[9.5px] font-semibold uppercase tracking-[0.16em] flex-shrink-0"
                        style={{
                          color:
                            step.status === "complete" ? "var(--color-bull)"
                            : step.status === "running" ? "var(--color-accent)"
                            : step.status === "error" ? "#f87171"
                            : "var(--color-muted)",
                        }}
                      >
                        {step.status === "complete" ? "complete"
                          : step.status === "running" ? "analyzing"
                          : step.status === "error" ? "error"
                          : "queued"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer: compiling / synthesizing */}
          {(isCompiling || (total > 0 && running > 0)) && (
            <div
              className="px-[14px] py-[10px] flex items-center gap-2"
              style={{ background: "var(--color-surface)", borderTop: "1px solid var(--color-border)" }}
            >
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="typing-dot inline-block w-[6px] h-[6px] rounded-full"
                    style={{ background: "var(--color-accent)", animationDelay: `${i * 160}ms` }}
                  />
                ))}
              </span>
              <span className="text-[11.5px] italic text-[var(--color-text-secondary)] ml-1">
                {isCompiling ? "CEO is synthesizing findings…" : "Agents running in parallel…"}
              </span>
            </div>
          )}
        </div>
      </div>
      </div>
    </>
  );
}

/** One-line focus blurb shown next to each agent name */
const AGENT_FOCUS: Record<string, string> = {
  run_risk_agent:        "Beta, drawdown, correlation",
  run_news_agent:        "Last 72h material headlines",
  run_macro_agent:       "Rates, FX, growth backdrop",
  run_technical_agent:   "Trend, support, momentum",
  run_dcf_agent:         "Intrinsic value range",
  run_earnings_agent:    "EPS trends, upcoming catalysts",
  run_insider_agent:     "Form-4 activity & exec changes",
  run_sentiment_agent:   "Social, news flow, options skew",
  run_competitor_agent:  "Peer comparison",
  run_options_agent:     "Options flow, put/call ratio",
  run_comparables_agent: "Peer multiples & relative value",
  run_graham_agent:      "Benjamin Graham scorecard",
  run_analyst_agent:     "Wall Street price targets",
  run_hype_agent:        "Reddit, X, YouTube momentum",
  run_fundamentals_agent:"Revenue, margins, FCF trends",
  skeptic_review:        "Stress-test the thesis",
};

/* ── Market Pulse strip ──────────────────────────────────────────────────── */
function MarketPulse() {
  const { items, isLoading } = useMarketPulse();
  const market = usMarketStatus();

  return (
    <div
      className="rounded-[var(--radius-md)] px-[16px] py-[12px] mb-6"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-[10px]">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
          Market Pulse
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-muted)]">
          <span
            className="inline-block w-[6px] h-[6px] rounded-full"
            style={{
              background: market.open ? "var(--color-bull)" : "var(--color-muted)",
              boxShadow: market.open ? "0 0 0 3px color-mix(in oklab, var(--color-bull) 22%, transparent)" : "none",
            }}
          />
          {isLoading ? "Loading…" : market.label}
        </span>
      </div>

      {/* Ticker grid — 3 cols on mobile (two tidy rows), 6 across at md+ */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-x-[14px] gap-y-[14px]">
        {items.map((item) => {
          const up = item.chg >= 0;
          return (
            <div key={item.ticker} className="min-w-0">
              <p
                className="flex items-baseline gap-1 text-[10.5px] font-semibold uppercase tracking-[0.16em] mb-1 whitespace-nowrap"
                style={{ color: "var(--color-muted)" }}
              >
                {item.label}
                <span className="text-[8.5px] tracking-[0.08em] opacity-70">{item.ticker}</span>
              </p>
              <p
                className="text-[15px] font-semibold leading-[1.1] tabular-nums"
                style={{ color: "var(--color-text)" }}
              >
                {isLoading ? (
                  <span
                    className="inline-block h-[15px] w-16 rounded animate-pulse"
                    style={{ background: "var(--color-border)" }}
                  />
                ) : (
                  item.value
                )}
              </p>
              {!isLoading && item.chg !== 0 && (
                <p
                  className="text-[11.5px] font-semibold mt-[2px] tabular-nums"
                  style={{ color: up ? "var(--color-bull)" : "var(--color-bear)" }}
                >
                  {up ? "+" : ""}{item.chg.toFixed(2)}%
                </p>
              )}
              {isLoading && (
                <span
                  className="inline-block h-[11px] w-10 rounded mt-1 animate-pulse"
                  style={{ background: "var(--color-border)" }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────────── */
function EmptyState({ onSuggestion }: { onSuggestion?: (text: string) => void }) {
  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[720px] mx-auto px-4 py-8">
        {/* Greeting headline */}
        <div className="mb-6">
          <p
            className="text-[13px] italic mb-1.5"
            style={{ fontFamily: "var(--font-serif)", color: "var(--color-muted)" }}
          >
            {greeting}
          </p>
          <h2
            className="m-0 text-[32px] font-bold leading-[1.1] text-[var(--color-text)]"
            style={{ fontFamily: "var(--font-serif)", letterSpacing: "-0.015em" }}
          >
            What would you like<br />to research today?
          </h2>
        </div>

        <MarketPulse />

        {/* Suggestion tiles */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
              Starter prompts
            </span>
            <span className="text-[11px] text-[var(--color-muted)]">Tailored to your book</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-[10px]">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.text}
                onClick={() => onSuggestion?.(s.text)}
                className="followup-chip text-left px-[16px] py-[14px] rounded-[12px] flex gap-[10px] items-start transition-all duration-120 group"
                style={{
                  fontSize: "13.5px",
                  lineHeight: 1.4,
                }}
              >
                <span
                  className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] px-[7px] py-[3px] rounded-[5px] mt-[1px]"
                  style={{ background: "var(--color-accent-light)", color: "var(--color-accent)" }}
                >
                  {s.tag}
                </span>
                <span className="flex-1">{s.text}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main MessageList ─────────────────────────────────────────────────────── */
interface Props {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  mode: ChatMode;
  onSuggestion?: (text: string) => void;
  agentSteps?: AgentStep[];
  ceoThinking?: string;
}

export default function MessageList({
  messages,
  isStreaming,
  streamingContent,
  mode,
  onSuggestion,
  agentSteps = [],
  ceoThinking,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const showAgentActivity = mode === "agent" && isStreaming && !streamingContent;
  const showStreaming = isStreaming && !!streamingContent;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingContent, agentSteps.length, ceoThinking, isStreaming]);

  /* Empty state */
  if (!messages.length && !isStreaming) {
    return <EmptyState onSuggestion={onSuggestion} />;
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[720px] px-4 py-8 flex flex-col gap-7">
        {messages.map((msg) => (
          <Message key={msg.id} message={msg} onSuggestion={onSuggestion} />
        ))}

        {/* Agent activity panel */}
        {showAgentActivity && (
          <AgentActivityPanel steps={agentSteps} ceoThinking={ceoThinking} />
        )}

        {/* Streaming response */}
        {showStreaming && (
          <div className="flex gap-[14px]">
            <LucraAvatar />
            <div className="flex-1 min-w-0 pt-1">
              <Markdown>{streamingContent}</Markdown>
              <span
                className="inline-block w-0.5 h-[1.1em] animate-pulse align-text-bottom ml-0.5"
                style={{ background: "var(--color-accent)" }}
              />
            </div>
          </div>
        )}

        {/* Simple mode waiting dots */}
        {mode === "simple" && isStreaming && !streamingContent && (
          <div className="flex gap-[14px] items-start">
            <LucraAvatar />
            <div className="pt-2 flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="typing-dot inline-block w-2 h-2 rounded-full"
                  style={{ background: "var(--color-accent)", animationDelay: `${i * 160}ms` }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
