"use client";
import { useCallback, useEffect, useRef } from "react";
import { authFetch } from "@/lib/authFetch";
import { useChatStore } from "@/stores/chatStore";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useQuotes } from "@/hooks/useQuotes";
import { useToast } from "@/hooks/useToast";
import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";
import type { ChatMessage, AgentEvent, AgentStep } from "@/types/chat";
import type { Quote } from "@/types/portfolio";
import {
  WAVE_SIZE,
  VALUATION_PER_WAVE,
  emptyEvidence,
  type ScoutPick,
  type DiscoverEvidence,
  type WaveEvidence,
  type DiscoverMessageContent,
} from "@/lib/scoutTypes";

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
    setDiscoverProgress,
    pendingMessage,
    setPendingMessage,
    setPendingCritique,
    setPendingFollowups,
  } = useChatStore();

  const { holdings, cashBalance } = usePortfolio();
  const { quoteMap } = useQuotes(holdings.map((h) => h.ticker));
  const toast = useToast();

  // A hard usage-cap returns HTTP 429 from the AI routes. Surface it as a clear
  // toast that links to the usage page, rather than the generic "stream failed"
  // error. Returns true when it was a limit hit so the caller stops.
  async function handleUsageLimit(res: Response): Promise<boolean> {
    if (res.status !== 429) return false;
    const info = (await res.json().catch(() => null)) as { scope?: string } | null;
    const scope = info?.scope === "daily" ? "daily" : "weekly";
    toast.error(`You've reached your ${scope} AI usage limit.`, {
      action: {
        label: "View usage",
        onClick: () => {
          window.location.href = "/settings?section=usage";
        },
      },
    });
    return true;
  }

  // Hold the latest send/discover callbacks so a Retry closure can re-invoke the
  // exact same operation (see assignment + usage below).
  const handleSendRef = useRef<(text: string) => void>(() => {});
  const handleDiscoverDeeperRef = useRef<(query: string) => void>(() => {});

  /**
   * Surface a chat failure as a toast with a Retry action — but ONLY when the
   * failing operation's conversation is the one the user is currently viewing
   * (R7). A background-stream error for conversation X must not pop a toast (or
   * a retry that lands) while the user has navigated to conversation Y. This
   * mirrors the `useChatStore.getState().conversationId === convId` guard the
   * rest of this component uses before applying stream updates. Background
   * failures keep their existing quiet logging only.
   */
  function notifyChatError(ownerConvId: string | null, message: string, retry: () => void) {
    const activeConvId = useChatStore.getState().conversationId;
    // A send that failed before its conversation was created (ownerConvId null)
    // targeted the currently-active conversation, so it's always foreground.
    const isActive = ownerConvId == null || ownerConvId === activeConvId;
    if (!isActive) return;
    toast.error(message, { action: { label: "Retry", onClick: retry } });
  }

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

      if (await handleUsageLimit(res)) return;
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

    // Re-run THIS agent stream with the same arguments (for an in-band error Retry).
    const retry = () => { void runAgentMode(text, portfolioContext, convId, deepResearch, conversationHistory); };

    try {
      const res = await authFetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userPrompt: text,
          portfolioContext,
          deepResearch,
          conversationHistory,
          holdings: holdings.map((h) => ({ ticker: h.ticker, shares: h.shares })),
        }),
      });

      if (await handleUsageLimit(res)) return;
      if (!res.ok || !res.body) throw new Error("Agent stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let finalContent = "";
      let sseBuffer = "";

      function processLine(line: string) {
        if (!line.startsWith("data: ")) return;
        try {
          const event = JSON.parse(line.slice(6)) as AgentEvent;
          handleAgentEvent(event, { convId, retry });
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

  // ── Discovery funnel ────────────────────────────────────────────────────────

  /** POST to /api/agent and pump its SSE events. Soft-aborts after timeoutMs
   *  (proceed with partial evidence) rather than hanging a wave forever. */
  async function postAgentStream(
    body: object,
    onEvent: (e: AgentEvent) => void,
    timeoutMs?: number
  ) {
    const controller = new AbortController();
    const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await authFetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error("Discovery stream failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const handle = (line: string) => {
        if (!line.startsWith("data: ")) return;
        try { onEvent(JSON.parse(line.slice(6)) as AgentEvent); } catch { /* ignore */ }
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const l of lines) handle(l);
      }
      if (buf) handle(buf);
    } catch (e) {
      if ((e as Error).name !== "AbortError") throw e;
      // Soft abort — caller proceeds with whatever evidence arrived.
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** Append + persist one discover message (JSON-in-content, mode "discover"). */
  async function pushDiscover(content: string, convId: string, extra?: Partial<ChatMessage>) {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content,
      mode: "discover",
      createdAt: new Date().toISOString(),
      ...extra,
    };
    if (useChatStore.getState().conversationId === convId) addMessage(msg);
    await saveMessage(convId, "assistant", content).catch((e) =>
      console.warn("[discover] saveMessage failed:", e)
    );
  }

  /**
   * The client-sequenced discovery funnel.
   *  - quick: one scout POST → 5 picks + streamed narrative (no crew).
   *  - deep:  scout POST → ~20-name shortlist, then one POST per 5-name wave
   *           (deterministic crew), then a final synthesis POST. Each wave is
   *           persisted so a refresh can resume (see the resume effect).
   * `seed` re-enters the deep loop mid-way (resume) without re-scouting.
   */
  async function runDiscoverMode(
    text: string,
    portfolioContext: string,
    convId: string,
    tier: "quick" | "deep",
    seed?: { picks: ScoutPick[]; query: string; evidence: DiscoverEvidence; startWave: number }
  ) {
    setAgentSteps([]);
    setCeoThinking("");
    // Re-run THIS discovery pass with the same arguments (for an in-band error Retry).
    const retry = () => { void runDiscoverMode(text, portfolioContext, convId, tier, seed); };
    try {
      let picks: ScoutPick[] = seed?.picks ?? [];
      let query = seed?.query ?? text;
      const evidence: DiscoverEvidence = seed?.evidence ?? emptyEvidence();

      // Phase 1 — scout (skipped on resume).
      if (!seed) {
        clearStreamingContent();
        setCeoThinking("Scanning all 500 S&P names…");
        let framing = "";
        let clarify: { question: string; chips: string[] } | null = null;
        let scoutPicks: ScoutPick[] = [];
        await postAgentStream(
          { discover: true, tier, userPrompt: text, portfolioContext },
          (event) => {
            handleAgentEvent(event, { convId, retry });
            if (event.type === "scout_complete" || event.type === "deep_shortlist") {
              scoutPicks = event.picks;
              query = event.query;
            }
            if (event.type === "discover_clarify") clarify = { question: event.question, chips: event.chips };
            if (event.type === "final_response") framing = event.content;
          }
        );

        if (clarify) {
          const c = clarify as { question: string; chips: string[] };
          await pushDiscover(
            JSON.stringify({ kind: "final", report: framing || c.question } as DiscoverMessageContent),
            convId,
            { followups: c.chips }
          );
          return;
        }
        picks = scoutPicks;
        if (!picks.length) {
          if (framing) await pushDiscover(JSON.stringify({ kind: "final", report: framing } as DiscoverMessageContent), convId);
          return;
        }
        await pushDiscover(
          JSON.stringify({ kind: "shortlist", tier, query, framing, picks } as DiscoverMessageContent),
          convId,
          { scoutPicks: picks, tier }
        );

        // Quick stops here — the narrative + a "Go deeper" button are enough.
        if (tier === "quick") return;
      }

      // Phase 2 — deterministic crew waves (deep only).
      const totalWaves = Math.ceil(picks.length / WAVE_SIZE);
      const startWave = seed?.startWave ?? 0;
      for (let w = startWave; w < totalWaves; w++) {
        const wavePicks = picks.slice(w * WAVE_SIZE, (w + 1) * WAVE_SIZE);
        const tickers = wavePicks.map((p) => p.ticker);
        const valuationTickers = wavePicks.slice(0, VALUATION_PER_WAVE).map((p) => p.ticker);
        const sectors = [...new Set(wavePicks.map((p) => p.sector))];
        setDiscoverProgress({ current: w + 1, total: totalWaves });
        clearStreamingContent();
        let waveEvidence: WaveEvidence | null = null;
        await postAgentStream(
          { wave: { tickers, sectors, waveIndex: w, totalWaves, valuationTickers } },
          (event) => {
            handleAgentEvent(event, { convId, retry });
            if (event.type === "wave_result") waveEvidence = event.wave;
          },
          240_000
        );
        if (waveEvidence) {
          const we = waveEvidence as WaveEvidence;
          evidence.waves.push(we);
          for (const [t, byAgent] of Object.entries(we.valuation)) {
            evidence.valuation[t] = { ...(evidence.valuation[t] ?? {}), ...byAgent };
          }
          await pushDiscover(
            JSON.stringify({ kind: "wave", wave: we, totalWaves } as DiscoverMessageContent),
            convId
          );
        }
      }
      setDiscoverProgress(null);

      // Phase 3 — single synthesis pass (query + evidence re-rank).
      clearStreamingContent();
      setCeoThinking("Ranking the shortlist on the crew's evidence…");
      let report = "";
      await postAgentStream(
        { wave: { synthesize: true, query, picks, evidence } },
        (event) => {
          handleAgentEvent(event, { convId, retry });
          if (event.type === "final_response") report = event.content;
        }
      );
      if (report) await pushDiscover(JSON.stringify({ kind: "final", report } as DiscoverMessageContent), convId);
    } finally {
      setStreaming(false);
      clearStreamingContent();
      setStreamingConversationId(null);
      setDiscoverProgress(null);
    }
  }

  /** "Go deeper" — escalate a quick result to the full deep funnel on the same query. */
  const handleDiscoverDeeper = useCallback(async (query: string) => {
    if (useChatStore.getState().isStreaming) return;
    setStreaming(true);
    clearStreamingContent();
    // Owning conversation captured at failure time so the Retry/toast scopes to it (R7).
    let convId: string | null = null;
    try {
      convId = await ensureConversation();
      setStreamingConversationId(convId);
      const markovSignals = holdings.length > 0 ? await fetchMarkovSignals(holdings.map((h) => h.ticker)) : {};
      const portfolioContext = buildPortfolioContext(holdings, cashBalance, quoteMap, markovSignals);
      await runDiscoverMode(query, portfolioContext, convId, "deep");
    } catch (err) {
      console.error("[discover deeper] error:", err);
      setStreaming(false);
      clearStreamingContent();
      setStreamingConversationId(null);
      notifyChatError(
        convId,
        "Couldn't run the deeper discovery. Please retry.",
        () => { handleDiscoverDeeperRef.current(query); }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings, cashBalance, quoteMap]);

  function handleAgentEvent(
    event: AgentEvent,
    // The conversation that owns this stream + how to re-run it. Supplied by
    // each streaming caller so an in-band agent error can offer a scoped Retry.
    owner?: { convId: string; retry: () => void }
  ) {
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
      // ── Discovery funnel (data captured in runDiscoverMode; these drive UI feedback) ──
      case "deep_shortlist":
        setCeoThinking("Shortlist ready — running the analyst crew…");
        break;
      case "wave_start":
        setCeoThinking(`Analyzing ${event.tickers.join(", ")} (wave ${event.waveIndex + 1} of ${event.totalWaves})…`);
        break;
      case "error":
        console.error("[agent error event]", event.message);
        appendStreamChunk(`\n\n**Error:** ${event.message}`);
        if (owner) {
          notifyChatError(
            owner.convId,
            event.message || "Something went wrong while analyzing. Please retry.",
            owner.retry
          );
        }
        break;
    }
  }

  const handleSend = useCallback(
    async (text: string) => {
      if (isStreaming) return;

      // Optimistic UI: paint the user's message and the thinking animation
      // immediately, before any network round-trips, so send feels instant.
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        mode,
        createdAt: new Date().toISOString(),
      };
      addMessage(userMsg);
      setStreaming(true);
      clearStreamingContent();

      // Owning conversation captured at failure time so the Retry/toast scopes
      // to it (R7). Stays null if ensureConversation throws before assignment —
      // that means no new conversation was created, so the send targeted the
      // currently-active one (treated as foreground by notifyChatError).
      let convId: string | null = null;
      try {
        convId = await ensureConversation();
        setStreamingConversationId(convId);

        // Fetch Markov signals (usually cached) — happens after the UI has
        // already shown the message + loading state.
        const markovSignals = holdings.length > 0
          ? await fetchMarkovSignals(holdings.map((h) => h.ticker))
          : {};

        const portfolioContext = buildPortfolioContext(holdings, cashBalance, quoteMap, markovSignals);

        saveMessage(convId, "user", text).catch((e) =>
          console.warn("[handleSend] saveMessage failed:", e)
        );

        const agentHistory = messages
          .filter((m) => m.mode === "agent" || m.mode === "deep_research")
          .map((m) => ({ role: m.role, content: m.content }));

        if (mode === "backtest") {
          await runBacktest(text, convId);
        } else if (mode === "simple") {
          await runSimpleChat(text, portfolioContext, convId);
        } else if (mode === "discover") {
          await runDiscoverMode(text, portfolioContext, convId, "quick");
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
        notifyChatError(
          convId,
          "Couldn't send your message. Check your connection and retry.",
          () => { handleSendRef.current(text); }
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isStreaming, mode, holdings, cashBalance, conversationId, quoteMap]
  );

  // Keep the latest-callback refs current so a Retry closure can re-invoke the
  // same operation without referencing the const before its own declaration
  // (and so it always calls the current callback).
  useEffect(() => {
    handleSendRef.current = handleSend;
    handleDiscoverDeeperRef.current = handleDiscoverDeeper;
  }, [handleSend, handleDiscoverDeeper]);

  // Fire pending message routed from portfolio ask bar
  useEffect(() => {
    if (!pendingMessage) return;
    setPendingMessage("");
    handleSend(pendingMessage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMessage]);

  // ── Resume an interrupted deep discovery run ────────────────────────────────
  // Wave messages persist their evidence in content, so on reload we reconstruct
  // the accumulator + remaining waves from the saved messages (no extra schema).
  const resumedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (isStreaming || !conversationId) return;
    const discoverMsgs = messages.filter((m) => m.mode === "discover");
    if (!discoverMsgs.length) return;

    let last: DiscoverMessageContent | null = null;
    try { last = JSON.parse(discoverMsgs[discoverMsgs.length - 1].content) as DiscoverMessageContent; } catch { return; }
    if (!last) return;
    // Complete (final), a quick result, or a clarify prompt → nothing to resume.
    if (last.kind === "final") return;
    if (last.kind === "shortlist" && last.tier === "quick") return;

    // Find the deep shortlist this run started from.
    let shortlistIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].mode !== "discover") continue;
      try {
        const c = JSON.parse(messages[i].content) as DiscoverMessageContent;
        if (c.kind === "shortlist" && c.tier === "deep") { shortlistIdx = i; break; }
      } catch { /* ignore */ }
    }
    if (shortlistIdx < 0) return;

    let picks: ScoutPick[] = [];
    let query = "";
    try {
      const c = JSON.parse(messages[shortlistIdx].content) as DiscoverMessageContent;
      if (c.kind === "shortlist") { picks = c.picks; query = c.query; }
    } catch { return; }
    if (!picks.length) return;

    const evidence = emptyEvidence();
    let doneWaves = 0;
    for (let i = shortlistIdx + 1; i < messages.length; i++) {
      if (messages[i].mode !== "discover") continue;
      try {
        const c = JSON.parse(messages[i].content) as DiscoverMessageContent;
        if (c.kind === "wave") {
          evidence.waves.push(c.wave);
          for (const [t, b] of Object.entries(c.wave.valuation)) {
            evidence.valuation[t] = { ...(evidence.valuation[t] ?? {}), ...b };
          }
          doneWaves = Math.max(doneWaves, c.wave.waveIndex + 1);
        }
      } catch { /* ignore */ }
    }

    const key = `${conversationId}:${messages[shortlistIdx].id}:${doneWaves}`;
    if (resumedRef.current.has(key)) return;
    resumedRef.current.add(key);

    // Capture the owning conversation + seed so a Retry re-runs the exact same
    // resume, and so the error is scoped to this conversation (R7): if the user
    // has navigated away by the time it fails, notifyChatError stays quiet.
    const resumeConvId = conversationId;
    const resumeSeed = { picks, query, evidence, startWave: doneWaves };
    const runResume = async () => {
      setStreaming(true);
      setStreamingConversationId(resumeConvId);
      try {
        await runDiscoverMode(query, "", resumeConvId, "deep", resumeSeed);
      } catch (e) {
        console.error("[discover resume] error:", e);
        setStreaming(false);
        setStreamingConversationId(null);
        notifyChatError(
          resumeConvId,
          "Couldn't resume your discovery run. Please retry.",
          () => { void runResume(); }
        );
      }
    };
    void runResume();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, conversationId, isStreaming]);

  // suppress unused import warning
  void setMessages;

  return (
    <div className="flex flex-col h-full">
      <ChatHeader mode={mode} />

      <MessageList
        messages={messages}
        isStreaming={isStreaming}
        streamingContent={streamingContent}
        mode={mode}
        onSuggestion={handleSend}
        onDiscoverDeeper={handleDiscoverDeeper}
        agentSteps={agentSteps}
        ceoThinking={ceoThinking}
      />

      <ChatInput onSend={handleSend} disabled={isStreaming} mode={mode} onModeChange={setMode} />
    </div>
  );
}
