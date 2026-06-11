"use client";
import React, { useState, Component } from "react";
import Markdown from "./Markdown";

class MessageErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-muted)", fontSize: 13 }}>
          This message could not be rendered.
        </div>
      );
    }
    return this.props.children;
  }
}
import AgentDetailModal from "@/components/agent/AgentDetailModal";
import { AGENT_LABELS } from "@/types/chat";
import type { ChatMessage, AgentStep } from "@/types/chat";
import BacktestResult from "./BacktestResult";
import { ResponseReceipt } from "./ResponseTiming";
import type { BacktestResult as BacktestResultType } from "@/app/api/backtest/route";
import DiscoverResult from "./DiscoverResult";
import type { DiscoverMessageContent } from "@/lib/scoutTypes";

/* ── Agent focus blurbs (mirrors MessageList) ────────────────────────── */
const AGENT_FOCUS: Record<string, string> = {
  run_risk_agent:         "Beta, drawdown, correlation",
  run_news_agent:         "Last 72h material headlines",
  run_macro_agent:        "Rates, FX, growth backdrop",
  run_technical_agent:    "Trend, support, momentum",
  run_dcf_agent:          "Intrinsic value range",
  run_earnings_agent:     "EPS trends, upcoming catalysts",
  run_insider_agent:      "Form-4 activity & exec changes",
  run_sentiment_agent:    "Social, news flow, options skew",
  run_competitor_agent:   "Peer comparison",
  run_options_agent:      "Options flow, put/call ratio",
  run_comparables_agent:  "Peer multiples & relative value",
  run_graham_agent:       "Benjamin Graham scorecard",
  run_analyst_agent:      "Wall Street price targets",
  run_hype_agent:         "Reddit, X, YouTube momentum",
  run_fundamentals_agent: "Revenue, margins, FCF trends",
  skeptic_review:         "Stress-test the thesis",
};

/* Short display names for ribbon pills */
const AGENT_SHORT: Record<string, string> = {
  run_risk_agent:         "Ri",
  run_news_agent:         "Ne",
  run_macro_agent:        "Ma",
  run_technical_agent:    "Te",
  run_dcf_agent:          "DC",
  run_earnings_agent:     "Ea",
  run_insider_agent:      "In",
  run_sentiment_agent:    "Se",
  run_competitor_agent:   "Co",
  run_options_agent:      "Op",
  run_comparables_agent:  "Cm",
  run_graham_agent:       "Gr",
  run_analyst_agent:      "An",
  run_hype_agent:         "Hy",
  run_fundamentals_agent: "Fu",
  skeptic_review:         "Sk",
};

