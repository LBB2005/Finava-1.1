"use client";
import { usePathname, useRouter } from "next/navigation";
import { useChatStore } from "@/stores/chatStore";
import { useWatchlists } from "@/hooks/useWatchlists";
import { useWatchlistStore } from "@/stores/watchlistStore";
import { contextFromPath } from "@/lib/chatContext";
import ChatInput from "./ChatInput";

// One persistent composer for the whole app. Lives in the app shell, outside the
// route-keyed <main>, so it never unmounts as you move between pages. On /chat it
// feeds the live conversation via pendingMessage; elsewhere it primes the page
// context and routes to /chat so the new chat is tagged where it started.
export default function GlobalComposer() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { mode, setMode, isStreaming, setPendingMessage, setPendingContext } = useChatStore();
  const { watchlists } = useWatchlists();
  const { activeId } = useWatchlistStore();

  const isChat = pathname.startsWith("/chat");

  function handleSend(text: string) {
    const val = text.trim();
    if (!val) return;
    let msg = val;
    if (pathname.startsWith("/watchlist")) {
      const active = watchlists.find((w) => w.id === activeId) ?? watchlists[0];
      msg = `Re: my ${active?.name ?? "watchlist"} watchlist — ${val}`;
    }
    setPendingContext(contextFromPath(pathname));
    setPendingMessage(msg);
    if (!isChat) router.push("/chat");
  }

  return (
    <div className="absolute left-0 right-0 z-30 pointer-events-none" style={{ bottom: 6 }}>
      <ChatInput
        floating
        onSend={handleSend}
        disabled={isChat && isStreaming}
        mode={mode}
        onModeChange={setMode}
        autoFocus={false}
      />
    </div>
  );
}
