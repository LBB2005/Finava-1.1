"use client";
import { useState } from "react";
import Spinner from "@/components/ui/Spinner";
import { AGENT_LABELS } from "@/types/chat";
import type { AgentStep as AgentStepType } from "@/types/chat";

export default function AgentStep({ step }: { step: AgentStepType }) {
  const [expanded, setExpanded] = useState(false);
  const label = AGENT_LABELS[step.agent] ?? step.agent;
  const isSkeptic = step.agent === "skeptic_review";

  return (
    <div className={`flex flex-col gap-1 ${isSkeptic ? "mt-1 pt-2 border-t border-[color-mix(in_srgb,var(--color-warn)_35%,transparent)]" : ""}`}>
      <div className="flex items-center gap-2">
        {step.status === "running" && (
          <span className={isSkeptic ? "text-[var(--color-warn)]" : "text-[var(--color-accent)]"}>
            <Spinner size={14} />
          </span>
        )}
        {step.status === "complete" && (
          <span className="text-[var(--color-bull)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
        )}
        {step.status === "error" && (
          <span className="text-[var(--color-bear)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </span>
        )}
        {step.status === "pending" && (
          <span className="w-3.5 h-3.5 rounded-full border border-[var(--color-border)]" />
        )}

        <span
          className={`text-xs font-medium ${
            step.status === "running"
              ? isSkeptic ? "text-[var(--color-warn)]" : "text-[var(--color-accent)]"
              : step.status === "complete"
              ? isSkeptic ? "text-[var(--color-warn)]" : "text-[var(--color-text)]"
              : step.status === "error"
              ? "text-[var(--color-bear)]"
              : "text-[var(--color-muted)]"
          }`}
        >
          {isSkeptic && "🔍 "}{label}
        </span>

        {step.status === "running" && (
          <span className="text-xs text-[var(--color-muted)]">Analyzing…</span>
        )}
        {step.status === "complete" && step.result && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-[var(--color-muted)] hover:text-[var(--color-accent)] ml-auto"
          >
            {expanded ? "hide" : "view"}
          </button>
        )}
      </div>

      {expanded && step.result && (
        <div className="ml-5 pl-3 border-l-2 border-[var(--color-accent-medium)] text-xs text-[var(--color-muted)] max-h-40 overflow-y-auto leading-relaxed">
          {step.result.slice(0, 500)}{step.result.length > 500 ? "…" : ""}
        </div>
      )}

      {step.status === "error" && step.error && (
        <p className="ml-5 text-xs text-[var(--color-bear)]">{step.error}</p>
      )}
    </div>
  );
}