/* ── AgentRibbon — collapsed bar + expandable thinking panel ─────────── */
function AgentRibbon({ steps }: { steps: AgentStep[] }) {
  const [expanded, setExpanded] = useState(false);
  const [detailStep, setDetailStep] = useState<AgentStep | null>(null);

  const completed = steps.filter((s) => s.status === "complete").length;
  const total = steps.length;
  const pillSteps = steps.slice(0, 6);
  const extra = steps.length - 6;

  return (
    <div
      className="frost-card"
      style={{
        borderRadius: 14,
        overflow: "hidden",
        transition: "border-color 200ms, background 200ms",
      }}
    >
      <button
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="agent-ribbon-toggle"
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "11px 14px",
          border: "none",
          font: "inherit",
          textAlign: "left",
          cursor: "pointer",
          transition: "background 140ms",
        }}
      >
        {/* Stack glyph — Frost f4: bare accent, no plate */}
        <span
          style={{
            width: 24, height: 24,
            color: "var(--color-accent)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </span>

        {/* Titles */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--color-text)" }}>
            Research crew
          </div>
          <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 1 }}>
            {completed} of {total} agents complete
          </div>
        </div>

        {/* 2-letter agent pills */}
        <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
          {pillSteps.map((step) => (
            <span
              key={step.agent}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 22, height: 18,
                padding: "0 5px",
                background: "var(--color-bg)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-secondary)",
                borderRadius: 99,
                fontSize: "9.5px",
                fontWeight: 700,
                letterSpacing: "0.04em",
              }}
            >
              {AGENT_SHORT[step.agent] ?? (AGENT_LABELS[step.agent as keyof typeof AGENT_LABELS] ?? step.agent).slice(0, 2)}
            </span>
          ))}
          {extra > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 22, height: 18,
                padding: "0 5px",
                background: "var(--color-accent-light)",
                color: "var(--color-accent)",
                borderRadius: 99,
                fontSize: "9.5px",
                fontWeight: 700,
              }}
            >
              +{extra}
            </span>
          )}
        </span>

        {/* View thinking toggle */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            color: "var(--color-accent)",
            fontSize: "11.5px",
            fontWeight: 600,
            padding: "4px 8px",
            borderRadius: 6,
            background: "var(--color-accent-light)",
            flexShrink: 0,
          }}
        >
          {expanded ? "Hide thinking" : "View thinking"}
          <svg
            width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
            style={{ transition: "transform 200ms", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {detailStep && (
        <AgentDetailModal step={detailStep} onClose={() => setDetailStep(null)} />
      )}

      {/* Thinking panel */}
      {expanded && (
        <div
          style={{
            borderTop: "1px solid color-mix(in oklab, var(--color-text) 8%, transparent)",
            background: "color-mix(in oklab, var(--color-bg) 70%, transparent)",
            padding: "16px 16px 14px",
            animation: "thinking-fadein 220ms ease-out",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 12,
              padding: "0 4px",
            }}
          >
            <span
              style={{
                fontSize: "9.5px",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--color-accent)",
                fontWeight: 700,
              }}
            >
              Thinking trace · {total} agents
            </span>
            <span
              style={{
                fontSize: "10.5px",
                color: "var(--color-muted)",
                fontStyle: "italic",
                fontFamily: "var(--font-serif)",
              }}
            >
              Findings rolled up into the verdict below
            </span>
          </div>

          {/* Agent rows */}
          <div style={{ display: "grid", gap: 2 }}>
            {steps.map((step, i) => {
              const isSkeptic = step.agent === "skeptic_review";
              const label = isSkeptic
                ? "Skeptic Review"
                : (AGENT_LABELS[step.agent as keyof typeof AGENT_LABELS] ?? step.agent);
              const focus = AGENT_FOCUS[step.agent] ?? "";

              return (
                <div
                  key={step.agent}
                  className="agent-trace-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "30px 1fr auto",
                    gap: 12,
                    alignItems: "start",
                    padding: "9px 10px",
                    borderRadius: 8,
                    transition: "background 120ms",
                  }}
                >
                  {/* Index */}
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "10.5px",
                      color: "var(--color-muted)",
                      letterSpacing: "0.04em",
                      paddingTop: 1,
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </div>

                  {/* Body */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--color-text)" }}>
                        {label}
                      </span>
                      {focus && (
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--color-muted)",
                            fontStyle: "italic",
                            fontFamily: "var(--font-serif)",
                          }}
                        >
                          {focus}
                        </span>
                      )}
                    </div>
                    {step.result && (
                      <div style={{ fontSize: "12.5px", lineHeight: 1.55, color: "var(--color-text-secondary)" }}>
                        {step.result.slice(0, 220)}{step.result.length > 220 ? "…" : ""}
                      </div>
                    )}
                    {step.error && (
                      <div style={{ fontSize: "12.5px", lineHeight: 1.55, color: "var(--color-bear)" }}>
                        {step.error}
                      </div>
                    )}
                  </div>

                  {/* Status + view full */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {step.status === "complete" && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-bull)" strokeWidth="3" strokeLinecap="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                    {step.status === "error" && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-bear)" strokeWidth="2.5" strokeLinecap="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    )}
                    {(step.result || step.error) && (
                      <button
                        onClick={() => setDetailStep(step)}
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: "var(--color-accent)",
                          background: "var(--color-accent-light)",
                          border: "none",
                          borderRadius: 5,
                          padding: "2px 6px",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          letterSpacing: "0.04em",
                        }}
                      >
                        Full
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Verdict wrapper — left-accent card housing the markdown response ── */
function VerdictBlock({
  message,
}: {
  message: ChatMessage;
}) {
  const timestamp = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const isAgentMode = message.mode === "agent" || message.mode === "deep_research";

  return (
    <div
      className="verdict-fadein"
      style={{
        padding: "4px 0 8px",
      }}
    >
      {/* Eyebrow */}
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--color-accent)",
          fontWeight: 700,
          marginBottom: 12,
        }}
      >
        {isAgentMode ? "Verdict" : "Response"}
      </div>

      {/* Response body */}
      <Markdown>{message.content}</Markdown>

      {/* Footer: timestamp + mode badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
        <span
          style={{
            fontSize: 11,
            color: "var(--color-muted)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {timestamp}
        </span>
        {isAgentMode && (
          <span
            style={{
              background: "var(--color-accent-light)",
              color: "var(--color-accent)",
              padding: "2px 7px",
              borderRadius: 99,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {message.mode === "deep_research" ? "Deep Research" : "Agent"}
          </span>
        )}
        <ResponseReceipt durationMs={message.durationMs} />
      </div>
    </div>
  );
}

/* ── Prompt bubble — soft-tinted navy ───────────────────────────────── */
function PromptBubble({ message }: { message: ChatMessage }) {
  const timestamp = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className="prompt-lift"
      style={{
        marginLeft: "auto",
        maxWidth: "78%",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
      }}
    >
      <div
        style={{
          background: "color-mix(in oklab, var(--color-accent) 8%, var(--color-bg))",
          color: "var(--color-accent-hover)",
          padding: "12px 18px",
          borderRadius: 18,
          borderBottomRightRadius: 6,
          fontSize: 15,
          lineHeight: 1.5,
          fontWeight: 500,
          letterSpacing: "-0.005em",
          border: "1px solid color-mix(in oklab, var(--color-accent) 14%, transparent)",
          boxShadow: "0 1px 2px color-mix(in oklab, var(--color-accent) 8%, transparent)",
        }}
      >
        {message.content}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--color-muted)",
          marginTop: 6,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {timestamp}
      </div>
    </div>
  );
}

