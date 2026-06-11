"use client";
import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { story } from "./story";
import Sections from "./Sections";
import MagneticButton from "./MagneticButton";

// WebGL never touches the server — the whole scene loads client-side only.
const StoryCanvas = dynamic(() => import("./StoryCanvas"), { ssr: false });

const VERDICT_CONFIDENCE = 84;

function Nav({ navRef }: { navRef: React.RefObject<HTMLElement | null> }) {
  return (
    <header ref={navRef} className="v2-nav">
      <a href="#top" className="v2-wordmark" aria-label="Finava — back to top">FINAVA</a>
      <nav className="v2-nav-links" aria-label="Page sections">
        <a href="#agents">Agents</a>
        <a href="#compare">Compare</a>
        <a href="#pricing">Pricing</a>
      </nav>
      <a href="#waitlist" className="v2-nav-cta v2-mono">JOIN WAITLIST</a>
    </header>
  );
}

function BriefingCard({
  meterFillRef,
  meterNumRef,
  staticFill,
}: {
  meterFillRef?: React.RefObject<HTMLDivElement | null>;
  meterNumRef?: React.RefObject<HTMLSpanElement | null>;
  staticFill?: boolean;
}) {
  return (
    <div className="v2-briefing">
      <div className="v2-briefing-head">
        <span className="v2-mono" style={{ color: "#7cc0ff", letterSpacing: "0.14em", fontSize: 11 }}>
          CEO SYNTHESIS
        </span>
        <span className="v2-mono" style={{ color: "#6f7f97", fontSize: 11 }}>NVDA · NVIDIA CORP</span>
      </div>
      <p className="v2-briefing-verdict">Accumulate</p>
      <div className="v2-meter-row">
        <span className="v2-mono" style={{ fontSize: 11, color: "#aab8cc", letterSpacing: "0.1em" }}>CONFIDENCE</span>
        <div className="v2-meter">
          <div
            ref={meterFillRef}
            className="v2-meter-fill"
            style={{ width: staticFill ? `${VERDICT_CONFIDENCE}%` : "0%" }}
          />
        </div>
        <span ref={meterNumRef} className="v2-mono v2-meter-num">
          {staticFill ? `${VERDICT_CONFIDENCE}%` : "0%"}
        </span>
      </div>
      <p className="v2-briefing-body">
        Fourteen agents weigh in. Fundamentals and earnings power remain exceptional; valuation
        demands patience. Insider selling is routine, options flow leans bullish into the next print.
      </p>
      <div className="v2-briefing-chips">
        <span className="v2-chip v2-chip--bull">Fundamentals · strong</span>
        <span className="v2-chip v2-chip--bull">Options flow · bullish</span>
        <span className="v2-chip v2-chip--bear">Valuation · stretched</span>
      </div>
      <p className="v2-mono v2-briefing-foot">14 AGENT REPORTS · SYNTHESIZED IN 2M 41S</p>
    </div>
  );
}

function ActCopy({
  innerRef,
  align,
  eyebrow,
  title,
  body,
}: {
  innerRef: React.RefObject<HTMLDivElement | null>;
  align: "left" | "right";
  eyebrow: string;
  title: React.ReactNode;
  body: string;
}) {
  return (
    <div ref={innerRef} className={`v2-act v2-act--${align}`} style={{ opacity: 0, visibility: "hidden" }}>
      <p className="v2-eyebrow v2-mono">{eyebrow}</p>
      <h2 className="v2-act-title">{title}</h2>
      <p className="v2-act-body">{body}</p>
    </div>
  );
}

