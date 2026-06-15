"use client";
import { useEffect, useRef } from "react";
import { mutate } from "swr";
import { authFetch } from "@/lib/authFetch";
import { apiErrorMessage } from "@/lib/apiErrorMessage";
import { useChatStore, type SendRequest } from "@/stores/chatStore";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useQuotes } from "@/hooks/useQuotes";
import { useToast } from "@/hooks/useToast";
import { buildPortfolioContext } from "./ChatContainer";
import type { Conversation } from "@/components/layout/ConversationList";
import type { ChatMessage, ChatMode, AgentEvent, AgentStep } from "@/types/chat";
import type { ChatContext } from "@/lib/chatContext";
import {
  WAVE_SIZE,
  VALUATION_PER_WAVE,
  emptyEvidence,
  type ScoutPick,
  type DiscoverEvidence,
  type WaveEvidence,
  type DiscoverMessageContent,
  type DiscoverLayout,
} from "@/lib/scoutTypes";

// One AbortController per in-flight conversation stream, so a single chat can be
// cancelled (e.g. on delete) without disturbing the others.
const streamAborters = new Map<string, AbortController>();
export function abortConversationStream(convId: string) {
  streamAborters.get(convId)?.abort();
  streamAborters.delete(convId);
}

/**
 * Headless chat engine. Mounted once in the app shell (next to GlobalComposer),
 * outside the route-keyed <main>, so streams survive navigation and several
 * conversations can generate at the same time. It drains the store's send queue;
 * each send runs as its own async task writing to that conversation's slice.
 */
