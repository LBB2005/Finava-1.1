"use client";
import { useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { useChatStore } from "@/stores/chatStore";
import { useToast } from "@/hooks/useToast";
import { authFetch } from "@/lib/authFetch";
import Modal from "@/components/ui/Modal";
import type { ChatMessage } from "@/types/chat";

const EMPTY_MESSAGES: ChatMessage[] = [];

/** Derive a human title for the viewed conversation (mirrors the sidebar's logic). */
function deriveTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New conversation";
  return firstUser.content.slice(0, 42) + (firstUser.content.length > 42 ? "…" : "");
}

interface MenuItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  tone?: "ai" | "danger";
  busy?: boolean;
  onSelect: () => void;
}

/**
 * The chat header's ⋯ menu: Save as Template · Rename / Archive. Grouped per
 * the approved design — AI actions in accent blue, Archive in red.
 */
export default function ChatHeaderMenu() {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const conversationId = useChatStore((s) => s.conversationId);
  const messages = useChatStore((s) => (s.conversationId ? s.messagesByConv[s.conversationId] : undefined)) ?? EMPTY_MESSAGES;

  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  const enabled = !!conversationId && messages.length > 0;
  const title = deriveTitle(messages);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function onSavePlaybook() {
    setOpen(false);
    const steps = messages.filter((m) => m.role === "user").map((m) => m.content);
    try {
      const res = await authFetch("/api/playbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, steps, sourceConversationId: conversationId }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      mutate("/api/playbooks");
      toast.success("Template saved — manage it in Settings → Templates");
    } catch {
      toast.error("Couldn't save the template");
    }
  }

  function onRenameOpen() {
    setOpen(false);
    setRenameValue(title === "New conversation" ? "" : title.replace(/…$/, ""));
    setRenaming(true);
  }

  async function onRenameSubmit() {
    const next = renameValue.trim();
    setRenaming(false);
    if (!next) return;
    try {
      const res = await authFetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: next }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      mutate("/api/conversations");
      toast.success("Chat renamed");
    } catch {
      toast.error("Couldn't rename this chat");
    }
  }

  async function onArchive() {
    setOpen(false);
    try {
      const res = await authFetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      mutate("/api/conversations");
      toast.success("Chat archived");
    } catch {
      toast.error("Couldn't archive this chat");
    }
  }

  const groups: MenuItem[][] = [
    [
      {
        key: "playbook", label: "Save as Template", tone: "ai", onSelect: onSavePlaybook,
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        ),
      },
    ],
    [
      {
        key: "rename", label: "Rename", onSelect: onRenameOpen,
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16.5 3.5l4 4L8 20l-5 1 1-5L16.5 3.5z" />
          </svg>
        ),
      },
      {
        key: "archive", label: "Archive", tone: "danger", onSelect: onArchive,
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" /><path d="M10 12h4" />
          </svg>
        ),
      },
    ],
  ];

  return (
    <div ref={wrapRef} className="relative ml-auto">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={!enabled}
        aria-label="Conversation options"
        aria-haspopup="menu"
        aria-expanded={open}
        title={enabled ? "Conversation options" : "Start a conversation to use these options"}
        className="w-7 h-7 rounded-[var(--radius-sm)] flex items-center justify-center transition-colors duration-100 disabled:opacity-35"
        style={{
          background: open ? "var(--color-surface-2)" : "transparent",
          color: "var(--color-text-secondary)",
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 z-[70] fade-in"
          style={{
            width: 232,
            background: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-pop)",
            padding: 6,
          }}
        >
          {groups.map((items, gi) => (
            <div key={gi}>
              {gi > 0 && <div style={{ height: 1, background: "var(--color-border)", margin: "5px 8px" }} />}
              {items.map((item) => (
                <button
                  key={item.key}
                  role="menuitem"
                  onClick={item.onSelect}
                  disabled={item.busy}
                  className="w-full flex items-center gap-[11px] px-2.5 py-2 rounded-[var(--radius-sm)] text-left text-[length:var(--text-sm)] transition-colors duration-100 hover:bg-[var(--color-sidebar-hover)]"
                  style={{
                    color:
                      item.tone === "ai" ? "var(--color-accent)"
                      : item.tone === "danger" ? "var(--color-bear)"
                      : "var(--color-text)",
                  }}
                >
                  <span className="w-4 h-4 flex-shrink-0" style={{ opacity: item.tone ? 1 : 0.75 }}>
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Rename modal */}
      {renaming && (
        <Modal onClose={() => setRenaming(false)} label="Rename conversation">
          <h2 className="text-[length:var(--text-title)] font-semibold mb-3" style={{ color: "var(--color-text)" }}>Rename chat</h2>
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onRenameSubmit(); }}
            placeholder="Chat title"
            maxLength={80}
            className="input mb-4"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setRenaming(false)} className="btn btn-ghost">
              Cancel
            </button>
            <button onClick={onRenameSubmit} disabled={!renameValue.trim()} className="btn btn-primary">
              Rename
            </button>
          </div>
        </Modal>
      )}

    </div>
  );
}
