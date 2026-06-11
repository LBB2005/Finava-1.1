"use client";
import { create } from "zustand";
import type { ChatMessage, ChatMode, AgentStep } from "@/types/chat";
import type { ChatContext } from "@/lib/chatContext";

// ── Per-conversation streaming state ────────────────────────────────────────
// Each conversation owns its own live slice so multiple chats can stream at the
// same time. The VIEWED conversation is `conversationId`; the headless ChatEngine
// writes to whichever slice its stream owns, regardless of what's on screen.
export interface StreamSlice {
  isStreaming: boolean;
  /** Epoch ms when this stream started; drives the live "Analyzing · Ns" timer
   *  and is read at completion to stamp the message's duration. */
  streamStartedAt: number | null;
  streamingContent: string;
  agentSteps: AgentStep[];
  ceoThinking: string;
  pendingCritique: string;
  pendingFollowups: string[];
  discoverProgress: { current: number; total: number } | null;
}

export const emptySlice = (): StreamSlice => ({
  isStreaming: false,
  streamStartedAt: null,
  streamingContent: "",
  agentSteps: [],
  ceoThinking: "",
  pendingCritique: "",
  pendingFollowups: [],
  discoverProgress: null,
});

/** A queued send the ChatEngine will pick up and run. */
export interface SendRequest {
  id: string;
  /** Target conversation. null → create a new one at send time. */
  convId: string | null;
  text: string;
  mode: ChatMode;
  /** Context to stamp on a newly-created conversation. */
  context: ChatContext;
  /** "send" routes by mode; "deepen" escalates a quick discover to a deep run. */
  kind: "send" | "deepen";
}

interface ChatState {
  /** The conversation currently shown on screen. */
  conversationId: string | null;
  /** Messages per conversation (the viewed list is messagesByConv[conversationId]). */
  messagesByConv: Record<string, ChatMessage[]>;
  /** Live streaming slice per conversation. */
  streamsByConv: Record<string, StreamSlice>;
  mode: ChatMode;

  /** Engine work queue. */
  sendQueue: SendRequest[];

  pendingMessage: string;
  /** Context to stamp on the NEXT conversation created. Consumed at create time. */
  pendingContext: ChatContext;

  // ── selectors (call via useChatStore.getState() in non-React code) ──
  slice: (convId: string | null) => StreamSlice;
  messagesOf: (convId: string | null) => ChatMessage[];

  // ── viewed-conversation helpers ──
  setConversationId: (id: string | null) => void;
  setMode: (mode: ChatMode) => void;
  setPendingMessage: (msg: string) => void;
  setPendingContext: (ctx: ChatContext) => void;

  // ── send queue ──
  enqueueSend: (req: Omit<SendRequest, "id">) => void;
  dequeueSend: () => SendRequest | undefined;

  // ── per-conversation message + stream mutations (all keyed by convId) ──
  setMessages: (convId: string, msgs: ChatMessage[]) => void;
  addMessage: (convId: string, msg: ChatMessage) => void;
  setStreaming: (convId: string, v: boolean) => void;
  appendStreamChunk: (convId: string, chunk: string) => void;
  clearStreamingContent: (convId: string) => void;
  setAgentSteps: (convId: string, steps: AgentStep[]) => void;
  updateAgentStep: (convId: string, agent: string, update: Partial<AgentStep>) => void;
  clearAgentSteps: (convId: string) => void;
  setCeoThinking: (convId: string, text: string) => void;
  setPendingCritique: (convId: string, c: string) => void;
  setPendingFollowups: (convId: string, q: string[]) => void;
  setDiscoverProgress: (convId: string, p: { current: number; total: number } | null) => void;
  /** Tear down a conversation's state entirely (e.g. on delete). */
  dropConversation: (convId: string) => void;

  /** Detach the view (start a fresh new chat). Leaves background streams intact. */
  reset: () => void;
}

