"use client";
import { useRouter } from "next/navigation";
import { useChatStore } from "@/stores/chatStore";
import { authFetch } from "@/lib/authFetch";
import type { ChatMode, AgentStep } from "@/types/chat";
import type { Conversation } from "@/components/layout/ConversationList";

type ConvMessage = Conversation["messages"][number];

function toStoreMessages(messages: ConvMessage[]) {
  return messages.map((m) => {
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
      durationMs: typeof m.durationMs === "number" ? m.durationMs : undefined,
    };
  });
}

/** Load a stored conversation into the chat store and (by default) open /chat.
 *  Shared by ConversationList and ChatContextButton so the store-reconciliation
 *  logic lives in exactly one place.
 *
 *  The conversations list API only carries a short message preview, so the
 *  preview is shown immediately and the full transcript is fetched in the
 *  background and swapped in once it lands. */
export function useOpenConversation() {
  const router = useRouter();
  const { setMessages, setConversationId } = useChatStore();

  return function openConversation(conv: Conversation, opts?: { navigate?: boolean }) {
    // Each conversation keeps its own slice + messages keyed by id, so viewing
    // one is just pointing conversationId at it — no streaming state to juggle.
    // Don't clobber a list/preview over messages a live stream is building.
    const state = useChatStore.getState();
    const slice = state.streamsByConv[conv.id];
    if (!slice?.isStreaming) {
      setMessages(conv.id, toStoreMessages(conv.messages));
    }
    setConversationId(conv.id);

    void (async () => {
      try {
        const res = await authFetch(`/api/conversations/${conv.id}`);
        if (!res.ok) return;
        const full: Conversation = await res.json();
        // Only swap in the full transcript if this conversation isn't mid-stream
        // (a stream owns its own message list and commits on completion).
        if (!useChatStore.getState().streamsByConv[conv.id]?.isStreaming) {
          setMessages(conv.id, toStoreMessages(full.messages ?? []));
        }
      } catch { /* preview already shown; background refresh is best-effort */ }
    })();

    if (opts?.navigate !== false) router.push("/chat");
  };
}
