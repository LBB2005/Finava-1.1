"use client";
import { useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { useChatStore } from "@/stores/chatStore";
import { useToast } from "@/hooks/useToast";
import { authFetch } from "@/lib/authFetch";
import Modal from "@/components/ui/Modal";
import Markdown from "./Markdown";
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
 * The chat header's ⋯ menu: Share / Export · Digest / Save as Playbook ·
 * Rename / Archive. Grouped per the approved design — AI actions in accent
 * blue, Archive in red.
 */
export default function ChatHeaderMenu() {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const conversationId = useChatStore((s) => s.conversationId);
  const messages = useChatStore((s) => (s.conversationId ? s.messagesByConv[s.conversationId] : undefined)) ?? EMPTY_MESSAGES;

  const [open, setOpen] = useState(false);
  const [digest, setDigest] = useState<string | null>(null);
  const [digestBusy, setDigestBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [digestCopied, setDigestCopied] = useState(false);
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

  async function onShare() {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      const res = await authFetch(`/api/conversations/${conversationId}/share`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `${res.status}`);
      const url = `${window.location.origin}${data.url}`;
      setOpen(false);
      // Only touch devices get the native share sheet — desktop Safari also
      // implements navigator.share, but its macOS popover looks foreign here,
      // so desktop always copies the link instead.
      const isTouch = window.matchMedia("(pointer: coarse)").matches;
      if (isTouch && navigator.share) {
        try {
          await navigator.share({ title: `Finava — ${title}`, url });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
        }
      }
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied — anyone can view it");
    } catch {
      toast.error("Couldn't create a share link");
    } finally {
      setShareBusy(false);
    }
  }

  function onExport() {
    setOpen(false);
    // Print styles in globals.css isolate .print-transcript, so the system
    // print dialog's "Save as PDF" produces just the conversation.
    window.print();
  }

  async function onDigest() {
    if (digestBusy) return;
    setDigestBusy(true);
    try {
      const res = await authFetch(`/api/conversations/${conversationId}/digest`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `${res.status}`);
      setDigest(data.digest);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error && err.message.length < 80 ? err.message : "Couldn't generate a digest");
    } finally {
      setDigestBusy(false);
    }
  }

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
        key: "share", label: shareBusy ? "Creating link…" : "Share", busy: shareBusy, onSelect: onShare,
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
          </svg>
        ),
      },
      {
        key: "export", label: "Export PDF", onSelect: onExport,
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12m0 0l-4-4m4 4l4-4" /><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
          </svg>
        ),
      },
    ],
    [
      {
        key: "digest", label: digestBusy ? "Digesting…" : "Digest", tone: "ai", busy: digestBusy, onSelect: onDigest,
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15.6l-1.7-4.6L6 9.3l4.3-1.7L12 3z" />
            <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" />
          </svg>
        ),
      },
      {
        key: "playbook", label: "Save as Template", tone: "ai", onSelect: onSavePlaybook,
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16.5 3.5l4 4L8 20l-5 1 1-5L16.5 3.5z" />
          </svg>
        ),
      },
      {
        key: "archive", label: "Archive", tone: "danger", onSelect: onArchive,
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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
        className="w-7 h-7 rounded-[7px] flex items-center justify-center transition-colors duration-100 disabled:opacity-35"
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
          className="absolute right-0 top-full mt-1.5 z-[var(--z-dropdown)] fade-in"
          style={{
            width: 232,
            background: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            boxShadow: "0 8px 28px rgba(13,22,38,0.10), 0 2px 8px rgba(13,22,38,0.05)",
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
                  className="w-full flex items-center gap-[11px] px-2.5 py-2 rounded-[8px] text-left text-[13.5px] transition-colors duration-100 hover:bg-[var(--color-sidebar-hover)]"
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
          <h2 className="text-[15px] font-semibold mb-3" style={{ color: "var(--color-text)" }}>Rename chat</h2>
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onRenameSubmit(); }}
            placeholder="Chat title"
            maxLength={80}
            className="w-full text-[13px] px-3 py-2 rounded-[8px] focus:outline-none mb-4"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setRenaming(false)}
              className="px-3 py-1.5 rounded-[8px] text-[12.5px] font-medium"
              style={{ color: "var(--color-text-secondary)" }}>
              Cancel
            </button>
            <button onClick={onRenameSubmit} disabled={!renameValue.trim()}
              className="px-3.5 py-1.5 rounded-[8px] text-[12.5px] font-semibold disabled:opacity-40"
              style={{ background: "var(--color-accent)", color: "white" }}>
              Rename
            </button>
          </div>
        </Modal>
      )}

      {/* Digest modal */}
      {digest !== null && (
        <Modal
          onClose={() => setDigest(null)}
          label="Conversation digest"
          className="bg-[var(--color-surface)] rounded-2xl shadow-xl w-full max-w-lg mx-4 flex flex-col"
        >
          <div className="flex items-center justify-between px-6 pt-5 pb-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <h2 className="text-[15px] font-semibold" style={{ color: "var(--color-text)" }}>Digest</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(digest);
                  setDigestCopied(true);
                  setTimeout(() => setDigestCopied(false), 1800);
                }}
                className="px-2.5 py-1 rounded-[7px] text-[12px] font-medium"
                style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
              >
                {digestCopied ? "Copied!" : "Copy"}
              </button>
              <button onClick={() => setDigest(null)} aria-label="Close"
                className="w-6 h-6 rounded-[6px] flex items-center justify-center hover:bg-[var(--color-surface-2)]"
                style={{ color: "var(--color-muted)" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="px-6 py-4 overflow-y-auto" style={{ maxHeight: "60vh" }}>
            <Markdown>{digest}</Markdown>
          </div>
        </Modal>
      )}
    </div>
  );
}