/* ── Skeptic critique callout ───────────────────────────────────────── */
function SkepticCritique({ critique }: { critique: string }) {
  return (
    <div
      style={{
        borderRadius: 12,
        border: "1px solid var(--color-warn-border)",
        background: "var(--color-warn-bg)",
        padding: "14px 18px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <svg
          width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round"
          style={{ color: "var(--color-warn)", flexShrink: 0 }}
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--color-warn-heading)",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
          }}
        >
          Second Opinion
        </span>
      </div>
      <Markdown style={{ color: "var(--color-warn-text)" }}>
        {critique}
      </Markdown>
    </div>
  );
}

/* ── Simple chat avatar ─────────────────────────────────────────────── */
function FinavaAvatar() {
  // Frost f4: bare accent mark — no solid plate behind the brand letter.
  return (
    <div
      className="flex-shrink-0 flex items-center justify-center text-[15px] font-black"
      style={{
        width: 30, height: 30,
        borderRadius: 9,
        background: "transparent",
        color: "var(--color-accent)",
        fontFamily: "var(--font-serif)",
        letterSpacing: "0.04em",
      }}
    >
      L
    </div>
  );
}

/* ── Main export ─────────────────────────────────────────────────────── */
function MessageInner({
  message,
  onSuggestion,
  onDiscoverDeeper,
}: {
  message: ChatMessage;
  onSuggestion?: (text: string) => void;
  onDiscoverDeeper?: (query: string) => void;
}) {
  if (message.role === "user") {
    return <PromptBubble message={message} />;
  }

  // Discovery mode: JSON-in-content with a `kind` discriminator (shortlist/wave/final).
  if (message.mode === "discover") {
    let dc: DiscoverMessageContent | null = null;
    try {
      dc = JSON.parse(message.content) as DiscoverMessageContent;
    } catch { /* fall through to markdown */ }
    if (dc) {
      return (
        <DiscoverResult
          content={dc}
          message={message}
          onSuggestion={onSuggestion}
          onDiscoverDeeper={onDiscoverDeeper}
        />
      );
    }
    return (
      <div style={{ display: "flex", gap: 14 }}>
        <FinavaAvatar />
        <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
          <Markdown>{message.content}</Markdown>
        </div>
      </div>
    );
  }

  // Backtest mode: parse JSON result and render chart + stats
  if (message.mode === "backtest") {
    let backtestResult: BacktestResultType | null = null;
    try {
      backtestResult = JSON.parse(message.content) as BacktestResultType;
    } catch { /* fall through to markdown */ }

    if (backtestResult?.series) {
      return <BacktestResult result={backtestResult} />;
    }
    // Render error message as plain text
    return (
      <div style={{ display: "flex", gap: 14 }}>
        <FinavaAvatar />
        <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
          <Markdown>{message.content}</Markdown>
        </div>
      </div>
    );
  }

  const isAgentMode = message.mode === "agent" || message.mode === "deep_research";
  const hasTrace = !!message.agentTrace?.length;

  /* Simple chat: avatar + flat markdown, no verdict wrapper */
  if (!isAgentMode) {
    return (
      <div style={{ display: "flex", gap: 14 }}>
        <FinavaAvatar />
        <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
          <Markdown>{message.content}</Markdown>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
            <span style={{ fontSize: 11, color: "var(--color-muted)", fontVariantNumeric: "tabular-nums" }}>
              {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <ResponseReceipt durationMs={message.durationMs} />
          </div>
          {message.followups && message.followups.length > 0 && onSuggestion && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: "9.5px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-muted)", fontWeight: 600, marginBottom: 8 }}>
                Follow up with
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
        </div>
      </div>
    );
  }

  /* Agent / deep research: ribbon → verdict → optional critique */
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {hasTrace && <AgentRibbon steps={message.agentTrace!} />}
      <VerdictBlock message={message} />
      {message.critique && <SkepticCritique critique={message.critique} />}
      {message.followups && message.followups.length > 0 && onSuggestion && (
        <div style={{ paddingTop: 2 }}>
          <div
            style={{
              fontSize: "9.5px",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--color-muted)",
              fontWeight: 600,
              marginBottom: 10,
            }}
          >
            Follow up with
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {message.followups.map((q) => (
              <button
                key={q}
                onClick={() => onSuggestion(q)}
                className="followup-chip"
                style={{
                  padding: "8px 14px",
                  borderRadius: 99,
                  fontSize: 12,
                  fontWeight: 500,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  transition: "all 140ms",
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Message(props: {
  message: ChatMessage;
  onSuggestion?: (text: string) => void;
  onDiscoverDeeper?: (query: string) => void;
}) {
  return (
    <MessageErrorBoundary>
      <MessageInner {...props} />
    </MessageErrorBoundary>
  );
}
