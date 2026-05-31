"use client";
import type { ChatMode } from "@/types/chat";
import { AGENT_COUNT } from "@/types/chat";

interface Props {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  title?: string;
  eyebrow?: string;
}

export default function ChatHeader({ mode, onModeChange, title = "Research", eyebrow }: Props) {
  const now = new Date();
  const dayLabel = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const isAgentLike = mode === "agent" || mode === "deep_research";
  const agentBtnColor = mode === "deep_research" ? "var(--color-deep-research)" : "var(--color-accent)";
  const agentBtnBg = mode === "deep_research" ? "var(--color-deep-research-light)" : "var(--color-bg)";
  const badgeBg = mode === "deep_research" ? "var(--color-deep-research-badge)" : "var(--color-accent-light)";
  const isBacktest = mode === "backtest";

  return (
    <div
      className="flex-shrink-0 flex items-center justify-between px-4 sm:px-7 h-[52px]"
      style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg)" }}
    >
      {/* Left: eyebrow + title. The eyebrow hides under sm; the title stays
          whole and never clips — the mode toggle shrinks instead on narrow viewports. */}
      <div className="flex items-baseline gap-3.5 min-w-0 mr-2 sm:mr-3">
        <span
          className="hidden sm:inline text-[12px] italic whitespace-nowrap flex-shrink-0"
          style={{ fontFamily: "var(--font-serif)", color: "var(--color-muted)" }}
        >
          {eyebrow ?? dayLabel}
        </span>
        <h1 className="m-0 text-[15px] font-semibold text-[var(--color-text)] whitespace-nowrap flex-shrink-0" style={{ fontFamily: "var(--font-serif)" }}>{title}</h1>
      </div>

      {/* Right: Chat ↔ Agent toggle */}
      <div
        className="inline-flex flex-shrink-0 p-[3px] gap-[2px] rounded-[10px]"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        role="tablist"
      >
        <button
          onClick={() => onModeChange("simple")}
          className="flex items-center gap-[6px] px-2.5 sm:px-3 py-[5px] text-[12.5px] font-medium rounded-[7px] transition-all duration-150"
          style={
            mode === "simple"
              ? { background: "var(--color-bg)", color: "var(--color-accent)", boxShadow: "0 1px 2px rgba(15,23,42,0.06)", fontWeight: 600 }
              : { background: "transparent", color: "var(--color-text-secondary)" }
          }
        >
          Chat
        </button>

        <button
          onClick={() => onModeChange(isAgentLike ? mode : "agent")}
          className="flex items-center gap-[6px] px-2.5 sm:px-3 py-[5px] text-[12.5px] font-medium rounded-[7px] transition-all duration-150"
          style={
            isAgentLike
              ? { background: agentBtnBg, color: agentBtnColor, boxShadow: "0 1px 2px rgba(15,23,42,0.06)", fontWeight: 600 }
              : { background: "transparent", color: "var(--color-text-secondary)" }
          }
        >
          {mode === "deep_research" ? (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
            </svg>
          )}
          {mode === "deep_research" ? "Deep Research" : "Agent Mode"}
          <span
            className="text-[10px] px-1.5 py-[1px] rounded-full font-bold"
            style={{ background: badgeBg, color: agentBtnColor }}
          >
            {AGENT_COUNT}
          </span>
        </button>

        <button
          onClick={() => onModeChange(isBacktest ? "agent" : "backtest")}
          className="flex items-center gap-[6px] px-2.5 sm:px-3 py-[5px] text-[12.5px] font-medium rounded-[7px] transition-all duration-150"
          style={
            isBacktest
              ? { background: "var(--color-backtest-light)", color: "var(--color-backtest)", boxShadow: "0 1px 2px rgba(15,23,42,0.06)", fontWeight: 600 }
              : { background: "transparent", color: "var(--color-text-secondary)" }
          }
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          Backtest
        </button>
      </div>
    </div>
  );
}
