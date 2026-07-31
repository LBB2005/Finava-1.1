"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { authFetcher } from "@/lib/authFetch";
import { useChatStore } from "@/stores/chatStore";
import { useOpenConversation } from "@/hooks/useOpenConversation";
import { contextLabel, type ChatContext } from "@/lib/chatContext";
import type { Conversation } from "@/components/layout/ConversationList";

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "now";
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function convTitle(conv: Conversation): string {
  if (conv.title) return conv.title;
  const firstUser = conv.messages.find((m) => m.role === "user");
  if (firstUser) return firstUser.content.slice(0, 40) + (firstUser.content.length > 40 ? "…" : "");
  return "New conversation";
}

/** Minimal corner chat icon + launcher popover, scoped to one page context.
 *  Lists only that context's chats; selecting one (or "new chat") opens /chat. */
export default function ChatContextButton({ context }: { context: ChatContext }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const openConversation = useOpenConversation();
  const { reset, setPendingContext, setPendingPageContext } = useChatStore();

  const { data } = useSWR<Conversation[]>("/api/conversations", authFetcher, {
    refreshInterval: 30_000, revalidateOnFocus: true,
  });
  const scoped = (Array.isArray(data) ? data : []).filter((c) => c.context === context);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function newChat() {
    // Capture the page's snapshot before we navigate away (this button lives on
    // the stock page, so activePageContext is populated here).
    const pc = useChatStore.getState().activePageContext;
    // reset() FIRST — it nulls pendingContext, so the tag/page context must be
    // primed AFTER it or they'd be wiped (this ordering was previously inverted,
    // silently dropping the page tag from launched chats).
    reset();
    setPendingContext(context);
    if (pc) setPendingPageContext(pc);
    setOpen(false);
    router.push("/chat");
  }

  function pick(conv: Conversation) {
    setOpen(false);
    openConversation(conv);
  }

  const label = contextLabel(context);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Chats"
        aria-label="Chats"
        aria-expanded={open}
        className="w-7 h-7 rounded-[var(--radius-sm)] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-sidebar-hover)] hover:text-[var(--color-text)] transition-colors duration-100"
        style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>

      {open && (
        <div
          className="fade-in"
          style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 50,
            width: 260, background: "var(--color-surface)", border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-pop)", overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", padding: "9px 11px", borderBottom: "1px solid var(--color-border)" }}>
            <span className="mono" style={{ flex: 1, fontSize: "var(--text-micro)", fontWeight: 700, letterSpacing: "0.13em", color: "var(--color-muted)" }}>
              CHATS · {label}
            </span>
            <button
              onClick={newChat}
              title="New chat"
              aria-label="New chat"
              className="w-[18px] h-[18px] rounded-[var(--radius-sm)] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-sidebar-hover)] hover:text-[var(--color-text)] transition-colors duration-100"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>

          <div style={{ maxHeight: 300, overflowY: "auto", padding: "4px 0" }}>
            {scoped.length === 0 ? (
              <p style={{ padding: "14px 12px", fontSize: "var(--text-meta)", color: "var(--color-muted)", textAlign: "center" }}>
                No {label.toLowerCase()} chats yet.
              </p>
            ) : (
              scoped.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => pick(conv)}
                  className="w-full text-left flex items-center gap-2 hover:bg-[var(--color-sidebar-hover)] transition-colors duration-100"
                  style={{ padding: "8px 11px" }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--color-accent)", flexShrink: 0 }} />
                  <span className="flex-1 truncate" style={{ fontSize: "var(--text-meta)", color: "var(--color-text)" }}>{convTitle(conv)}</span>
                  <span className="mono" style={{ fontSize: "var(--text-micro)", color: "var(--color-muted)", flexShrink: 0 }}>{relTime(conv.updatedAt)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
