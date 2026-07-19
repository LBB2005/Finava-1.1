"use client";
import { useEffect } from "react";
import Markdown from "@/components/chat/Markdown";

interface Briefing {
  id: string;
  content: string;
  tickers: string[];
  createdAt: string;
}

interface Props {
  briefing: Briefing;
  onClose: () => void;
}

export default function BriefingModal({ briefing, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const date = new Date(briefing.createdAt).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center"
      style={{ background: "color-mix(in oklab, var(--color-text) 28%, transparent)", backdropFilter: "blur(2px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative flex flex-col"
        style={{
          width: "min(820px, 95vw)",
          maxHeight: "85vh",
          background: "var(--color-bg)",
          borderRadius: "var(--radius-xl)",
          border: "1px solid var(--color-border-strong)",
          boxShadow: "var(--shadow-pop)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-7 py-4 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)" }}
        >
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)] mb-0.5">
              Weekly Briefing
            </p>
            <p className="text-[14px] font-semibold text-[var(--color-text)]">{date}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Ticker pills */}
            <div className="flex gap-1.5 flex-wrap justify-end max-w-[260px]">
              {briefing.tickers.slice(0, 8).map((t) => (
                <span
                  key={t}
                  className="text-[10px] font-bold px-2 py-[2px] rounded-full"
                  style={{ background: "var(--color-accent-light)", color: "var(--color-accent)" }}
                >
                  {t}
                </span>
              ))}
              {briefing.tickers.length > 8 && (
                <span className="text-[10px] text-[var(--color-muted)]">+{briefing.tickers.length - 8}</span>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)] transition-colors duration-150"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-7 py-6">
          <Markdown>{briefing.content}</Markdown>
        </div>
      </div>
    </div>
  );
}
