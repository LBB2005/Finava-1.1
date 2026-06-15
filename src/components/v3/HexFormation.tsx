"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import HoneycombBackdrop from "@/components/landing/HoneycombBackdrop";
import { AGENTS } from "@/components/landing/agentData";
import { AgentIcon } from "./agentIcons";

type Variant = "cascade" | "converge" | "deal";

const VARIANTS: { id: Variant; label: string; blurb: string }[] = [
  { id: "cascade", label: "A · Cascade", blurb: "One seed ripples outward, ring by ring." },
  { id: "converge", label: "B · Converge", blurb: "Fifteen analysts fly in and lock to formation." },
  { id: "deal", label: "C · Deal", blurb: "Agents flip into place like a dealt hand." },
];

const HEX_CLIP = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";
const TILE_W = 116; // px, pointy-top hex box width
const TILE_H = TILE_W * 1.1547; // 2/sqrt(3)
const SIZE = (TILE_W * 1.07) / Math.sqrt(3); // circumradius incl. ~7% gap
const SEED_HOLD = 0.16; // fraction of scroll the lone seed holds before fanning out

// Build a centered honeycomb cluster of exactly 15 pointy-top hexes, ordered
// from the center outward (so we can stagger by ring distance).
function useCluster() {
  return useMemo(() => {
    const cells: { q: number; r: number; dist: number; ang: number }[] = [];
    for (let q = -2; q <= 2; q++) {
      for (let r = -2; r <= 2; r++) {
        const dist = (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
        if (dist > 2) continue;
        const x = Math.sqrt(3) * (q + r / 2);
        const y = 1.5 * r;
        cells.push({ q, r, dist, ang: Math.atan2(y, x) });
      }
    }
    cells.sort((a, b) => a.dist - b.dist || a.ang - b.ang);
    return cells.slice(0, 15).map((c, i) => ({
      x: SIZE * Math.sqrt(3) * (c.q + c.r / 2),
      y: SIZE * 1.5 * c.r,
      dist: c.dist,
      agent: AGENTS[i],
    }));
  }, []);
}

function findScroller(el: HTMLElement | null): HTMLElement | null {
  let n = el?.parentElement ?? null;
  while (n) {
    const oy = getComputedStyle(n).overflowY;
    // Note: overflow-x:hidden forces computed overflow-y to "auto", so also
    // require the element to actually scroll before treating it as the scroller.
    if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 1) return n;
    n = n.parentElement;
  }
  return null;
}

