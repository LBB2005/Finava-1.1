"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Stock } from "@/lib/research";
import { deriveSignals } from "@/lib/signals";
import { authFetch } from "@/lib/authFetch";
import {
  SIGNAL_CATEGORY_LABEL,
  type SignalFeedItem,
  type SignalEvent,
} from "@/lib/researchAI";
import { LensPanel, LensSpinner } from "./primitives";

type Status = "idle" | "loading" | "done" | "error";

const SENTIMENT_COLOR: Record<SignalFeedItem["sentiment"], string> = {
  bullish: "var(--color-bull)",
  bearish: "var(--color-bear)",
  neutral: "var(--color-warn)",
};

export default function SignalsMode({ universe, loading }: { universe: Stock[]; loading: boolean }) {
  const [feed, setFeed] = useState<SignalFeedItem[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [err, setErr] = useState<string | null>(null);
  const ranRef = useRef(false);

  const events = useMemo(() => deriveSignals(universe), [universe]);

  async function run(evts: SignalEvent[]) {
    if (evts.length === 0) return;
    setStatus("loading");
    setErr(null);
    try {
      const res = await authFetch("/api/research/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: evts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setFeed(Array.isArray(data.feed) ? data.feed : []);
      setStatus("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load signals.");
      setStatus("error");
    }
  }

  // Auto-run once when the universe (and therefore events) first arrives.
  useEffect(() => {
    if (ranRef.current || events.length === 0) return;
    ranRef.current = true;
    run(events);
  }, [events]);

  return (
    <LensPanel
      title="LIVE SIGNALS"
      meta="what's moving across the S&P 500"
      right={
        <button
          className="tbtn"
          disabled={status === "loading" || events.length === 0}
          onClick={() => run(events)}
        >
          {status === "loading" ? "…" : "REFRESH"}
        </button>
      }
    >
      <div style={{ padding: 14 }}>
        {status === "loading" && feed.length === 0 ? (
          <div className="flex flex-col items-center justify-center" style={{ minHeight: 240, gap: 10 }}>
            <LensSpinner />
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>Scanning the tape for notable moves…</p>
          </div>
        ) : status === "error" ? (
          <div className="flex flex-col items-center justify-center" style={{ minHeight: 240, gap: 8, textAlign: "center" }}>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-bear)" }}>{err}</p>
            <button className="tbtn" onClick={() => run(events)}>Retry</button>
          </div>
        ) : feed.length === 0 ? (
          <div className="flex flex-col items-center justify-center" style={{ minHeight: 240, textAlign: "center", gap: 6 }}>
            <p className="serif" style={{ fontSize: "var(--text-lg)", fontWeight: 700, color: "var(--color-text)" }}>{loading ? "Loading the universe…" : "A quiet tape"}</p>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>{loading ? "Signals appear once the S&P 500 data loads." : "No standout cross-sectional moves right now."}</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {feed.map((item, i) => {
              const color = SENTIMENT_COLOR[item.sentiment];
              return (
                <div key={`${item.ticker}-${i}`} className="flex" style={{ gap: 12, padding: "12px 4px", borderBottom: i < feed.length - 1 ? "1px solid var(--color-border)" : "none" }}>
                  <div style={{ width: 3, alignSelf: "stretch", background: color, borderRadius: "var(--radius-xs)", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-center" style={{ gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                      <Link href={`/stock/${item.ticker}`} className="tklink mono" style={{ fontSize: "var(--text-sm)", fontWeight: 800, color: "var(--color-text)" }}>{item.ticker}</Link>
                      <span className="mono" style={{ fontSize: "var(--text-micro)", fontWeight: 700, letterSpacing: "0.08em", color: color, padding: "2px 6px", borderRadius: "var(--radius-xs)", background: `color-mix(in oklab, ${color} 12%, transparent)` }}>
                        {SIGNAL_CATEGORY_LABEL[item.category].toUpperCase()}
                      </span>
                      <span className="serif" style={{ fontSize: "var(--text-body)", fontWeight: 700, color: "var(--color-text)" }}>{item.headline}</span>
                    </div>
                    <p style={{ fontSize: "var(--text-sm)", lineHeight: 1.5, color: "var(--color-text-secondary)" }}>{item.take}</p>
                  </div>
                </div>
              );
            })}
            <p style={{ fontSize: "var(--text-micro)", color: "var(--color-muted)", lineHeight: 1.5, paddingTop: 12 }}>
              Events are computed from live factor and market data; narration is AI-written. Research color, not advice.
            </p>
          </div>
        )}
      </div>
    </LensPanel>
  );
}
