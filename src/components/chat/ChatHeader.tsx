"use client";
import type { ChatMode } from "@/types/chat";
import { AGENT_COUNT } from "@/types/chat";

interface Props {
  mode: ChatMode;
}

export default function ChatHeader({ mode }: Props) {
  const isAgentLike = mode === "agent" || mode === "deep_research";

  // Subtitle reflects the active mode, which is now switched from the
  // composer pill (the CHAT / AGENT / BACKTEST header toggles were removed
  // per the Calm Orb design — mode controls live in the composer).
  const subtitle =
    mode === "deep_research" ? "FINAVA AI · DEEP RESEARCH" :
    isAgentLike ? `FINAVA AI · ${AGENT_COUNT}-AGENT SYSTEM` :
    mode === "backtest" ? "FINAVA AI · BACKTEST ENGINE" :
    "FINAVA AI · CONVERSATIONAL";

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
    </div>
  );
}
