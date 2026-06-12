"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import gsap from "gsap";
import { SPECIALISTS, CEO, V5AgentIcon } from "./v5Agents";

// ─────────────────────────────────────────────────────────────────────────────
// v5 scroll showpiece: ONE honeycomb canvas sits behind both the hero (passed
// in as `hero`) and the pinned scene, so the lattice is a single unbroken field
// with no seam. Pre-pin it is drawn in page space (scrolls with the content);
// once the track pins, the anchor locks to the viewport and the dolly zoom
// takes over: the anchor cell resolves into the CEO Synthesis hex, then 14
// specialists deploy outward with step-synced captions on the right.
//
// Scroll plumbing: this route lives inside AppShell's overflow-y-auto <main>,
// NOT a window scroller — so no ScrollTrigger. We use position:sticky for the
// pin and recompute timeline progress every rAF from the track's bounding rect
// (works no matter which ancestor scrolls, and even for programmatic scrolls
// that fire no scroll event). The same rAF drives the breathing canvas.
// ─────────────────────────────────────────────────────────────────────────────

const HEX_CLIP = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";
const BASE_R = 26; // honeycomb circumradius at zoom 1 — identical to HoneycombBackdrop
const DRAW_INSET = 3; // hero draws hexPath at r-3; we keep the same inset, scaled
const ZOOM_MAX = 2.4; // "~2x" dolly target on desktop; shrinks to fit on phones

// 15 cells of a centered honeycomb cluster (axial coords, dist ≤ 2), ordered
// center-out then by angle: index 0 = CEO seed, 1..14 = specialists.
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
    return cells.slice(0, 15);
  }, []);
}

const ALL_AGENTS = [...SPECIALISTS, CEO]; // caption order; CEO caption lands last

