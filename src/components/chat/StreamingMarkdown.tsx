"use client";
import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { components as baseComponents } from "./Markdown";

/**
 * Claude-style streaming text. Two pieces:
 *   1. useSmoothStream — decouples the reveal from bursty SSE chunks, dripping
 *      characters out at a steady cadence so text never stutters.
 *   2. StreamingMarkdown — renders the revealed markdown with each newly-arrived
 *      word doing a soft fade-up. Stable per-word keys mean only fresh words
 *      animate; settled text stays put.
 */

/* ── Smooth-paced reveal ─────────────────────────────────────────────── */
export function useSmoothStream(raw: string, active: boolean): string {
  const [display, setDisplay] = useState(raw);
  const rawRef = useRef(raw);
  const idxRef = useRef(active ? 0 : raw.length);

  useEffect(() => {
    rawRef.current = raw;
    if (!active) idxRef.current = raw.length;
  }, [raw, active]);

  useEffect(() => {
    if (!active) {
      idxRef.current = rawRef.current.length;
      setDisplay(rawRef.current);
      return;
    }
    let frame = 0;
    let last = 0;
    const loop = (t: number) => {
      if (!last) last = t;
      const dt = t - last;
      last = t;
      const target = rawRef.current.length;
      // New stream started (content reset) — rewind.
      if (target < idxRef.current) idxRef.current = 0;
      const backlog = target - idxRef.current;
      if (backlog > 0) {
        // Steady base speed; accelerate when far behind so we never lag.
        const cps = Math.max(55, backlog * 5);
        const add = Math.min(backlog, Math.max(1, Math.round((cps * dt) / 1000)));
        idxRef.current += add;
        setDisplay(rawRef.current.slice(0, idxRef.current));
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return active ? display : raw;
}

/* ── Per-word fade-up ────────────────────────────────────────────────── */
function fadeWords(children: React.ReactNode, ctr: { n: number }): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child === "string") {
      // Keep whitespace as plain text; wrap visible words so each fades once.
      return child.split(/(\s+)/).map((part) =>
        part.trim() === ""
          ? part
          : <span key={`w${ctr.n++}`} className="stream-word">{part}</span>
      );
    }
    if (React.isValidElement(child)) {
      const el = child as React.ReactElement<{ children?: React.ReactNode }>;
      if (el.props?.children != null) {
        return React.cloneElement(el, { children: fadeWords(el.props.children, ctr) });
      }
    }
    return child;
  });
}

function Fade({ children }: { children: React.ReactNode }) {
  return <>{fadeWords(children, { n: 0 })}</>;
}

/* Wrap block-level text containers so their words fade as they stream in.
   Inline marks (strong/em/code/links) are reached by recursion, so their
   styling is preserved while the words inside still fade. */
const streamingComponents: Components = {
  ...baseComponents,
  p: ({ children }) => (
    <p className="text-[0.9rem] leading-[1.75] mb-3 last:mb-0 text-[var(--color-text)]">
      <Fade>{children}</Fade>
    </p>
  ),
  li: ({ children }) => (
    <li className="text-[0.9rem] leading-relaxed">
      <Fade>{children}</Fade>
    </li>
  ),
  h1: ({ children }) => (
    <h1
      style={{ fontFamily: "var(--font-serif)", fontSize: "1.15rem", fontWeight: 700, letterSpacing: "-0.012em", lineHeight: 1.28 }}
      className="text-[var(--color-text)] mt-6 mb-2 pb-1.5 border-b border-[var(--color-border)]"
    >
      <Fade>{children}</Fade>
    </h1>
  ),
  h2: ({ children }) => (
    <h2
      style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontWeight: 700, letterSpacing: "-0.012em", lineHeight: 1.28 }}
      className="text-[var(--color-text)] mt-5 mb-2"
    >
      <Fade>{children}</Fade>
    </h2>
  ),
  h3: ({ children }) => (
    <h3
      style={{ fontFamily: "var(--font-serif)", fontSize: 15, fontWeight: 700, letterSpacing: "-0.008em", lineHeight: 1.3 }}
      className="text-[var(--color-text-secondary)] mt-4 mb-1.5"
    >
      <Fade>{children}</Fade>
    </h3>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-[var(--color-accent-medium)] bg-[var(--color-accent-light)] rounded-r-xl pl-4 pr-3 py-2.5 my-3 text-[var(--color-text-secondary)] text-[0.9rem]">
      <Fade>{children}</Fade>
    </blockquote>
  ),
};

export default function StreamingMarkdown({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={streamingComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
