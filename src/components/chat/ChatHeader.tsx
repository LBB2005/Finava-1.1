"use client";
import type { ChatMode } from "@/types/chat";
import { AGENT_COUNT } from "@/types/chat";

interface Props {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
}

export default function ChatHeader({ mode, onModeChange }: Props) {
  const isAgentLike = mode === "agent" || mode === "deep_research";

  const subtitle =
    mode === "deep_research" ? "LUCRA AI · DEEP RESEARCH" :
    isAgentLike ? `LUCRA AI · ${AGENT_COUNT}-AGENT SYSTEM` :
    mode === "backtest" ? "LUCRA AI · BACKTEST ENGINE" :
    "LUCRA AI · CONVERSATIONAL";

  return (
    <div className="research-root cmdbar flex items-center flex-shrink-0" style={{ padding: "11px 22px", gap: 16 }}>
      <div className="flex items-baseline" style={{ gap: 10 }}>
        <span className="serif" style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em", color: "var(--color-text)" }}>
          Chat
        </span>
        <span className="mono" style={{ fontSize: 10.5, color: "var(--color-muted)", letterSpacing: "0.04em" }}>
          {subtitle}
        </span>
      </div>
      <div className="flex items-center" style={{ gap: 4, marginLeft: "auto" }}>
        <button className={"tbtn" + (mode === "simple" ? " on" : "")} onClick={() => onModeChange("simple")}>
          CHAT
        </button>
        <button className={"tbtn" + (isAgentLike ? " on" : "")} onClick={() => onModeChange(isAgentLike ? mode : "agent")}>
          AGENT {AGENT_COUNT}
        </button>
        <button className={"tbtn" + (mode === "backtest" ? " on" : "")} onClick={() => onModeChange(mode === "backtest" ? "agent" : "backtest")}>
          BACKTEST
        </button>
      </div>
    </div>
  );
}
