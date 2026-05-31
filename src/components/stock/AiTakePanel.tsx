"use client";
import { useState } from "react";
import type { SentimentRead } from "@/lib/stockData";

interface Props {
  ticker: string;
  sentiment: SentimentRead | null;
}

function sentimentColor(label: SentimentRead["label"]) {
  if (label === "positive") return "var(--color-bull)";
  if (label === "negative") return "var(--color-bear)";
  return "var(--color-muted)";
}

function SentimentMeter({ s }: { s: SentimentRead }) {
  const color = sentimentColor(s.label);
  return (
    <div className="mb-4 pb-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Sentiment</p>
        <span className="text-[11px] font-semibold capitalize" style={{ color }}>{s.label} · {s.score}/100</span>
      </div>
      {/* Track */}
      <div className="relative h-[6px] rounded-full overflow-hidden" style={{ background: "var(--color-surface-2)" }}>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${s.score}%`, background: color }} />
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px] text-[var(--color-muted)]">Based on {s.basis} · {s.sampleSize} items</span>
        {s.placeholder && (
          <span className="text-[9.5px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-[4px] text-[var(--color-muted)]" style={{ background: "var(--color-surface-2)" }} title="A lightweight heuristic. The full multi-source sentiment engine lands in a later phase.">
            Preview
          </span>
        )}
      </div>
    </div>
  );
}

export default function AiTakePanel({ ticker, sentiment }: Props) {
  const [take, setTake] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stock/${encodeURIComponent(ticker)}/ai-take`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setTake(body.take ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate take.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-[var(--radius-lg)] p-5" style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)] mb-4">AI Take</p>

      {sentiment && <SentimentMeter s={sentiment} />}

      {take ? (
        <div className="text-[12.5px] leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-wrap">{take}</div>
      ) : (
        <div className="flex flex-col items-start gap-2.5">
          <p className="text-[12px] text-[var(--color-muted)] leading-relaxed">
            Generate a concise, balanced AI read on {ticker} from its latest fundamentals, analyst picture, and news. Nothing runs until you ask.
          </p>
          <button
            onClick={generate}
            disabled={loading}
            className="text-[12px] font-medium px-3.5 py-[7px] rounded-[9px] transition-all duration-150 disabled:opacity-60"
            style={{ border: "1px solid var(--color-accent)", background: "var(--color-accent)", color: "white" }}
          >
            {loading ? "Generating…" : "Generate AI take"}
          </button>
        </div>
      )}

      {error && <p className="text-[11.5px] text-[var(--color-bear)] mt-2.5">{error}</p>}

      {take && (
        <button
          onClick={generate}
          disabled={loading}
          className="mt-3 text-[11px] text-[var(--color-accent)] hover:underline disabled:opacity-60"
        >
          {loading ? "Regenerating…" : "Regenerate"}
        </button>
      )}
    </div>
  );
}
