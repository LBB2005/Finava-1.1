"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import useSWR from "swr";
import { authFetcher } from "@/lib/authFetch";
import { useOpenConversation } from "@/hooks/useOpenConversation";
import type { Conversation } from "@/components/layout/ConversationList";

function getTitle(conv: Conversation): string {
  if (conv.title) return conv.title;
  const firstUser = conv.messages.find((m) => m.role === "user");
  if (firstUser) return firstUser.content.slice(0, 60) + (firstUser.content.length > 60 ? "…" : "");
  return "New conversation";
}

function snippet(conv: Conversation, q: string): string | null {
  if (!q) return null;
  const hit = conv.messages.find((m) => m.content.toLowerCase().includes(q));
  if (!hit) return null;
  const idx = hit.content.toLowerCase().indexOf(q);
  const start = Math.max(0, idx - 24);
  return (start > 0 ? "…" : "") + hit.content.slice(start, idx + q.length + 40).trim() + "…";
}

export default function ChatSearchModal({ onClose }: { onClose: () => void }) {
  // `full=1` so search can match message bodies, not just the title preview.
  const { data: conversations } = useSWR<Conversation[]>("/api/conversations?full=1", authFetcher);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const openConversation = useOpenConversation();

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    const list = Array.isArray(conversations) ? conversations : [];
    const q = query.toLowerCase().trim();
    if (!q) return list.slice(0, 8);
    return list.filter((c) =>
      getTitle(c).toLowerCase().includes(q) ||
      c.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  }, [conversations, query]);

  // Reset the highlighted row whenever the query changes (render-phase, no effect).
  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    setActive(0);
  }

  function loadConversation(conv: Conversation) {
    openConversation(conv);
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (filtered[active]) loadConversation(filtered[active]); }
  }

  const q = query.toLowerCase().trim();

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]"
      style={{ background: "var(--color-scrim)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] rounded-[var(--radius-xl)] overflow-hidden flex flex-col"
        style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", boxShadow: "var(--shadow-pop)", maxHeight: "70vh" }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {/* Search field */}
        <div className="flex items-center gap-2.5 px-4 py-[14px] flex-shrink-0" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="text-[var(--color-muted)] flex-shrink-0">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats…"
            className="flex-1 bg-transparent text-[14px] text-[var(--color-text)] placeholder:text-[var(--color-muted)] outline-none"
          />
          <kbd className="text-[10px] font-medium px-1.5 py-0.5 rounded text-[var(--color-muted)]" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="overflow-y-auto py-1.5">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-[var(--color-muted)]">
              {q ? "No matching chats" : "No chats yet"}
            </div>
          ) : (
            filtered.map((conv, i) => {
              const snip = snippet(conv, q);
              return (
                <button
                  key={conv.id}
                  onClick={() => loadConversation(conv)}
                  onMouseEnter={() => setActive(i)}
                  className="w-full text-left flex flex-col gap-0.5 px-4 py-[9px] transition-colors duration-100"
                  style={{ background: i === active ? "var(--color-sidebar-hover)" : "transparent" }}
                >
                  <span className="flex items-center gap-2 text-[13px] text-[var(--color-text)] truncate">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="flex-shrink-0 opacity-40">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    <span className="truncate">{getTitle(conv)}</span>
                  </span>
                  {snip && (
                    <span className="text-[11.5px] text-[var(--color-muted)] truncate pl-[20px]">{snip}</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