export default function HexFormation() {
  const [variant, setVariant] = useState<Variant>("cascade");
  const trackRef = useRef<HTMLDivElement>(null); // tall scroll track
  const stickyRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<(HTMLDivElement | null)[]>([]);
  const countRef = useRef<HTMLSpanElement>(null);
  const cluster = useCluster();

  // Scale the cluster down on narrow viewports so it always fits.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fit = () => {
      const maxX = Math.max(...cluster.map((c) => Math.abs(c.x))) + TILE_W / 2;
      const avail = Math.min(window.innerWidth - 40, 760);
      stage.style.setProperty("--cluster-scale", String(Math.min(1, avail / (maxX * 2))));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [cluster]);

  // Build a paused timeline and drive its progress from the scroll position of
  // the sticky track. Robust across window- or element-scrolled layouts.
  useEffect(() => {
    const tiles = tileRefs.current.filter(Boolean) as HTMLDivElement[];
    const labels = tiles.map((t) => t.querySelector<HTMLElement>(".hx-label"));
    if (!tiles.length) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const others = tiles.slice(1); // index 0 is the center seed
    const otherLabels = labels.slice(1);

    gsap.set(tiles, { clearProps: "all" });

    if (reduce) {
      gsap.set(tiles, { opacity: 1, scale: 1, x: 0, y: 0, rotateY: 0 });
      gsap.set(labels, { opacity: 1 });
      if (countRef.current) countRef.current.textContent = "15";
      return;
    }

    const tl = gsap.timeline({ paused: true });
    gsap.set(tiles[0], { opacity: 1, scale: 1, x: 0, y: 0 });
    gsap.set(labels[0], { opacity: 1 });
    tl.to({}, { duration: SEED_HOLD }); // hold the single seed

    if (variant === "cascade") {
      gsap.set(others, { opacity: 0, scale: 0.18, x: 0, y: 0, rotate: -8 });
      gsap.set(otherLabels, { opacity: 0 });
      tl.to(others, {
        opacity: 1, scale: 1, rotate: 0,
        x: (i) => cluster[i + 1].x, y: (i) => cluster[i + 1].y,
        ease: "back.out(1.5)", duration: 0.7, stagger: { each: 0.05 },
      }, ">")
        .to(otherLabels, { opacity: 1, duration: 0.4, stagger: { each: 0.05 } }, "<0.25");
    } else if (variant === "converge") {
      gsap.set(others, {
        opacity: 0, scale: 0.7, rotate: 0,
        x: (i) => cluster[i + 1].x * 2.1, y: (i) => cluster[i + 1].y * 2.1,
      });
      gsap.set(otherLabels, { opacity: 0 });
      tl.to(others, {
        opacity: 1, scale: 1,
        x: (i) => cluster[i + 1].x, y: (i) => cluster[i + 1].y,
        ease: "power3.out", duration: 1.0, stagger: { each: 0.06, from: "random" },
      }, ">")
        .to(otherLabels, { opacity: 1, duration: 0.4, stagger: { each: 0.06, from: "random" } }, "<0.3");
    } else {
      gsap.set(others, {
        x: (i) => cluster[i + 1].x, y: (i) => cluster[i + 1].y,
        opacity: 0, scale: 0.5, rotateY: 90, transformPerspective: 600,
      });
      gsap.set(otherLabels, { opacity: 0 });
      tl.to(others, {
        opacity: 1, scale: 1, rotateY: 0, ease: "power2.out", duration: 0.6,
        stagger: { each: 0.05, from: "center", grid: "auto" },
      }, ">")
        .to(otherLabels, { opacity: 1, duration: 0.3, stagger: { each: 0.05, from: "center" } }, "<0.2");
    }

    // Map scroll → progress. Compute from the track's live position relative to
    // its scroll container each frame — no brittle start/range measurement, and
    // it self-corrects whichever element actually scrolls.
    let scrollerEl: HTMLElement | null = findScroller(trackRef.current);
    let ticking = false;
    const apply = () => {
      ticking = false;
      const track = trackRef.current;
      if (!track) return;
      const sc = scrollerEl;
      const vh = sc ? sc.clientHeight : window.innerHeight;
      const scTop = sc ? sc.getBoundingClientRect().top : 0;
      const rectTop = track.getBoundingClientRect().top - scTop; // 0 when track hits top
      const p = Math.min(1, Math.max(0, -rectTop / Math.max(1, track.offsetHeight - vh)));
      tl.progress(p);
      if (countRef.current) {
        const n = p < SEED_HOLD ? 1 : Math.round(1 + ((p - SEED_HOLD) / (1 - SEED_HOLD)) * 14);
        countRef.current.textContent = String(Math.min(15, Math.max(1, n)));
      }
    };
    const schedule = () => { if (!ticking) { ticking = true; requestAnimationFrame(apply); } };
    const onScroll = (e: Event) => {
      const t = e.target;
      if (t instanceof HTMLElement && t.contains(trackRef.current)) scrollerEl = t;
      schedule();
    };
    apply();
    // capture phase catches non-bubbling scroll from whichever ancestor scrolls
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", schedule);

    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", schedule);
      tl.kill();
    };
  }, [variant, cluster]);

  return (
    <div ref={trackRef} className="relative" style={{ height: "320vh" }}>
      <div ref={stickyRef} className="sticky top-0 h-screen overflow-hidden">
        <HoneycombBackdrop />

        {/* heading rail */}
        <div className="absolute top-[11vh] left-0 right-0 z-20 px-6 text-center pointer-events-none">
          <span className="lp-eyebrow inline-flex items-center gap-2 text-[var(--lp-accent-2)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--lp-accent)] animate-pulse" />
            Watch one analyst become fifteen
          </span>
          <h2 className="lp-display mt-4 text-[clamp(1.8rem,4.5vw,3rem)] font-black text-[var(--lp-text)]">
            <span ref={countRef} className="text-[var(--lp-accent-2)] tabular-nums">1</span>{" "}
            specialist{" "}
            <span className="text-[var(--lp-muted)] font-normal text-[0.55em] align-middle">on the case</span>
          </h2>
          <p className="mt-2 text-[13.5px] text-[var(--lp-muted)] max-w-md mx-auto">
            {VARIANTS.find((v) => v.id === variant)!.blurb}
          </p>
        </div>

        {/* the hex stage, centered */}
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div
            ref={stageRef}
            className="relative"
            style={{ transform: "scale(var(--cluster-scale,1))", marginTop: "7vh" }}
          >
            {cluster.map((c, i) => (
              <div
                key={c.agent.name}
                ref={(el) => { tileRefs.current[i] = el; }}
                className="absolute"
                style={{
                  width: TILE_W,
                  height: TILE_H,
                  left: `calc(50% - ${TILE_W / 2}px)`,
                  top: `calc(50% - ${TILE_H / 2}px)`,
                  willChange: "transform, opacity",
                }}
              >
                <div
                  className="relative w-full h-full grid place-items-center text-center"
                  style={{ filter: `drop-shadow(0 0 14px ${c.agent.color}33)` }}
                >
                  <div className="absolute inset-0" style={{ clipPath: HEX_CLIP, background: `linear-gradient(160deg, ${c.agent.color}, ${c.agent.color}55)` }} />
                  <div className="absolute" style={{ inset: 1.5, clipPath: HEX_CLIP, background: "linear-gradient(180deg, #10192c 0%, var(--lp-bg-2) 100%)" }} />
                  <div className="hx-label relative z-10 flex flex-col items-center gap-1 px-2">
                    <span style={{ color: c.agent.color }}>
                      <AgentIcon name={c.agent.name} />
                    </span>
                    <span className="text-[11.5px] font-semibold leading-tight text-[var(--lp-text)]">
                      {c.agent.name}
                    </span>
                    <span
                      className="text-[10px] font-medium tracking-wide"
                      style={{ color: c.agent.color, fontFamily: "var(--font-geist-mono, monospace)" }}
                    >
                      {c.agent.value}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* variant toggle */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 rounded-full border border-[var(--lp-border-strong)] bg-[rgba(11,17,32,0.82)] p-1 backdrop-blur">
          {VARIANTS.map((v) => (
            <button
              key={v.id}
              onClick={() => setVariant(v.id)}
              className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors ${
                variant === v.id
                  ? "bg-[var(--lp-accent)] text-[#070b16]"
                  : "text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)]"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