export default function V2Landing() {
  const rootRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const storyRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const act2Ref = useRef<HTMLDivElement>(null);
  const act3Ref = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const meterFillRef = useRef<HTMLDivElement>(null);
  const meterNumRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const [mounted, setMounted] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [hoverAgent, setHoverAgent] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe one-time client flags, same pattern as AuthContext
    setMounted(true);
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // Pointer parallax target + tooltip tracking. Device orientation feeds the
  // same channel on mobile (where it fires without a permission prompt).
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      story.px = (e.clientX / window.innerWidth) * 2 - 1;
      story.py = -((e.clientY / window.innerHeight) * 2 - 1);
      const tip = tooltipRef.current;
      if (tip) tip.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + 14}px)`;
    };
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      story.px = Math.max(-1, Math.min(1, e.gamma / 30));
      story.py = Math.max(-1, Math.min(1, (45 - e.beta) / 30));
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("deviceorientation", onOrient);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("deviceorientation", onOrient);
    };
  }, []);

  // Frosted nav: blur + border once the page scrolls.
  useEffect(() => {
    if (!mounted) return;
    const scroller = rootRef.current?.closest("main") ?? rootRef.current?.parentElement;
    if (!scroller) return;
    scroller.classList.add("v2-scroller");
    const onScroll = () => navRef.current?.toggleAttribute("data-scrolled", scroller.scrollTop > 24);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      scroller.classList.remove("v2-scroller");
    };
  }, [mounted]);

  // GSAP: scrubbed master timeline through the three acts + section reveals.
  useLayoutEffect(() => {
    if (!mounted || reduced) return;
    gsap.registerPlugin(ScrollTrigger);
    const scroller = (rootRef.current?.closest("main") ?? rootRef.current?.parentElement) as HTMLElement | null;
    if (!scroller || !storyRef.current) return;

    const ctx = gsap.context(() => {
      ScrollTrigger.defaults({ scroller });

      // (Hero entrance is pure CSS — see .v2-hero-stagger in v2.css — so it
      // completes even if the tab loads without animation frames.)

      // Master scrubbed timeline. Positions are progress fractions (a final
      // padding tween stretches the duration to exactly 1).
      const conf = { v: 0 };
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: storyRef.current,
          start: "top top",
          end: "bottom bottom",
          scrub: 1.1,
          onUpdate: (st) => {
            story.p = st.progress;
          },
        },
      });
      tl.to(heroRef.current, { autoAlpha: 0, y: -70, ease: "power1.in", duration: 0.08 }, 0.15)
        .fromTo(act2Ref.current, { autoAlpha: 0, y: 50 }, { autoAlpha: 1, y: 0, ease: "power2.out", duration: 0.06 }, 0.24)
        .to(act2Ref.current, { autoAlpha: 0, y: -50, ease: "power1.in", duration: 0.06 }, 0.42)
        .fromTo(act3Ref.current, { autoAlpha: 0, y: 50 }, { autoAlpha: 1, y: 0, ease: "power2.out", duration: 0.06 }, 0.54)
        .to(act3Ref.current, { autoAlpha: 0, y: -50, ease: "power1.in", duration: 0.06 }, 0.72)
        .fromTo(
          cardRef.current,
          { autoAlpha: 0, y: 60, scale: 0.94 },
          { autoAlpha: 1, y: 0, scale: 1, ease: "power2.out", duration: 0.1 },
          0.84
        )
        .to(
          conf,
          {
            v: VERDICT_CONFIDENCE,
            duration: 0.1,
            onUpdate: () => {
              if (meterNumRef.current) meterNumRef.current.textContent = `${Math.round(conf.v)}%`;
              if (meterFillRef.current) meterFillRef.current.style.width = `${conf.v}%`;
            },
          },
          0.86
        )
        .to({ _: 0 }, { _: 1, duration: 0.001 }, 0.999);

      // DOM marketing sections: quiet rise-and-fade reveals.
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        gsap.from(el, {
          y: 36,
          autoAlpha: 0,
          duration: 0.9,
          ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 86%" },
        });
      });

      // Geist-Mono counters that tick up from 0 every time they scroll into view.
      gsap.utils.toArray<HTMLElement>("[data-count]").forEach((el) => {
        const end = parseFloat(el.dataset.count || "0");
        const prefix = el.dataset.prefix ?? "";
        const suffix = el.dataset.suffix ?? "";
        const render = (v: number) => {
          el.textContent = prefix + Math.round(v).toLocaleString("en-US") + suffix;
        };
        render(0);
        const o = { v: 0 };
        gsap.to(o, {
          v: end,
          duration: 2,
          ease: "power3.out",
          onUpdate: () => render(o.v),
          scrollTrigger: {
            trigger: el,
            start: "top 92%",
            toggleActions: "restart none none reset",
          },
        });
      });
    }, rootRef);

    const raf = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => {
      cancelAnimationFrame(raf);
      ctx.revert();
    };
  }, [mounted, reduced]);

  const showCanvas = mounted && !reduced;

  return (
    <div ref={rootRef} id="top" className="v2-root">
      <Nav navRef={navRef} />

      {reduced ? (
        // ——— Calm fallback: no WebGL, no scrubbing — the story told statically ———
        <>
          <section className="v2-static-hero">
            <div className="v2-static-glow" aria-hidden />
            <p className="v2-eyebrow v2-mono">LIVE — 15 AGENTS DEPLOYED</p>
            <h1 className="v2-h1">
              15 analysts.<br /><em>One conversation.</em>
            </h1>
            <p className="v2-lede" style={{ textAlign: "center", margin: "0 auto 32px" }}>
              Finava deploys fifteen specialized AI agents on any stock at once — fundamentals to
              options flow — then synthesizes them into a single conviction-driven briefing.
            </p>
            <a href="#waitlist" className="v2-cta" style={{ textDecoration: "none" }}>Join the waitlist</a>
            <p className="v2-mono v2-hero-fine">$32,000/YR RESEARCH DEPTH · FROM $20/MO</p>
          </section>
          <section className="v2-section" style={{ display: "grid", gap: 64 }}>
            <div className="v2-act v2-act--static">
              <p className="v2-eyebrow v2-mono">THE NETWORK</p>
              <h2 className="v2-act-title">They don&apos;t think alone.</h2>
              <p className="v2-act-body">
                Every agent cross-examines the rest — insider sells stress-test bullish technicals,
                macro headwinds pressure the DCF. Disagreement isn&apos;t noise. It&apos;s the signal.
              </p>
            </div>
            <div className="v2-act v2-act--static">
              <p className="v2-eyebrow v2-mono">THE DATA</p>
              <h2 className="v2-act-title">Grounded in the living market.</h2>
              <p className="v2-act-body">
                SEC EDGAR filings, Finnhub market data, sentiment from Reddit, X and YouTube —
                analyzed the moment it moves, not summarized a quarter later.
              </p>
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <BriefingCard staticFill />
            </div>
          </section>
        </>
      ) : (
        // ——— The cinematic: 520vh scroll story over a sticky full-viewport canvas ———
        <div ref={storyRef} className="v2-story">
          <div className="v2-stage">
            {showCanvas && <StoryCanvas onHover={setHoverAgent} />}

            {/* Act overlays */}
            <div className="v2-overlays">
              {/* HERO */}
              <div ref={heroRef} className="v2-hero">
                <p className="v2-eyebrow v2-mono v2-hero-stagger">LIVE — 15 AGENTS DEPLOYED</p>
                <h1 className="v2-h1 v2-hero-stagger">
                  15 analysts.<br /><em>One conversation.</em>
                </h1>
                <p className="v2-lede v2-hero-stagger" style={{ textAlign: "center", margin: "0 auto 34px" }}>
                  Finava deploys fifteen specialized AI agents on any stock at once — fundamentals
                  to options flow — then synthesizes them into a single conviction-driven briefing.
                </p>
                <div className="v2-hero-stagger" style={{ pointerEvents: "auto" }}>
                  <MagneticButton
                    onClick={() => document.getElementById("waitlist")?.scrollIntoView({ behavior: "smooth" })}
                  >
                    Join the waitlist
                  </MagneticButton>
                </div>
                <p className="v2-mono v2-hero-fine v2-hero-stagger">$32,000/YR RESEARCH DEPTH · FROM $20/MO</p>
                <div className="v2-scrollcue v2-hero-stagger" aria-hidden>
                  <span className="v2-mono">SCROLL</span>
                  <span className="v2-scrollcue-line" />
                </div>
              </div>

              <ActCopy
                innerRef={act2Ref}
                align="left"
                eyebrow="ACT II — THE NETWORK"
                title={<>They don&apos;t think alone.</>}
                body="Every agent cross-examines the rest — insider sells stress-test bullish technicals, macro headwinds pressure the DCF. Disagreement isn't noise. It's the signal."
              />
              <ActCopy
                innerRef={act3Ref}
                align="right"
                eyebrow="ACT III — THE DATA"
                title={<>Grounded in the living market.</>}
                body="SEC EDGAR filings, Finnhub market data, sentiment from Reddit, X and YouTube — analyzed the moment it moves, not summarized a quarter later."
              />

              {/* RESOLUTION */}
              <div ref={cardRef} className="v2-card-wrap" style={{ opacity: 0, visibility: "hidden" }}>
                <BriefingCard meterFillRef={meterFillRef} meterNumRef={meterNumRef} />
              </div>
            </div>
          </div>
        </div>
      )}

      <Sections />

      {/* Agent-name tooltip, follows the cursor over the swarm */}
      <div ref={tooltipRef} className="v2-tooltip v2-mono" style={{ opacity: hoverAgent ? 1 : 0 }} aria-hidden>
        {hoverAgent}
      </div>
    </div>
  );
}
