"use client";
import { useChatStore } from "@/stores/chatStore";
import { usePortfolio } from "@/hooks/usePortfolio";
import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";
import type { Quote } from "@/types/portfolio";
import type { ChatMessage, AgentStep } from "@/types/chat";

// Stable empty references so selectors don't return fresh objects each render.
const EMPTY_MESSAGES: ChatMessage[] = [];
const EMPTY_STEPS: AgentStep[] = [];

export function buildPortfolioContext(
  holdings: ReturnType<typeof usePortfolio>["holdings"],
  cashBalance: number,
  quoteMap?: Map<string, Quote>
): string {
  const lines = holdings.map((h) => {
    const quote = quoteMap?.get(h.ticker);
    const price = quote?.price;
    const mv = price ? price * h.shares : null;
    const cost = h.avgCost * h.shares;
    const gainLoss = mv !== null ? mv - cost : null;
    const gainLossPct = gainLoss !== null && cost > 0 ? (gainLoss / cost) * 100 : null;
    const dayPct = quote?.changePct;

    const parts = [
      `- ${h.ticker}${h.companyName ? ` (${h.companyName})` : ""}`,
      `${h.shares} shares @ avg $${h.avgCost.toFixed(2)}`,
    ];
    if (price) parts.push(`current $${price.toFixed(2)}`);
    if (gainLossPct !== null) parts.push(`${gainLossPct >= 0 ? "+" : ""}${gainLossPct.toFixed(1)}% unrealized`);
    if (dayPct !== undefined) parts.push(`${dayPct >= 0 ? "+" : ""}${dayPct.toFixed(2)}% today`);
    if (mv !== null) parts.push(`mkt value $${mv.toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
    if (h.sector) parts.push(`sector: ${h.sector}`);

    return parts.join(", ");
  });

  const parts: string[] = [];
  if (lines.length) parts.push(`The user's portfolio:\n${lines.join("\n")}`);
  if (cashBalance > 0) parts.push(`Available buying power / cash: $${cashBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  return parts.join("\n\n");
}

/**
 * Presentational chat view. The streaming engine lives in <ChatEngine /> (mounted
 * in the app shell); this component just renders the VIEWED conversation's slice
 * + messages and routes user actions into the engine's send queue.
 */
export default function ChatContainer() {
  const mode = useChatStore((s) => s.mode);
  const conversationId = useChatStore((s) => s.conversationId);
  const enqueueSend = useChatStore((s) => s.enqueueSend);

  const messages = useChatStore((s) => (s.conversationId ? s.messagesByConv[s.conversationId] : undefined)) ?? EMPTY_MESSAGES;
  const isStreaming = useChatStore((s) => (s.conversationId ? s.streamsByConv[s.conversationId]?.isStreaming : false)) ?? false;
  const streamStartedAt = useChatStore((s) => (s.conversationId ? s.streamsByConv[s.conversationId]?.streamStartedAt : null)) ?? null;
  const streamingContent = useChatStore((s) => (s.conversationId ? s.streamsByConv[s.conversationId]?.streamingContent : "")) ?? "";
  const agentSteps = useChatStore((s) => (s.conversationId ? s.streamsByConv[s.conversationId]?.agentSteps : undefined)) ?? EMPTY_STEPS;
  const ceoThinking = useChatStore((s) => (s.conversationId ? s.streamsByConv[s.conversationId]?.ceoThinking : "")) ?? "";

  const onSuggestion = (text: string) =>
    enqueueSend({ convId: conversationId, text, mode, context: null, kind: "send" });
  const onDiscoverDeeper = (query: string) =>
    enqueueSend({ convId: conversationId, text: query, mode, context: null, kind: "deepen" });

  return (
    <div className="flex flex-col h-full">
      <ChatHeader mode={mode} />

      <MessageList
        messages={messages}
        isStreaming={isStreaming}
        streamStartedAt={streamStartedAt}
        streamingContent={streamingContent}
        mode={mode}
        onSuggestion={onSuggestion}
        onDiscoverDeeper={onDiscoverDeeper}
        agentSteps={agentSteps}
        ceoThinking={ceoThinking}
      />
    </div>
  );
}
