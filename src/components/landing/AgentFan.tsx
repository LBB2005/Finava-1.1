"use client";

import { useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { AGENTS } from "./agentData";

// A hand of specialist cards fanned out, dealt on scroll-into-view and
// spreading wider on hover. Illustrates "15 agents, dealt on every question".
const HAND = AGENTS.slice(0, 7);
const CENTER = (HAND.length - 1) / 2;

export default function AgentFan() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const open = reduce || inView;
  const spread = hovered ? 60 : 48;
  const lift = hovered ? 12 : 9;
  const tilt = hovered ? 10 : 8;

  return (
    <div
      ref={ref}
      className="relative mx-auto"
      style={{ height: 220, maxWidth: 560 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {HAND.map((a, i) => {
        const off = i - CENTER;
        return (
          <motion.div
            key={a.name}
            className="lp-fan-card absolute left-1/2 bottom-6 rounded-xl p-3 flex flex-col justify-between"
            style={{ width: 108, height: 148, marginLeft: -54, transformOrigin: "50% 120%" }}
            initial={false}
            animate={
              open
                ? { x: off * spread, y: Math.abs(off) * lift, rotate: off * tilt, opacity: 1 }
                : { x: off * 6, y: 0, rotate: off * 2, opacity: 0 }
            }
            transition={{
              type: "spring",
              stiffness: 220,
              damping: 26,
              delay: open && !reduce ? i * 0.05 : 0,
            }}
            whileHover={{ y: Math.abs(off) * lift - 14, transition: { duration: 0.18 } }}
          >
            <span className="text-[11px] font-bold" style={{ color: a.color }}>
              {a.name}
            </span>
            <span
              className="text-[20px] font-extrabold leading-none"
              style={{ fontFamily: "var(--font-serif)", color: "var(--lp-text)" }}
            >
              {a.value}
            </span>
            <span className="text-[9.5px] text-[var(--lp-muted)]">
              agent {i + 1}/15
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
