"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import AgentTicker from "@/components/landing/AgentTicker";
import Comparison from "@/components/landing/Comparison";
import HowItWorks from "@/components/landing/HowItWorks";
import Pricing from "@/components/landing/Pricing";
import WaitlistForm from "@/components/landing/WaitlistForm";
import FAQ from "@/components/landing/FAQ";
import DeployScene from "./DeployScene";

// v5 prototype: the production hero, unchanged, whose honeycomb flows straight
// into the pinned "CEO deploys 15 analysts" scroll scene — no divider between.
// Header + wordmark are 1:1 replicas of LandingPage's (which isn't exported
// standalone and carries auth/redirect logic this prototype doesn't want).

function Wordmark() {
  return (
    <a href="#top" className="flex items-center gap-2.5 select-none">
      <span className="w-8 h-8 rounded-lg bg-[var(--lp-accent)] flex items-center justify-center shadow-sm">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#070b16" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
      </span>
      <span
        className="text-[19px] font-black uppercase leading-none text-[var(--lp-text)]"
        style={{ fontFamily: "var(--font-serif)", letterSpacing: "0.14em" }}
      >
        Finava
      </span>
    </a>
  );
}

const NAV_LINKS = [
  { label: "How it works", href: "#how" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export default function V5Landing() {
  const { user, loading } = useAuth();
  const rootRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  // This route scrolls inside AppShell's overflow-y-auto <main>, not window —
  // listen in the capture phase so we hear whichever ancestor actually scrolls.
  useEffect(() => {
    const onScroll = (e: Event) => {
      const el = e.target;
      if (el instanceof HTMLElement && el.contains(rootRef.current)) {
        setScrolled(el.scrollTop > 12);
      } else if (el === document) {
        setScrolled(window.scrollY > 12);
      }
    };
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, []);

  // Authed users are redirected to /chat by AuthContext — don't flash the page.
  if (loading || user) return null;

  return (
    <div
      id="top"
      ref={rootRef}
      className="landing-root"
      // .landing-root sets overflow-x:hidden, which would make this element a
      // sticky scroll-container and break the scene's position:sticky pin.
      // Keep it visible so sticky resolves against the real app scroller.
      style={{ overflowX: "visible" }}
    >
      {/* Sticky nav — 1:1 with the production landing header */}
      <header
        className="sticky top-0 z-50 transition-colors duration-200"
        style={{
          background: scrolled ? "rgba(7, 11, 22, 0.82)" : "transparent",
          backdropFilter: scrolled ? "blur(12px)" : "none",
          borderBottom: scrolled ? "1px solid var(--lp-border)" : "1px solid transparent",
        }}
      >
        <nav className="max-w-[1140px] mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Wordmark />
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-[13.5px] font-medium text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)] transition-colors"
              >
                {l.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2.5">
            <a
              href="#waitlist"
              className="text-[13.5px] font-semibold text-[#070b16] bg-[var(--lp-accent)] hover:bg-[var(--lp-accent-2)] transition-colors px-4 py-2 rounded-lg shadow-sm"
            >
              Join Waitlist
            </a>
          </div>
        </nav>
      </header>

      <main>
        {/* Hero (production copy minus the verdict block) + scene share ONE
            honeycomb canvas inside DeployScene — a single unbroken lattice */}
        <DeployScene
          hero={
            <div className="max-w-[1140px] mx-auto px-5 sm:px-8 pt-20 pb-24 md:pt-28 md:pb-32 relative z-10">
            <div className="max-w-2xl">
              <span className="lp-eyebrow inline-flex items-center gap-2 text-[var(--lp-accent-2)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--lp-accent)] animate-pulse" />
                Now in private beta
              </span>

              <h1 className="lp-display mt-5 text-[clamp(2.6rem,7vw,4.8rem)] font-black text-[var(--lp-text)]">
                15 analysts.
                <br />
                <span className="text-[var(--lp-accent-2)]">One conversation.</span>
              </h1>

              <p className="mt-6 text-[clamp(1.05rem,1.6vw,1.25rem)] leading-relaxed text-[var(--lp-text-secondary)] max-w-xl">
                Finava deploys 15 specialized AI agents simultaneously on any stock — covering
                fundamentals, DCF valuation, insider transactions, technicals, macro, sentiment, and
                more — giving you research depth that used to cost{" "}
                <span className="text-[var(--lp-text)] font-semibold">$32,000 a year.</span>
              </p>

              <div className="mt-9 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <a
                  href="#waitlist"
                  className="inline-flex items-center justify-center text-[15px] font-semibold text-[#070b16] bg-[var(--lp-accent)] hover:bg-[var(--lp-accent-2)] transition-colors px-7 py-3.5 rounded-xl shadow-[0_8px_30px_-8px_rgba(77,156,248,0.6)]"
                >
                  Join the Waitlist
                </a>
                <a
                  href="#how"
                  className="inline-flex items-center justify-center gap-1.5 text-[15px] font-medium text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)] transition-colors px-5 py-3.5"
                >
                  See how it works
                  <span aria-hidden>↓</span>
                </a>
              </div>

              <p className="mt-6 text-[13.5px] text-[var(--lp-muted)]">
                Built for investors who want real analysis — not stock tips.
              </p>
            </div>
            </div>
          }
        />

        {/* the rest of the marketing page — production sections, reused as-is */}
        <AgentTicker />
        <Comparison />
        <HowItWorks />
        <Pricing />
        <WaitlistForm />
        <FAQ />
      </main>

      <Footer />
    </div>
  );
}

// 1:1 replica of LandingPage's footer (not exported standalone) — carries the
// privacy/terms links and the investment disclaimer.
function Footer() {
  const links = [
    { label: "Pricing", href: "#pricing" },
    { label: "FAQ", href: "#faq" },
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Contact", href: "mailto:hello@finava.ai" },
  ];
  return (
    <footer className="border-t border-[var(--lp-border)] bg-[var(--lp-bg-2)]">
      <div className="max-w-[1140px] mx-auto px-5 sm:px-8 py-14">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="max-w-md">
            <Wordmark />
            <p className="mt-3 text-[14px] text-[var(--lp-text-secondary)]">
              The AI analyst team for self-directed investors.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {links.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="text-[13px] text-[var(--lp-muted)] hover:text-[var(--lp-text)] transition-colors"
              >
                {l.label}
              </a>
            ))}
          </div>
        </div>

        <div className="lp-divider my-8" />

        <p className="text-[11.5px] leading-relaxed text-[var(--lp-muted)] max-w-3xl">
          Finava is not a registered investment advisor. All content on this platform is for
          informational and educational purposes only and does not constitute financial,
          investment, or trading advice. Past performance is not indicative of future results.
          Investing involves risk, including the possible loss of principal. Always do your own
          research and consult a qualified financial advisor before making investment decisions.
        </p>
        <p className="mt-5 text-[12px] text-[var(--lp-muted)]">© 2026 Finava. All rights reserved.</p>
      </div>
    </footer>
  );
}