// Apply a partial update to one conversation's slice, immutably.
function patchSlice(
  streamsByConv: Record<string, StreamSlice>,
  convId: string,
  patch: Partial<StreamSlice>
): Record<string, StreamSlice> {
  const cur = streamsByConv[convId] ?? emptySlice();
  return { ...streamsByConv, [convId]: { ...cur, ...patch } };
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversationId: null,
  messagesByConv: {},
  streamsByConv: {},
  mode: "agent",
  sendQueue: [],
  pendingMessage: "",
  pendingContext: null,

  slice: (convId) => (convId ? get().streamsByConv[convId] ?? emptySlice() : emptySlice()),
  messagesOf: (convId) => (convId ? get().messagesByConv[convId] ?? [] : []),

  setConversationId: (id) => set({ conversationId: id }),
  setMode: (mode) => set({ mode }),
  setPendingMessage: (msg) => set({ pendingMessage: msg }),
  setPendingContext: (ctx) => set({ pendingContext: ctx }),

  enqueueSend: (req) =>
    set((s) => ({
      sendQueue: [...s.sendQueue, { ...req, id: crypto.randomUUID() }],
    })),
  dequeueSend: () => {
    const [first, ...rest] = get().sendQueue;
    if (!first) return undefined;
    set({ sendQueue: rest });
    return first;
  },

  setMessages: (convId, msgs) =>
    set((s) => ({ messagesByConv: { ...s.messagesByConv, [convId]: msgs } })),
  addMessage: (convId, msg) =>
    set((s) => ({
      messagesByConv: {
        ...s.messagesByConv,
        [convId]: [...(s.messagesByConv[convId] ?? []), msg],
      },
    })),

  setStreaming: (convId, v) =>
    set((s) => ({
      streamsByConv: patchSlice(s.streamsByConv, convId, {
        isStreaming: v,
        // Stamp the start when a stream begins; leave it on completion so the
        // engine can read it to compute the message duration.
        ...(v ? { streamStartedAt: Date.now() } : {}),
      }),
    })),
  appendStreamChunk: (convId, chunk) =>
    set((s) => {
      const cur = s.streamsByConv[convId] ?? emptySlice();
      return {
        streamsByConv: {
          ...s.streamsByConv,
          [convId]: { ...cur, streamingContent: cur.streamingContent + chunk },
        },
      };
    }),
  clearStreamingContent: (convId) =>
    set((s) => ({ streamsByConv: patchSlice(s.streamsByConv, convId, { streamingContent: "" }) })),
  setAgentSteps: (convId, steps) =>
    set((s) => ({ streamsByConv: patchSlice(s.streamsByConv, convId, { agentSteps: steps }) })),
  updateAgentStep: (convId, agent, update) =>
    set((s) => {
      const cur = s.streamsByConv[convId] ?? emptySlice();
      return {
        streamsByConv: {
          ...s.streamsByConv,
          [convId]: {
            ...cur,
            agentSteps: cur.agentSteps.map((step) =>
              step.agent === agent ? { ...step, ...update } : step
            ),
          },
        },
      };
    }),
  clearAgentSteps: (convId) =>
    set((s) => ({ streamsByConv: patchSlice(s.streamsByConv, convId, { agentSteps: [] }) })),
  setCeoThinking: (convId, text) =>
    set((s) => ({ streamsByConv: patchSlice(s.streamsByConv, convId, { ceoThinking: text }) })),
  setPendingCritique: (convId, c) =>
    set((s) => ({ streamsByConv: patchSlice(s.streamsByConv, convId, { pendingCritique: c }) })),
  setPendingFollowups: (convId, q) =>
    set((s) => ({ streamsByConv: patchSlice(s.streamsByConv, convId, { pendingFollowups: q }) })),
  setDiscoverProgress: (convId, p) =>
    set((s) => ({ streamsByConv: patchSlice(s.streamsByConv, convId, { discoverProgress: p }) })),

  dropConversation: (convId) =>
    set((s) => {
      const messagesByConv = { ...s.messagesByConv };
      const streamsByConv = { ...s.streamsByConv };
      delete messagesByConv[convId];
      delete streamsByConv[convId];
      return {
        messagesByConv,
        streamsByConv,
        conversationId: s.conversationId === convId ? null : s.conversationId,
      };
    }),

  reset: () => set({ conversationId: null, pendingMessage: "", pendingContext: null }),
}));
