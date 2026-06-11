"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import Hero from "./Hero";
import Problem from "./Problem";
import FeatureGrid from "./FeatureGrid";
import HowItWorks from "./HowItWorks";
import Comparison from "./Comparison";
import Pricing from "./Pricing";
import FAQ from "./FAQ";
import WaitlistForm from "./WaitlistForm";
import AgentTicker from "./AgentTicker";

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
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#how" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export default function LandingPage() {
  const { user, loading } = useAuth();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Authed users are redirected to /chat by AuthContext — don't flash the page.
  if (loading || user) return null;

  return (
    <div id="top" className="landing-root">
      {/* Sticky nav */}
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
            {/* Sign-in is intentionally hidden during private beta — visitors join
                the waitlist, they don't sign in. The /login route still works for
                admins who navigate to it directly. */}
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
        <Hero />
        <Problem />
        <FeatureGrid />
        <AgentTicker />
        <HowItWorks />
        <Comparison />
        <Pricing />
        <WaitlistForm />
        <FAQ />
      </main>

      <Footer />
    </div>
  );
}

function Footer() {
  const links = ["About", "Pricing", "Privacy Policy", "Terms of Service", "Contact"];
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
                key={l}
                href="#"
                className="text-[13px] text-[var(--lp-muted)] hover:text-[var(--lp-text)] transition-colors"
              >
                {l}
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
