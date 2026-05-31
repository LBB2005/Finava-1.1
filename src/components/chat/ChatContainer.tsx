"use client";
import { useCallback, useEffect } from "react";
import { authFetch } from "@/lib/authFetch";
import { useChatStore } from "@/stores/chatStore";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useQuotes } from "@/hooks/useQuotes";
import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";
import type { ChatMessage, AgentEvent, AgentStep } from "@/types/chat";
import type { Quote } from "@/types/portfolio";

function buildPortfolioContext(
  holdings: ReturnType<typeof usePortfolio>["holdings"],
  cashBalance: number,
  quoteMap?: Map<string, Quote>,
  markovSignals?: Record<string, string>
): string {
  const lines = holdings.map((h) => {
    const quote = quoteMap?.get(h.ticker);
    const price = quote?.price;
    const mv = price ? price * h.shares : null;
    const cost = h.avgCost * h.shares;
    const gainLoss = mv !== null ? mv - cost : null;
    const gainLossPct = gainLoss !== null && cost > 0 ? (gainLoss / cost) * 100 : null;
    const dayPct = quote?.changePct;
    const regime = markovSignals?.[h.ticker];

    const parts = [
      `- ${h.ticker}${h.companyName ? ` (${h.companyName})` : ""}`,
      `${h.shares} shares @ avg $${h.avgCost.toFixed(2)}`,
    ];
    if (price) parts.push(`current $${price.toFixed(2)}`);
    if (gainLossPct !== null) parts.push(`${gainLossPct >= 0 ? "+" : ""}${gainLossPct.toFixed(1)}% unrealized`);
    if (dayPct !== undefined) parts.push(`${dayPct >= 0 ? "+" : ""}${dayPct.toFixed(2)}% today`);
    if (mv !== null) parts.push(`mkt value $${mv.toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
    if (h.sector) parts.push(`sector: ${h.sector}`);
    if (regime) parts.push(`Markov regime: ${regime}`);

    return parts.join(", ");
  });

  const parts: string[] = [];
  if (lines.length) parts.push(`The user's portfolio:\n${lines.join("\n")}`);
  if (cashBalance > 0) parts.push(`Available buying power / cash: $${cashBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  return parts.join("\n\n");
}

export default function ChatContainer() {
  const {
    messages,
    mode,
    isStreaming,
    streamingContent,
    agentSteps,
    ceoThinking,
    conversationId,
    setMode,
    addMessage,
    setMessages,
    setStreaming,
    appendStreamChunk,
    clearStreamingContent,
    setAgentSteps,
    updateAgentStep,
    setCeoThinking,
    setConversationId,
    setStreamingConversationId,
    pendingMessage,
    setPendingMessage,
    setPendingCritique,
    setPendingFollowups,
  } = useChatStore();

  const { holdings, cashBalance } = usePortfolio();
  const { quoteMap } = useQuotes(holdings.map((h) => h.ticker));

  // Fetch Markov signals for all held tickers (cache-hit, fast)
  async function fetchMarkovSignals(tickers: string[]): Promise<Record<string, string>> {
    if (!tickers.length) return {};
    try {
      const res = await authFetch(`/api/markov?tickers=${tickers.join(",")}&years=5`);
      if (!res.ok) return {};
      const data = await res.json() as { results: Record<string, { currentBias: string }> };
      const signals: Record<string, string> = {};
      for (const [ticker, result] of Object.entries(data.results ?? {})) {
        signals[ticker] = result.currentBias;
      }
      return signals;
    } catch {
      return {};
    }
  }

  async function ensureConversation(): Promise<string> {
    if (conversationId) return conversationId;
    const res = await authFetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: null }),
    });
    const data = await res.json();
    setConversationId(data.id);
    return data.id;
  }

  async function saveMessage(
    convId: string,
    role: "user" | "assistant",
    content: string,
    agentTrace?: AgentStep[]
  ) {
    await authFetch(`/api/conversations/${convId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, content, mode, agentTrace }),
    });
  }

  async function runBacktest(text: string, convId: string) {
    try {
      const portfolioTickers = holdings.map((h) => h.ticker);
      const res = await authFetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text, portfolioTickers }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = (data as { error?: string }).error ?? "Backtest failed";
        const errMsg2 = `**Backtest error:** ${errMsg}`;
        addMessage({ id: crypto.randomUUID(), role: "assistant", content: errMsg2, mode: "backtest", createdAt: new Date().toISOString() });
        return;
      }
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: JSON.stringify(data),
        mode: "backtest",
        createdAt: new Date().toISOString(),
      };
      if (useChatStore.getState().conversationId === convId) {
        addMessage(assistantMsg);
      }
      await saveMessage(convId, "assistant", JSON.stringify(data));
    } finally {
      setStreaming(false);
      clearStreamingContent();
      setStreamingConversationId(null);
    }
  }

  async function runSimpleChat(text: string, portfolioContext: string, convId: string) {
    const apiMessages = [
      ...messages.filter((m) => m.mode === "simple"),
      { role: "user" as const, content: text },
    ].map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await authFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, portfolioContext }),
      });

      if (!res.ok || !res.body) throw new Error("Stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let sseBuffer = "";

      function processLine(line: string) {
        if (!line.startsWith("data: ")) return;
        const data = line.slice(6);
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data);
          if (parsed.text) { appendStreamChunk(parsed.text); fullContent += parsed.text; }
          if (parsed.followups) setPendingFollowups(parsed.followups);
        } catch { /* ignore */ }
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() ?? "";
        for (const line of lines) processLine(line);
      }
      if (sseBuffer) processLine(sseBuffer);

      const followups = useChatStore.getState().pendingFollowups;
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: fullContent,
        mode: "simple",
        createdAt: new Date().toISOString(),
        followups: followups.length ? followups : undefined,
      };
      setPendingFollowups([]);
      if (useChatStore.getState().conversationId === convId) {
        addMessage(assistantMsg);
      }
      await saveMessage(convId, "assistant", fullContent);
    } finally {
      setStreaming(false);
      clearStreamingContent();
      setStreamingConversationId(null);
    }
  }

  async function runAgentMode(text: string, portfolioContext: string, convId: string, deepResearch = false, conversationHistory: { role: "user" | "assistant"; content: string }[] = []) {
    setAgentSteps([]);
    setCeoThinking("");

    try {
      const res = await authFetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userPrompt: text, portfolioContext, deepResearch, conversationHistory }),
      });

      if (!res.ok || !res.body) throw new Error("Agent stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let finalContent = "";
      let sseBuffer = "";

      function processLine(line: string) {
        if (!line.startsWith("data: ")) return;
        try {
          const event = JSON.parse(line.slice(6)) as AgentEvent;
          handleAgentEvent(event);
          if (event.type === "final_response") finalContent = event.content;
        } catch { /* ignore */ }
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() ?? "";
        for (const line of lines) processLine(line);
      }
      if (sseBuffer) processLine(sseBuffer);

      if (finalContent) {
        const state = useChatStore.getState();
        const completedSteps = state.agentSteps;
        const critique = state.pendingCritique;
        const followups = state.pendingFollowups;
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: finalContent,
          mode: "agent",
          createdAt: new Date().toISOString(),
          agentTrace: completedSteps,
          critique: critique || undefined,
          followups: followups.length ? followups : undefined,
        };
        if (state.conversationId === convId) {
          addMessage(assistantMsg);
        }
        setPendingCritique("");
        setPendingFollowups([]);
        await saveMessage(convId, "assistant", finalContent, completedSteps);
      }
    } finally {
      setStreaming(false);
      clearStreamingContent();
      setStreamingConversationId(null);
    }
  }

  function handleAgentEvent(event: AgentEvent) {
    switch (event.type) {
      case "agent_start": {
        const newStep: AgentStep = { agent: event.agent, status: "running" };
        setAgentSteps([
          ...useChatStore.getState().agentSteps.filter((s) => s.agent !== event.agent),
          newStep,
        ]);
        break;
      }
      case "agent_complete":
        updateAgentStep(event.agent, { status: "complete", result: event.result });
        break;
      case "agent_error":
        updateAgentStep(event.agent, { status: "error", error: event.error });
        break;
      case "ceo_thinking":
        setCeoThinking(event.content);
        break;
      case "ceo_compiling":
        setCeoThinking("Compiling all reports…");
        break;
      case "final_response":
        appendStreamChunk(event.content);
        break;
      case "skeptic_start": {
        const skepticStep: AgentStep = { agent: "skeptic_review", status: "running" };
        setAgentSteps([
          ...useChatStore.getState().agentSteps.filter((s) => s.agent !== "skeptic_review"),
          skepticStep,
        ]);
        break;
      }
      case "skeptic_complete":
        updateAgentStep("skeptic_review", { status: "complete", result: event.critique });
        if (event.critique) setPendingCritique(event.critique);
        break;
      case "followups":
        setPendingFollowups(event.questions);
        break;
      case "error":
        console.error("[agent error event]", event.message);
        appendStreamChunk(`\n\n**Error:** ${event.message}`);
        break;
    }
  }

  const handleSend = useCallback(
    async (text: string) => {
      if (isStreaming) return;

      try {
        const convId = await ensureConversation();

        // Fetch Markov signals in parallel with building context (fast — usually cached)
        const markovSignals = holdings.length > 0
          ? await fetchMarkovSignals(holdings.map((h) => h.ticker))
          : {};

        const portfolioContext = buildPortfolioContext(holdings, cashBalance, quoteMap, markovSignals);

        const userMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "user",
          content: text,
          mode,
          createdAt: new Date().toISOString(),
        };
        addMessage(userMsg);

        saveMessage(convId, "user", text).catch((e) =>
          console.warn("[handleSend] saveMessage failed:", e)
        );

        setStreaming(true);
        setStreamingConversationId(convId);
        clearStreamingContent();

        const agentHistory = messages
          .filter((m) => m.mode === "agent" || m.mode === "deep_research")
          .map((m) => ({ role: m.role, content: m.content }));

        if (mode === "backtest") {
          await runBacktest(text, convId);
        } else if (mode === "simple") {
          await runSimpleChat(text, portfolioContext, convId);
        } else if (mode === "deep_research") {
          await runAgentMode(text, portfolioContext, convId, true, agentHistory);
        } else {
          await runAgentMode(text, portfolioContext, convId, false, agentHistory);
        }
      } catch (err) {
        console.error("[handleSend] top-level error:", err);
        setStreaming(false);
        clearStreamingContent();
        setStreamingConversationId(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isStreaming, mode, holdings, cashBalance, conversationId, quoteMap]
  );

  // Fire pending message routed from portfolio ask bar
  useEffect(() => {
    if (!pendingMessage) return;
    setPendingMessage("");
    handleSend(pendingMessage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMessage]);

  // suppress unused import warning
  void setMessages;

  return (
    <div className="flex flex-col h-full">
      <ChatHeader mode={mode} onModeChange={setMode} />

      <MessageList
        messages={messages}
        isStreaming={isStreaming}
        streamingContent={streamingContent}
        mode={mode}
        onSuggestion={handleSend}
        agentSteps={agentSteps}
        ceoThinking={ceoThinking}
      />

      <ChatInput onSend={handleSend} disabled={isStreaming} mode={mode} onModeChange={setMode} />
    </div>
  );
}