export default function DeployScene({ hero }: { hero: ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<(HTMLDivElement | null)[]>([]); // index 0 = CEO
  const glowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const captionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const cluster = useCluster();

  const [reduce, setReduce] = useState(false);
  const [layout, setLayout] = useState({ zoom: ZOOM_MAX, mobile: false, fx: 0.42 });

  // Fit the final formation to the viewport: shrink the dolly target on narrow
  // screens so the outer ring never clips, and center it when captions move to
  // the bottom bar.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // matchMedia is client-only; reading it in an effect (not render) is the
    // hydration-safe way to pick it up without an SSR mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReduce(mq.matches);
    const onMq = () => setReduce(mq.matches);
    mq.addEventListener("change", onMq);

    const fit = () => {
      const w = window.innerWidth;
      const mobile = w < 768;
      const fx = mobile ? 0.5 : 0.42;
      // formation half-extent ≈ 2·√3·R (ring-2 center) + tile half-width (≈0.77·R)
      const avail = mobile ? w / 2 - 10 : w * fx - 24;
      const maxR = avail / (2 * Math.sqrt(3) + 0.9);
      const zoom = Math.max(1.3, Math.min(ZOOM_MAX, maxR / BASE_R));
      setLayout((p) =>
        p.zoom === zoom && p.mobile === mobile && p.fx === fx ? p : { zoom, mobile, fx }
      );
    };
    fit();
    window.addEventListener("resize", fit);
    return () => {
      mq.removeEventListener("change", onMq);
      window.removeEventListener("resize", fit);
    };
  }, []);

  const { zoom: zoomEnd, mobile, fx } = layout;
  const FY = 0.52; // vertical focus of the dolly / formation center
  const R_F = BASE_R * zoomEnd; // lattice circumradius at full zoom
  const HEX_R = (BASE_R - DRAW_INSET) * zoomEnd; // visual hex matches canvas inset
  const TILE_W = Math.sqrt(3) * HEX_R;
  const TILE_H = 2 * HEX_R;
  const pos = useMemo(
    () =>
      cluster.map((c) => ({
        x: R_F * Math.sqrt(3) * (c.q + c.r / 2),
        y: R_F * 1.5 * c.r,
      })),
    [cluster, R_F]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const track = trackRef.current;
    const sticky = stickyRef.current;
    if (!canvas || !track || !sticky) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const tiles = tileRefs.current.filter(Boolean) as HTMLDivElement[];
    const glows = glowRefs.current.filter(Boolean) as HTMLDivElement[];
    const captions = captionRefs.current.filter(Boolean) as HTMLLIElement[];

    const proxy = { zoom: reduce ? zoomEnd : 1, seed: reduce ? 1 : 0, alpha: 0.55 };
    const mouse = { x: -9999, y: -9999 };
    let w = 0;
    let h = 0;
    let t = 0;
    let raf = 0;
    let target = 0;
    let cur = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const hexPath = (cx: number, cy: number, r: number) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 180) * (60 * i - 30);
        const px = cx + r * Math.cos(a);
        const py = cy + r * Math.sin(a);
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.closePath();
    };

    // Same lattice math as HoneycombBackdrop (r=26, dx=r√3, dy=1.5r, odd rows
    // offset dx/2), anchored so one cell center sits exactly on the dolly focus
    // — that cell is the seed the camera zooms into. The anchor lives in PAGE
    // space until the track pins (lattice scrolls with the hero), locks to the
    // viewport during the pin, and rides away with the page after release —
    // one continuous field, no seam anywhere.
    const draw = () => {
      const z = proxy.zoom;
      const rz = BASE_R * z;
      const dx = rz * Math.sqrt(3);
      const dy = rz * 1.5;
      const vh = sticky.clientHeight;
      const a = track.getBoundingClientRect().top;
      const anchorViewportY =
        FY * vh + Math.max(0, a) + Math.min(0, a + track.offsetHeight - vh);
      const fxp = fx * w;
      const fyp = anchorViewportY - canvas.getBoundingClientRect().top;
      ctx.clearRect(0, 0, w, h);
      canvas.style.opacity = String(proxy.alpha);

      const rowMin = -Math.ceil(fyp / dy) - 1;
      const rowMax = Math.ceil((h - fyp) / dy) + 1;
      const colMin = -Math.ceil(fxp / dx) - 1;
      const colMax = Math.ceil((w - fxp) / dx) + 1;
      ctx.lineWidth = 1 + (z - 1) * 0.45;

      for (let row = rowMin; row <= rowMax; row++) {
        const odd = ((row % 2) + 2) % 2;
        const cy = fyp + row * dy;
        for (let col = colMin; col <= colMax; col++) {
          const cx = fxp + (col + (odd ? 0.5 : 0)) * dx;
          // breathing wave in lattice space so it dollies with the field
          const distC = Math.hypot(cx - fxp, cy - fyp) / z;
          const wave = 0.5 + 0.5 * Math.sin(t - distC * 0.022);
          const dm = Math.hypot(cx - mouse.x, cy - mouse.y);
          const near = Math.max(0, 1 - dm / 150);
          const isSeed = row === 0 && col === 0;

          const stroke =
            0.05 + wave * 0.11 + near * 0.35 + (isSeed ? proxy.seed * 0.55 : 0);
          hexPath(cx, cy, rz - DRAW_INSET * z);
          ctx.strokeStyle = `rgba(77, 156, 248, ${Math.min(1, stroke)})`;
          ctx.stroke();

          const fill =
            Math.max(0, (wave - 0.9) * 1.2) + near * 0.22 + (isSeed ? proxy.seed * 0.22 : 0);
          if (fill > 0.01) {
            ctx.fillStyle = `rgba(124, 192, 255, ${Math.min(0.4, fill)})`;
            ctx.fill();
          }
        }
      }
    };

    // ── timeline ────────────────────────────────────────────────────────────
    // (no clearProps here — "all" would wipe React's inline width/left styles;
    // every animated prop is explicitly gsap.set below instead)
    const tl = gsap.timeline({ paused: true });

    if (reduce) {
      // No zoom, no pin choreography: fully-formed formation, all captions on.
      // Reset every animated prop explicitly — the animated branch may have run
      // first (reduce-motion state lands after mount) and left scales behind.
      tiles.forEach((tile, i) => gsap.set(tile, { autoAlpha: 1, scale: 1, x: pos[i].x, y: pos[i].y }));
      gsap.set(glows[0], { opacity: 0.6 });
      gsap.set(glows.slice(1), { opacity: 0.4 });
      // mobile stacks captions in one slot — show only the closing CEO line there
      captions.forEach((cap, i) =>
        gsap.set(cap, { autoAlpha: mobile && i < captions.length - 1 ? 0 : 1, x: 0 })
      );
      gsap.set(introRef.current, { autoAlpha: 0, scale: 1 });
      resize();
      draw(); // single static frame
      window.addEventListener("resize", resize);
      return () => window.removeEventListener("resize", resize);
    }

    gsap.set(tiles[0], { autoAlpha: 0, scale: 1.25 });
    gsap.set(tiles.slice(1), { autoAlpha: 0, scale: 0.4, x: 0, y: 0 });
    gsap.set(glows, { opacity: 0 });
    gsap.set(captions, { autoAlpha: 0, x: 12 });

    // ── scrubbed part: scroll drives the dolly up to the CEO resolve ────────
    // (positions are fractions of the scrub; SCRUB_END below maps it to scroll)
    tl.to(proxy, { zoom: zoomEnd, ease: "power2.inOut", duration: 0.62 }, 0);
    tl.to(proxy, { alpha: 0.78, ease: "power1.inOut", duration: 0.62 }, 0);
    tl.to(
      introRef.current,
      { scale: 1.6, autoAlpha: 0, filter: "blur(7px)", ease: "power2.in", duration: 0.42 },
      0.1
    );
    tl.to(proxy, { seed: 1, ease: "power1.inOut", duration: 0.22 }, 0.42);
    tl.to({}, { duration: 0.36 }, 0.64); // dwell — everything past the seed is timed

    // ── timed part: fires the instant the seed resolves. The CEO pop, the
    // beat after it, and the 15 deploys all run on their own clock — zero
    // further scrolling needed once you glimpse the CEO.
    // These two constants ARE the speed knob.
    const FLY_S = 0.55; // seconds each agent takes to fly to its cell
    const STEP_S = 0.2; // seconds between consecutive deploys
    const deploy = gsap.timeline({ paused: true, delay: 0 });
    deploy.to(tiles[0], { autoAlpha: 1, scale: 1, ease: "power2.out", duration: 0.3 }, 0);
    deploy.to(glows[0], { opacity: 0.45, duration: 0.25 }, 0.18);
    SPECIALISTS.forEach((_, i) => {
      const at = 0.6 + i * STEP_S; // CEO pop + the little breath he gets
      deploy.to(
        tiles[i + 1],
        { autoAlpha: 1, scale: 1, x: pos[i + 1].x, y: pos[i + 1].y, ease: "power3.out", duration: FLY_S },
        at
      );
      // ignite on landing: glow pops, then settles
      deploy.to(glows[i + 1], { opacity: 1, ease: "power1.out", duration: 0.14 }, at + FLY_S * 0.7);
      deploy.to(glows[i + 1], { opacity: 0.38, ease: "power1.inOut", duration: 0.3 }, at + FLY_S * 0.7 + 0.14);
      // caption lands with the hex; the previous one steps back — on mobile the
      // rows overlap in one slot, so clear the old line before the new one lands
      deploy.to(captions[i], { autoAlpha: 1, x: 0, ease: "power2.out", duration: 0.25 }, at + (mobile ? 0.16 : 0.1));
      if (i > 0) deploy.to(captions[i - 1], { autoAlpha: mobile ? 0 : 0.5, duration: mobile ? 0.1 : 0.25 }, at + (mobile ? 0.05 : 0.1));
    });
    // CEO Synthesis finale: the center ignites fully and the last caption lands
    const tEnd = 0.6 + 13 * STEP_S + FLY_S + 0.15;
    deploy.to(captions[13], { autoAlpha: mobile ? 0 : 0.5, duration: mobile ? 0.1 : 0.25 }, tEnd);
    deploy.to(glows[0], { opacity: 1, ease: "power1.out", duration: 0.22 }, tEnd);
    deploy.to(glows[0], { opacity: 0.65, duration: 0.35 }, tEnd + 0.25);
    deploy.to(tiles[0], { scale: 1.06, ease: "power1.inOut", duration: 0.22 }, tEnd);
    deploy.to(tiles[0], { scale: 1, ease: "power1.inOut", duration: 0.3 }, tEnd + 0.25);
    deploy.to(captions[14], { autoAlpha: 1, x: 0, ease: "power2.out", duration: 0.3 }, tEnd + 0.12);

    // scroll share of the pin that the scrub occupies; past it the stage just
    // dwells (pinned) while the timed deploy plays and then stays put
    const SCRUB_END = 0.45;
    // fire as soon as the seed cell has resolved (≈66% of the scrub) — not at
    // the end of it, so no extra scrolling is needed once the CEO appears
    const DEPLOY_AT = SCRUB_END * 0.66;
    let deployed = false;

    // ── per-frame: progress from the track's rect + smoothing + canvas ──────
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const rect = track.getBoundingClientRect();
      const range = Math.max(1, track.offsetHeight - sticky.clientHeight);
      // rect.top is measured against the viewport, which is what sticky pins
      // to here regardless of which ancestor actually scrolls.
      target = Math.min(1, Math.max(0, -rect.top / range));
      // time-based scrub smoothing: frame-rate independent, and a long rAF gap
      // (backgrounded tab) catches up in one frame instead of drifting behind
      cur += (target - cur) * (1 - Math.exp(-dt * 9));
      if (Math.abs(target - cur) < 0.0004) cur = target;
      tl.progress(Math.min(1, cur / SCRUB_END));
      // CEO is fully resolved → fire the timed deploy once; it keeps playing
      // (and then stays) no matter how the user scrolls. Scrolling back to the
      // top re-arms it so the sequence replays on the next dive.
      if (!deployed && cur >= DEPLOY_AT) {
        deployed = true;
        deploy.play(0);
      } else if (deployed && cur < 0.06) {
        deployed = false;
        deploy.pause(0);
      }
      t += Math.min(dt, 0.05); // breathing clock — capped so gaps don't jump it
      draw();
      raf = requestAnimationFrame(loop);
    };

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const onLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      deploy.kill();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      tl.kill();
    };
  }, [reduce, zoomEnd, mobile, fx, pos]);

  const tileLabel = (name: string, isCeo: boolean) => (
    <div className="hx-label relative z-10 flex flex-col items-center gap-1 px-1.5 text-center">
      <span className={isCeo ? "text-[var(--lp-accent-2)]" : "text-[var(--lp-accent)]"}>
        <V5AgentIcon name={name} />
      </span>
      {(!mobile || isCeo) && (
        <span
          className={`text-[10px] font-semibold leading-[1.15] ${
            isCeo ? "text-[var(--lp-text)]" : "text-[var(--lp-text-secondary)]"
          }`}
        >
          {name}
        </span>
      )}
    </div>
  );

  return (
    <section
      className="relative"
      style={{
        // ambient page-space gradients shared by hero + scene (the canvas
        // strokes draw on top), so there is no background seam either
        background:
          "radial-gradient(900px 480px at 78% -8%, rgba(77,156,248,0.18), transparent 60%)," +
          "radial-gradient(700px 420px at 8% 12%, rgba(124,192,255,0.08), transparent 55%)," +
          "linear-gradient(180deg, #070b16 0%, #0a1020 38%, #070b16 100%)",
      }}
    >
      {/* the single shared honeycomb — behind the hero AND the pinned scene */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="sticky top-0 h-screen">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{
              opacity: 0.55,
              // soft bottom vignette: reads as depth during the scene and lets
              // the lattice fade out gracefully into the closing CTA — no hard
              // edge where the canvas ends
              maskImage: "linear-gradient(180deg, #000 0%, #000 80%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(180deg, #000 0%, #000 80%, transparent 100%)",
            }}
          />
        </div>
      </div>

      {/* hero content rides above the lattice in normal flow */}
      <div className="relative z-10">{hero}</div>

      <div
        ref={trackRef}
        id="engine"
        className="relative z-10"
        style={{ height: reduce ? "auto" : "260vh" }}
      >
        <div
          ref={stickyRef}
          className={`${reduce ? "relative" : "sticky top-0"} h-screen overflow-hidden`}
        >
          {/* intro line — rides the dolly, then dissolves */}
        <div
          ref={introRef}
          className="absolute z-10 text-center pointer-events-none px-6 w-full"
          style={{ left: 0, top: `${FY * 100}%`, transform: "translateY(-50%)" }}
        >
          <span className="lp-eyebrow text-[var(--lp-muted)]">Under the hood</span>
          <h2 className="lp-display mt-4 text-[clamp(2rem,5vw,3.4rem)] font-black text-[var(--lp-text)]">
            Ask one question.
          </h2>
        </div>

        {/* CEO + 14 specialist hexes, locked to the zoomed lattice cells */}
        <div
          className="absolute z-20"
          style={{ left: `${fx * 100}%`, top: `${FY * 100}%` }}
          aria-hidden={!reduce}
        >
          {cluster.map((c, i) => {
            const isCeo = i === 0;
            const agent = isCeo ? CEO : SPECIALISTS[i - 1];
            return (
              <div
                key={agent.name}
                ref={(el) => {
                  tileRefs.current[i] = el;
                }}
                className="absolute"
                style={{
                  width: TILE_W,
                  height: TILE_H,
                  left: -TILE_W / 2,
                  top: -TILE_H / 2,
                  willChange: "transform, opacity",
                }}
              >
                <div className="relative w-full h-full grid place-items-center">
                  <div
                    className="absolute inset-0"
                    style={{
                      clipPath: HEX_CLIP,
                      background: isCeo
                        ? "linear-gradient(165deg, rgba(124,192,255,0.95), rgba(77,156,248,0.35))"
                        : "linear-gradient(165deg, rgba(124,192,255,0.55), rgba(77,156,248,0.14))",
                    }}
                  />
                  <div
                    className="absolute"
                    style={{
                      inset: 1.5,
                      clipPath: HEX_CLIP,
                      background: isCeo
                        ? "linear-gradient(180deg, #122036 0%, #0b1120 100%)"
                        : "linear-gradient(180deg, #0e1830 0%, #0b1120 100%)",
                    }}
                  />
                  {/* ignition glow */}
                  <div
                    ref={(el) => {
                      glowRefs.current[i] = el;
                    }}
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      clipPath: HEX_CLIP,
                      opacity: 0,
                      background:
                        "radial-gradient(60% 60% at 50% 50%, rgba(77,156,248,0.38), transparent 75%)",
                      filter: "drop-shadow(0 0 18px rgba(77,156,248,0.5))",
                    }}
                  />
                  {tileLabel(agent.name, isCeo)}
                </div>
              </div>
            );
          })}
        </div>

        {/* step-synced captions — right rail on desktop, bottom line on mobile */}
        <aside
          className={
            mobile
              ? "absolute z-30 left-0 right-0 bottom-7 px-6"
              : "absolute z-30 right-0 top-1/2 -translate-y-1/2 w-[min(345px,30vw)] pr-8 lg:pr-12"
          }
        >
          <p className="lp-eyebrow text-[var(--lp-accent-2)] mb-5 max-md:text-center max-md:mb-3">
            One question. Fifteen analysts deploy.
          </p>
          <ol className={mobile ? "relative h-12" : "flex flex-col gap-[9px]"}>
            {ALL_AGENTS.map((a, i) => (
              <li
                key={a.name}
                ref={(el) => {
                  captionRefs.current[i] = el;
                }}
                className={mobile ? "absolute inset-x-0 top-0 text-center" : ""}
                style={{ willChange: "opacity, transform" }}
              >
                <span
                  className="text-[12px] font-semibold text-[var(--lp-accent-2)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {a.name}
                </span>
                <span className="text-[12.5px] text-[var(--lp-text-secondary)]">
                  {" "}
                  — {a.caption}
                </span>
              </li>
            ))}
          </ol>
        </aside>
        </div>
      </div>
    </section>
  );
}
