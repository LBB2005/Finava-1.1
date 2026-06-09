"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { AGENTS } from "./agentData";

// Hero centerpiece: a 5×3 wall of the 15 specialist agents fills in, then
// compresses and resolves into a single synthesized verdict — the "15 → 1" story.
type Phase = 0 | 1 | 2; // 0 idle · 1 filling · 2 collapsed

const EASE_OUT = [0.2, 0.8, 0.2, 1] as const;
const EASE_IN = [0.6, 0, 0.2, 1] as const;
const FILL_MS = AGENTS.length * 45 + 700;

export default function AgentGridCompress() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const started = useRef(false);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const run = useCallback(() => {
    clearTimers();
    setPhase(1);
    timers.current.push(setTimeout(() => setPhase(2), FILL_MS));
  }, []);

  // Kick the sequence off once when scrolled into view. Deps deliberately
  // exclude `phase` so re-renders never wipe the scheduled collapse timer.
  useEffect(() => {
    if (reduce) return;
    if (inView && !started.current) {
      started.current = true;
      run();
    }
  }, [inView, reduce, run]);

  // Clear timers only on unmount.
  useEffect(() => clearTimers, []);

  const replay = () => {
    started.current = true;
    run();
  };

  const tilesShown = reduce || phase >= 1;

  return (
    <div className="mt-16 md:mt-20">
      <div className="flex items-center gap-3 mb-5">
        <span className="lp-eyebrow text-[var(--lp-muted)]">15 specialists, one verdict</span>
        <span className="flex-1 lp-divider" />
        {!reduce && (
          <button
            onClick={replay}
            className="lp-replay-btn text-[11px] font-medium text-[var(--lp-muted)] hover:text-[var(--lp-accent-2)] transition-colors"
            aria-label="Replay animation"
          >
            ↻ replay
          </button>
        )}
      </div>

      <div ref={ref} className="relative" style={{ minHeight: 230 }}>
        {/* The wall of 15 agent tiles */}
        <motion.div
          className="grid grid-cols-5 gap-2 sm:gap-2.5"
          aria-hidden={phase === 2}
          animate={phase === 2 ? { scale: 1.45, opacity: 0 } : { scale: 1, opacity: 1 }}
          transition={{ duration: 0.7, ease: EASE_IN }}
          style={{ transformOrigin: "50% 55%" }}
        >
          {AGENTS.map((a, i) => (
            <motion.div
              key={a.name}
              className="lp-agent-tile rounded-lg px-2 py-2.5 flex flex-col items-center justify-center gap-1 text-center"
              initial={reduce ? false : { opacity: 0, scale: 0.82, y: 6 }}
              animate={tilesShown ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.82, y: 6 }}
              transition={{
                duration: 0.42,
                delay: !reduce && phase === 1 ? i * 0.045 : 0,
                ease: EASE_OUT,
              }}
            >
              <span className="text-[10px] sm:text-[11px] text-[var(--lp-muted)] leading-none truncate w-full">
                {a.short}
              </span>
              <span
                className="text-[12px] sm:text-[13px] font-bold leading-none"
                style={{ color: a.color }}
              >
                {a.value}
              </span>
            </motion.div>
          ))}
        </motion.div>

        {/* The single synthesized verdict it collapses into */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          initial={false}
          animate={
            phase === 2 ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.9, y: 10 }
          }
          transition={{ duration: 0.6, delay: phase === 2 ? 0.28 : 0, ease: EASE_OUT }}
          style={{ pointerEvents: phase === 2 ? "auto" : "none" }}
        >
          <div className="lp-verdict text-center px-7 py-6 rounded-2xl max-w-sm w-full">
            <span className="lp-eyebrow text-[var(--lp-accent-2)]">Synthesis</span>
            <p
              className="mt-1.5 text-[clamp(1.4rem,3vw,1.9rem)] font-extrabold text-[var(--lp-text)]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Buy · High conviction
            </p>
            <p className="mt-1 text-[13px] text-[var(--lp-text-secondary)]">
              12 of 15 lenses bullish · pressure-tested by a skeptic agent
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
