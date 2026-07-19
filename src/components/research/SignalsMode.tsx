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
import { LensEmptyState } from "./primitives";

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
    <div style={{ border: "1px solid var(--color-border)", borderRadius: 4, overflow: "hidden", background: "var(--color-bg)" }}>
      <div className="flex items-center justify-between" style={{ padding: "9px 14px", borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
        <div className="flex items-center" style={{ gap: 9 }}>
          <span className="mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", color: "var(--color-text)" }}>LIVE SIGNALS</span>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--color-muted)" }}>what&apos;s moving across the S&amp;P 500</span>
        </div>
        <button
          className="tbtn"
          disabled={status === "loading" || events.length === 0}
          onClick={() => run(events)}
        >
          {status === "loading" ? "…" : "REFRESH"}
        </button>
      </div>

      <div style={{ padding: 14 }}>
        {status === "loading" && feed.length === 0 ? (
          <div className="flex flex-col items-center justify-center" style={{ minHeight: 240, gap: 10 }}>
            <div className="spin" style={{ width: 28, height: 28, border: "2.5px solid var(--color-border)", borderTopColor: "var(--color-accent)", borderRadius: "50%" }} />
            <p style={{ fontSize: 12, color: "var(--color-muted)" }}>Scanning the tape for notable moves…</p>
          </div>
        ) : status === "error" ? (
          <div className="flex flex-col items-center justify-center" style={{ minHeight: 200, gap: 8, textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "var(--color-bear)" }}>{err}</p>
            <button className="tbtn" onClick={() => run(events)}>Retry</button>
          </div>
        ) : feed.length === 0 ? (
          <LensEmptyState
            title={loading ? "Loading the universe…" : "A quiet tape"}
            detail={loading ? "Signals appear once the S&P 500 data loads." : "No standout cross-sectional moves right now."}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {feed.map((item, i) => {
              const color = SENTIMENT_COLOR[item.sentiment];
              return (
                <div key={`${item.ticker}-${i}`} className="flex" style={{ gap: 12, padding: "12px 4px", borderBottom: i < feed.length - 1 ? "1px solid var(--color-border)" : "none" }}>
                  <div style={{ width: 3, alignSelf: "stretch", background: color, borderRadius: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-center" style={{ gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                      <Link href={`/stock/${item.ticker}`} className="tklink mono" style={{ fontSize: 13, fontWeight: 800, color: "var(--color-text)" }}>{item.ticker}</Link>
                      <span className="mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: color, padding: "2px 6px", borderRadius: 3, background: `color-mix(in oklab, ${color} 12%, transparent)` }}>
                        {SIGNAL_CATEGORY_LABEL[item.category].toUpperCase()}
                      </span>
                      <span className="serif" style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text)" }}>{item.headline}</span>
                    </div>
                    <p style={{ fontSize: 12, lineHeight: 1.5, color: "var(--color-text-secondary)" }}>{item.take}</p>
                  </div>
                </div>
              );
            })}
            <p style={{ fontSize: 10, color: "var(--color-muted)", lineHeight: 1.5, paddingTop: 12 }}>
              Events are computed from live factor and market data; narration is AI-written. Research color, not advice.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
