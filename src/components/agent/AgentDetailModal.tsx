"use client";
import { useEffect } from "react";
import Markdown from "@/components/chat/Markdown";
import { AGENT_LABELS } from "@/types/chat";
import type { AgentStep } from "@/types/chat";

interface Props {
  step: AgentStep;
  onClose: () => void;
}

export default function AgentDetailModal({ step, onClose }: Props) {
  const label =
    step.agent === "skeptic_review"
      ? "Skeptic Review"
      : (AGENT_LABELS[step.agent] ?? step.agent);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "var(--color-scrim)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        animation: "thinking-fadein 160ms ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-bg)",
          borderRadius: "var(--radius-xl)",
          border: "1px solid var(--color-border-strong)",
          width: "100%",
          maxWidth: 760,
          maxHeight: "82vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-pop)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 28px",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              width: 26, height: 26,
              borderRadius: "var(--radius-sm)",
              background: "var(--color-accent)",
              color: "var(--color-on-accent)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--color-text)" }}>
              {label}
            </div>
            <div style={{ fontSize: "var(--text-meta)", color: "var(--color-muted)", marginTop: 1 }}>
              Full agent output
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30,
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-muted)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: "28px 32px" }}>
          {step.result ? (
            <Markdown>{step.result}</Markdown>
          ) : step.error ? (
            <p style={{ color: "var(--color-bear)", fontSize: "var(--text-sm)", margin: 0 }}>
              {step.error}
            </p>
          ) : (
            <p style={{ color: "var(--color-muted)", fontSize: "var(--text-sm)", margin: 0 }}>
              No output available.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
