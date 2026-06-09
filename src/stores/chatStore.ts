"use client";
import { create } from "zustand";
import type { ChatMessage, ChatMode, AgentStep } from "@/types/chat";

interface ChatState {
  conversationId: string | null;
  messages: ChatMessage[];
  mode: ChatMode;
  isStreaming: boolean;
  streamingContent: string;
  agentSteps: AgentStep[];
  ceoThinking: string;
  pendingCritique: string;
  // ID of the conversation whose stream is currently running (survives navigation)
  streamingConversationId: string | null;

  // Discovery funnel wave progress (drives the "wave X of N" indicator).
  discoverProgress: { current: number; total: number } | null;
  setDiscoverProgress: (p: { current: number; total: number } | null) => void;

  pendingMessage: string;
  pendingFollowups: string[];
  setPendingMessage: (msg: string) => void;
  setPendingCritique: (c: string) => void;
  setPendingFollowups: (q: string[]) => void;
  setConversationId: (id: string | null) => void;
  setStreamingConversationId: (id: string | null) => void;
  setMode: (mode: ChatMode) => void;
  addMessage: (msg: ChatMessage) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  setStreaming: (v: boolean) => void;
  appendStreamChunk: (chunk: string) => void;
  clearStreamingContent: () => void;
  setAgentSteps: (steps: AgentStep[]) => void;
  updateAgentStep: (agent: string, update: Partial<AgentStep>) => void;
  clearAgentSteps: () => void;
  setCeoThinking: (text: string) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  discoverProgress: null,
  setDiscoverProgress: (p) => set({ discoverProgress: p }),
  pendingMessage: "",
  pendingFollowups: [],
  pendingCritique: "",
  setPendingMessage: (msg) => set({ pendingMessage: msg }),
  setPendingCritique: (c) => set({ pendingCritique: c }),
  setPendingFollowups: (q) => set({ pendingFollowups: q }),
  conversationId: null,
  messages: [],
  mode: "agent",
  isStreaming: false,
  streamingContent: "",
  agentSteps: [],
  ceoThinking: "",
  streamingConversationId: null,

  setConversationId: (id) => set({ conversationId: id }),
  setStreamingConversationId: (id) => set({ streamingConversationId: id }),
  setMode: (mode) => set({ mode }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setMessages: (msgs) => set({ messages: msgs }),
  setStreaming: (v) => set({ isStreaming: v }),
  appendStreamChunk: (chunk) =>
    set((s) => ({ streamingContent: s.streamingContent + chunk })),
  clearStreamingContent: () => set({ streamingContent: "" }),
  setAgentSteps: (steps) => set({ agentSteps: steps }),
  updateAgentStep: (agent, update) =>
    set((s) => ({
      agentSteps: s.agentSteps.map((step) =>
        step.agent === agent ? { ...step, ...update } : step
      ),
    })),
  clearAgentSteps: () => set({ agentSteps: [] }),
  setCeoThinking: (text) => set({ ceoThinking: text }),
  reset: () =>
    set({
      conversationId: null,
      messages: [],
      isStreaming: false,
      streamingContent: "",
      agentSteps: [],
      ceoThinking: "",
      pendingCritique: "",
      pendingFollowups: [],
      discoverProgress: null,
    }),
}));