export default function ChatEngine() {
  const { holdings, cashBalance } = usePortfolio();
  const { quoteMap } = useQuotes(holdings.map((h) => h.ticker));
  const toast = useToast();

  // Snapshot the latest portfolio context so async streams don't capture stale
  // closures.
  const ctxRef = useRef({ holdings, cashBalance, quoteMap });
  ctxRef.current = { holdings, cashBalance, quoteMap };

  const sendQueue = useChatStore((s) => s.sendQueue);
  const pendingMessage = useChatStore((s) => s.pendingMessage);

  // ── store action shorthands (all keyed by convId) ──
  const s = () => useChatStore.getState();

  // A hard usage-cap returns HTTP 429 from the AI routes. Surface it as a clear
  // toast that links to the usage page. Returns true when it was a limit hit.
  async function handleUsageLimit(res: Response): Promise<boolean> {
    if (res.status !== 429) return false;
    const info = (await res.json().catch(() => null)) as { scope?: string } | null;
    const scope = info?.scope === "daily" ? "daily" : "weekly";
    toast.error(`You've reached your ${scope} AI usage limit.`, {
      action: { label: "View usage", onClick: () => { window.location.href = "/settings?section=usage"; } },
    });
    return true;
  }

  // Surface a chat failure as a toast with a Retry — but only when the failing
  // conversation is the one the user is currently viewing. A background-stream
  // error for conversation X must not pop a toast while the user is on Y.
  function notifyChatError(ownerConvId: string | null, message: string, retry: () => void) {
    const activeConvId = s().conversationId;
    const isActive = ownerConvId == null || ownerConvId === activeConvId;
    if (!isActive) return;
    toast.error(message, { action: { label: "Retry", onClick: retry } });
  }

  // Drop an optimistic row into the sidebar list cache synchronously, so the
  // recents entry and the originating page's nav pulse appear the instant you
  // hit send — before the server write round-trips.
  function insertOptimisticConversation(id: string, context: ChatContext, firstText: string, mode: ChatMode) {
    const now = new Date().toISOString();
    const optimistic: Conversation = {
      id,
      title: null,
      context: context ?? null,
      createdAt: now,
      updatedAt: now,
      messages: [{ id: crypto.randomUUID(), role: "user", content: firstText, mode, createdAt: now }],
    };
    void mutate(
      "/api/conversations",
      (prev: Conversation[] | undefined) => [optimistic, ...(prev ?? []).filter((c) => c.id !== id)],
      { revalidate: false }
    );
  }

  // Persist the conversation under the client-generated id. Awaited before any
  // message write so the parent doc exists, but NOT before the streaming UI
  // renders — that's already shown optimistically.
  async function createConversation(id: string, context: ChatContext): Promise<void> {
    await authFetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title: null, context }),
    });
  }

  async function saveMessage(
    convId: string,
    role: "user" | "assistant",
    content: string,
    mode: ChatMode,
    agentTrace?: AgentStep[],
    durationMs?: number
  ) {
    await authFetch(`/api/conversations/${convId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, content, mode, agentTrace, durationMs }),
    });
  }

  /** Elapsed ms since this conversation's stream began, for the response receipt. */
  function streamDuration(convId: string): number | undefined {
    const startedAt = s().slice(convId).streamStartedAt;
    return startedAt != null ? Date.now() - startedAt : undefined;
  }

  async function runBacktest(text: string, convId: string, mode: ChatMode) {
    try {
      const portfolioTickers = ctxRef.current.holdings.map((h) => h.ticker);
      const res = await authFetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text, portfolioTickers }),
        signal: streamAborters.get(convId)?.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = apiErrorMessage(data, "Backtest failed");
        s().addMessage(convId, { id: crypto.randomUUID(), role: "assistant", content: `**Backtest error:** ${errMsg}`, mode: "backtest", createdAt: new Date().toISOString() });
        return;
      }
      s().addMessage(convId, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: JSON.stringify(data),
        mode: "backtest",
        createdAt: new Date().toISOString(),
      });
      await saveMessage(convId, "assistant", JSON.stringify(data), mode);
    } finally {
      s().setStreaming(convId, false);
      s().clearStreamingContent(convId);
      streamAborters.delete(convId);
    }
  }

  async function runSimpleChat(text: string, portfolioContext: string, convId: string, mode: ChatMode, history: ChatMessage[], templateId?: string) {
    const apiMessages = [
      ...history.filter((m) => m.mode === "simple"),
      { role: "user" as const, content: text, mode: "simple" as ChatMode },
    ].map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await authFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, portfolioContext, templateId }),
        signal: streamAborters.get(convId)?.signal,
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
          if (parsed.text) { s().appendStreamChunk(convId, parsed.text); fullContent += parsed.text; }
          if (parsed.followups) s().setPendingFollowups(convId, parsed.followups);
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

      const followups = s().slice(convId).pendingFollowups;
      const durationMs = streamDuration(convId);
      s().addMessage(convId, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: fullContent,
        mode: "simple",
        createdAt: new Date().toISOString(),
        followups: followups.length ? followups : undefined,
        durationMs,
      });
      s().setPendingFollowups(convId, []);
      await saveMessage(convId, "assistant", fullContent, mode, undefined, durationMs);
    } finally {
      s().setStreaming(convId, false);
      s().clearStreamingContent(convId);
      streamAborters.delete(convId);
    }
  }

  async function runAgentMode(text: string, portfolioContext: string, convId: string, mode: ChatMode, deepResearch = false, conversationHistory: { role: "user" | "assistant"; content: string }[] = [], templateId?: string) {
    s().setAgentSteps(convId, []);
    s().setCeoThinking(convId, "");

    const retry = () => { void runAgentMode(text, portfolioContext, convId, mode, deepResearch, conversationHistory, templateId); };

    try {
      const res = await authFetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userPrompt: text,
          portfolioContext,
          deepResearch,
          conversationHistory,
          holdings: ctxRef.current.holdings.map((h) => ({ ticker: h.ticker, shares: h.shares })),
          templateId,
        }),
        signal: streamAborters.get(convId)?.signal,
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
          handleAgentEvent(event, convId, { convId, retry });
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
        const sl = s().slice(convId);
        const completedSteps = sl.agentSteps;
        const critique = sl.pendingCritique;
        const followups = sl.pendingFollowups;
        const durationMs = streamDuration(convId);
        s().addMessage(convId, {
          id: crypto.randomUUID(),
          role: "assistant",
          content: finalContent,
          mode: "agent",
          createdAt: new Date().toISOString(),
          agentTrace: completedSteps,
          critique: critique || undefined,
          followups: followups.length ? followups : undefined,
          durationMs,
        });
        s().setPendingCritique(convId, "");
        s().setPendingFollowups(convId, []);
        await saveMessage(convId, "assistant", finalContent, mode, completedSteps, durationMs);
      }
    } finally {
      s().setStreaming(convId, false);
      s().clearStreamingContent(convId);
      streamAborters.delete(convId);
    }
  }

  // ── Discovery funnel ────────────────────────────────────────────────────────

  async function postAgentStream(
    body: object,
    onEvent: (e: AgentEvent) => void,
    convId: string,
    timeoutMs?: number
  ) {
    const controller = new AbortController();
    const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
    // Cancel this wave if the whole conversation stream is aborted.
    const parent = streamAborters.get(convId)?.signal;
    const onParentAbort = () => controller.abort();
    parent?.addEventListener("abort", onParentAbort);
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
      parent?.removeEventListener("abort", onParentAbort);
    }
  }

  async function pushDiscover(content: string, convId: string, extra?: Partial<ChatMessage>) {
    s().addMessage(convId, {
      id: crypto.randomUUID(),
      role: "assistant",
      content,
      mode: "discover",
      createdAt: new Date().toISOString(),
      ...extra,
    });
    await saveMessage(convId, "assistant", content, "discover").catch((e) =>
      console.warn("[discover] saveMessage failed:", e)
    );
  }

  async function runDiscoverMode(
    text: string,
    portfolioContext: string,
    convId: string,
    tier: "quick" | "deep",
    seed?: { picks: ScoutPick[]; query: string; evidence: DiscoverEvidence; startWave: number }
  ) {
    s().setAgentSteps(convId, []);
    s().setCeoThinking(convId, "");
    const retry = () => { void runDiscoverMode(text, portfolioContext, convId, tier, seed); };
    try {
      let picks: ScoutPick[] = seed?.picks ?? [];
      let query = seed?.query ?? text;
      const evidence: DiscoverEvidence = seed?.evidence ?? emptyEvidence();

      // Phase 1 — scout (skipped on resume).
      if (!seed) {
        s().clearStreamingContent(convId);
        s().setCeoThinking(convId, "Scanning all 500 S&P names…");
        let framing = "";
        let clarify: { question: string; chips: string[] } | null = null;
        let scoutPicks: ScoutPick[] = [];
        let layout: DiscoverLayout | undefined;
        await postAgentStream(
          { discover: true, tier, userPrompt: text, portfolioContext },
          (event) => {
            handleAgentEvent(event, convId, { convId, retry });
            if (event.type === "scout_complete" || event.type === "deep_shortlist") {
              scoutPicks = event.picks;
              query = event.query;
              layout = event.layout;
            }
            if (event.type === "discover_clarify") clarify = { question: event.question, chips: event.chips };
            if (event.type === "final_response") framing = event.content;
          },
          convId
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
          JSON.stringify({ kind: "shortlist", tier, query, framing, picks, layout } as DiscoverMessageContent),
          convId,
          { scoutPicks: picks, tier }
        );

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
        s().setDiscoverProgress(convId, { current: w + 1, total: totalWaves });
        s().clearStreamingContent(convId);
        let waveEvidence: WaveEvidence | null = null;
        await postAgentStream(
          { wave: { tickers, sectors, waveIndex: w, totalWaves, valuationTickers } },
          (event) => {
            handleAgentEvent(event, convId, { convId, retry });
            if (event.type === "wave_result") waveEvidence = event.wave;
          },
          convId,
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
      s().setDiscoverProgress(convId, null);

      // Phase 3 — single synthesis pass.
      s().clearStreamingContent(convId);
      s().setCeoThinking(convId, "Ranking the shortlist on the crew's evidence…");
      let report = "";
      await postAgentStream(
        { wave: { synthesize: true, query, picks, evidence } },
        (event) => {
          handleAgentEvent(event, convId, { convId, retry });
          if (event.type === "final_response") report = event.content;
        },
        convId
      );
      if (report) await pushDiscover(JSON.stringify({ kind: "final", report } as DiscoverMessageContent), convId);
    } finally {
      s().setStreaming(convId, false);
      s().clearStreamingContent(convId);
      s().setDiscoverProgress(convId, null);
      streamAborters.delete(convId);
    }
  }

  function handleAgentEvent(
    event: AgentEvent,
    convId: string,
    owner?: { convId: string; retry: () => void }
  ) {
    const st = s();
    switch (event.type) {
      case "crew_planned": {
        // Pre-size the panel: show every planned agent as queued before any runs.
        // Preserve already-known statuses if this fires after some agents started.
        const existing = new Map(st.slice(convId).agentSteps.map((x) => [x.agent, x]));
        st.setAgentSteps(
          convId,
          event.agents.map((agent) => existing.get(agent) ?? { agent, status: "pending" as const })
        );
        break;
      }
      case "agent_start": {
        // Flip the queued slot to running in place (crew_planned set the order).
        const steps = st.slice(convId).agentSteps;
        if (steps.some((x) => x.agent === event.agent)) {
          st.updateAgentStep(convId, event.agent, { status: "running", models: event.models });
        } else {
          st.setAgentSteps(convId, [...steps, { agent: event.agent, status: "running", models: event.models }]);
        }
        break;
      }
      case "agent_complete":
        st.updateAgentStep(convId, event.agent, { status: "complete", result: event.result, models: event.models });
        break;
      case "agent_error":
        st.updateAgentStep(convId, event.agent, { status: "error", error: event.error });
        break;
      case "ceo_thinking":
        st.setCeoThinking(convId, event.content);
        break;
      case "ceo_compiling":
        st.setCeoThinking(convId, "Compiling all reports…");
        break;
      case "final_response":
        st.appendStreamChunk(convId, event.content);
        break;
      case "skeptic_start": {
        st.setAgentSteps(convId, [
          ...st.slice(convId).agentSteps.filter((x) => x.agent !== "skeptic_review"),
          { agent: "skeptic_review", status: "running" },
        ]);
        break;
      }
      case "skeptic_complete":
        st.updateAgentStep(convId, "skeptic_review", { status: "complete", result: event.critique });
        if (event.critique) st.setPendingCritique(convId, event.critique);
        break;
      case "followups":
        st.setPendingFollowups(convId, event.questions);
        break;
      case "deep_shortlist":
        st.setCeoThinking(convId, "Shortlist ready — running the analyst crew…");
        break;
      case "wave_start":
        st.setCeoThinking(convId, `Analyzing ${event.tickers.join(", ")} (wave ${event.waveIndex + 1} of ${event.totalWaves})…`);
        break;
      case "error":
        console.error("[agent error event]", event.message);
        st.appendStreamChunk(convId, `\n\n**Error:** ${event.message}`);
        if (owner) {
          notifyChatError(owner.convId, event.message || "Something went wrong while analyzing. Please retry.", owner.retry);
        }
        break;
    }
  }

  // "Go deeper" — escalate a quick result to the full deep funnel on the same query.
  async function deepen(convId: string, query: string) {
    if (s().slice(convId).isStreaming) return;
    s().setStreaming(convId, true);
    s().clearStreamingContent(convId);
    streamAborters.set(convId, new AbortController());
    try {
      const { holdings, cashBalance, quoteMap } = ctxRef.current;
      // Don't block the run on Markov (Python HMM per holding) — see processSend.
      const portfolioContext = buildPortfolioContext(holdings, cashBalance, quoteMap, {});
      await runDiscoverMode(query, portfolioContext, convId, "deep");
    } catch (err) {
      console.error("[discover deeper] error:", err);
      s().setStreaming(convId, false);
      s().clearStreamingContent(convId);
      streamAborters.delete(convId);
      notifyChatError(convId, "Couldn't run the deeper discovery. Please retry.", () => { void deepen(convId, query); });
    }
  }

  // ── Send queue processing ───────────────────────────────────────────────────

  async function processSend(req: SendRequest) {
    if (req.kind === "deepen") {
      await deepen(req.convId!, req.text);
      return;
    }

    const { text, mode, context, templateId } = req;
    let convId = req.convId;
    const isNew = !convId;
    // History BEFORE the new user message is added (for context building).
    const prior = s().messagesOf(convId);

    try {
      // New chat: render everything optimistically (id, sidebar row, streaming
      // state) before any network call, then persist in the background.
      if (!convId) {
        convId = crypto.randomUUID();
        s().setConversationId(convId); // view the new chat
        insertOptimisticConversation(convId, context, text, mode);
      }
      streamAborters.set(convId, new AbortController());

      s().addMessage(convId, {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        mode,
        createdAt: new Date().toISOString(),
      });
      s().setStreaming(convId, true);
      s().clearStreamingContent(convId);

      // Persist the parent doc before any message write, but after the UI is live.
      if (isNew) await createConversation(convId, context);

      const { holdings, cashBalance, quoteMap } = ctxRef.current;
      // Markov signals used to block the entire send — each holding spawns a
      // Python HMM subprocess, adding tens of seconds before the crew could even
      // start. They're an enhancement to the CEO's context, not a prerequisite
      // for planning, so build the context without them and start the crew now.
      const portfolioContext = buildPortfolioContext(holdings, cashBalance, quoteMap, {});

      saveMessage(convId!, "user", text, mode).catch((e) => console.warn("[send] saveMessage failed:", e));

      const agentHistory = prior
        .filter((m) => m.mode === "agent" || m.mode === "deep_research")
        .map((m) => ({ role: m.role, content: m.content }));

      if (mode === "backtest") {
        await runBacktest(text, convId, mode);
      } else if (mode === "simple") {
        await runSimpleChat(text, portfolioContext, convId, mode, prior, templateId);
      } else if (mode === "discover") {
        await runDiscoverMode(text, portfolioContext, convId, "quick");
      } else if (mode === "deep_research") {
        await runAgentMode(text, portfolioContext, convId, mode, true, agentHistory, templateId);
      } else {
        await runAgentMode(text, portfolioContext, convId, mode, false, agentHistory, templateId);
      }
    } catch (err) {
      console.error("[send] top-level error:", err);
      const failedId = convId;
      if (failedId) {
        s().setStreaming(failedId, false);
        s().clearStreamingContent(failedId);
        streamAborters.delete(failedId);
      }
      notifyChatError(failedId, "Couldn't send your message. Check your connection and retry.", () =>
        s().enqueueSend({ convId: failedId, text, mode, context, kind: "send" })
      );
    }
  }

  // Drain the send queue — each request runs concurrently (not awaited).
  useEffect(() => {
    if (!sendQueue.length) return;
    let req: SendRequest | undefined;
    while ((req = useChatStore.getState().dequeueSend())) {
      void processSend(req);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendQueue]);

  // Consume a pendingMessage (set by composers / quick-action buttons).
  // A send that carries a page context (composed from /research, /portfolio,
  // /watchlist, /stock — contextFromPath only returns non-null there) always
  // starts a NEW conversation tagged with that page, so it can't hijack or
  // interrupt the chat you happened to be viewing. A send with no context (a
  // follow-up typed on /chat) continues the viewed conversation.
  useEffect(() => {
    if (!pendingMessage) return;
    const { conversationId, mode, pendingContext, activeTemplate } = useChatStore.getState();
    useChatStore.getState().setPendingMessage("");
    useChatStore.getState().enqueueSend({
      convId: pendingContext ? null : conversationId,
      text: pendingMessage,
      mode,
      context: pendingContext,
      kind: "send",
      templateId: activeTemplate?.id,
    });
    if (pendingContext) useChatStore.getState().setPendingContext(null);
    if (activeTemplate) useChatStore.getState().setActiveTemplate(null);
  }, [pendingMessage]);

  // ── Resume an interrupted deep discovery run (viewed conversation) ───────────
  const conversationId = useChatStore((s2) => s2.conversationId);
  const viewedMessages = useChatStore((s2) => (s2.conversationId ? s2.messagesByConv[s2.conversationId] : undefined));
  const viewedStreaming = useChatStore((s2) => (s2.conversationId ? s2.streamsByConv[s2.conversationId]?.isStreaming : false));
  const resumedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (viewedStreaming || !conversationId) return;
    const messages = viewedMessages ?? [];
    const discoverMsgs = messages.filter((m) => m.mode === "discover");
    if (!discoverMsgs.length) return;

    let last: DiscoverMessageContent | null = null;
    try { last = JSON.parse(discoverMsgs[discoverMsgs.length - 1].content) as DiscoverMessageContent; } catch { return; }
    if (!last) return;
    if (last.kind === "final") return;
    if (last.kind === "shortlist" && last.tier === "quick") return;

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

    const resumeConvId = conversationId;
    const resumeSeed = { picks, query, evidence, startWave: doneWaves };
    const runResume = async () => {
      s().setStreaming(resumeConvId, true);
      streamAborters.set(resumeConvId, new AbortController());
      try {
        await runDiscoverMode(query, "", resumeConvId, "deep", resumeSeed);
      } catch (e) {
        console.error("[discover resume] error:", e);
        s().setStreaming(resumeConvId, false);
        streamAborters.delete(resumeConvId);
        notifyChatError(resumeConvId, "Couldn't resume your discovery run. Please retry.", () => { void runResume(); });
      }
    };
    void runResume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedMessages, conversationId, viewedStreaming]);

  return null;
}
