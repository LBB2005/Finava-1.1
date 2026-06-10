"use client";
import { useRouter } from "next/navigation";
import { useChatStore } from "@/stores/chatStore";
import type { ChatMode, AgentStep } from "@/types/chat";
import type { Conversation } from "@/components/layout/ConversationList";

/** Load a stored conversation into the chat store and (by default) open /chat.
 *  Shared by ConversationList and ChatContextButton so the store-reconciliation
 *  logic lives in exactly one place. */
export function useOpenConversation() {
  const router = useRouter();
  const {
    setMessages, setConversationId, setStreaming,
    clearStreamingContent, clearAgentSteps,
  } = useChatStore();

  return function openConversation(conv: Conversation, opts?: { navigate?: boolean }) {
    const { streamingConversationId } = useChatStore.getState();
    setMessages(conv.messages.map((m) => {
      let agentTrace: AgentStep[] | undefined;
      if (m.agentTrace) {
        try { agentTrace = JSON.parse(m.agentTrace); } catch { /* malformed trace — skip */ }
      }
      return {
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        mode: (m.mode as ChatMode) || "agent",
        createdAt: m.createdAt,
        agentTrace,
      };
    }));
    setConversationId(conv.id);

    if (conv.id === streamingConversationId) {
      setStreaming(true);
    } else {
      setStreaming(false);
      if (!streamingConversationId) {
        clearStreamingContent();
        clearAgentSteps();
      }
    }

    if (opts?.navigate !== false) router.push("/chat");
  };
}
