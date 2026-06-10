"use client";
import type { ChatMode } from "@/types/chat";
import { AGENT_COUNT } from "@/types/chat";
import PageHeader from "@/components/layout/PageHeader";

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

  return <PageHeader title="Chat" subtitle={subtitle} />;
}
