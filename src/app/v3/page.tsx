import type { Metadata } from "next";
import HexFormation from "@/components/v3/HexFormation";

export const metadata: Metadata = {
  title: "Finava v3 — One analyst becomes fifteen",
  description:
    "Experimental v3 hero: the hexagonal lattice where a single analyst multiplies into 15 specialist agents as you scroll.",
};

export default function V3Page() {
  return (
    <main
      className="landing-root min-h-screen bg-[var(--lp-bg)] text-[var(--lp-text)] antialiased"
      // .landing-root sets overflow-x:hidden, which would make this element a
      // sticky scroll-container and break the formation's position:sticky pin.
      // Keep it visible so sticky resolves against the real app scroller.
      style={{ overflowX: "visible" }}
    >
      {/* minimal top bar — no heavy nav */}
      <header className="absolute top-0 left-0 right-0 z-40">
        <div className="max-w-[1140px] mx-auto px-6 h-16 flex items-center justify-between">
          <span className="font-black tracking-tight text-[17px] lp-display">Finava</span>
          <a
            href="#join"
            className="inline-flex items-center justify-center text-[13.5px] font-semibold text-[#070b16] bg-[var(--lp-accent)] hover:bg-[var(--lp-accent-2)] transition-colors px-4 py-2 rounded-full shadow-[0_8px_24px_-10px_rgba(77,156,248,0.7)]"
          >
            Join the waitlist
          </a>
        </div>
      </header>

      {/* hero — instantly says what Finava does */}
      <section className="relative overflow-hidden">
        <div className="max-w-[1140px] mx-auto px-6 pt-28 pb-16 md:pt-36 md:pb-20">
          <div className="max-w-2xl">
            <span className="lp-eyebrow inline-flex items-center gap-2 text-[var(--lp-accent-2)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--lp-accent)] animate-pulse" />
              Now in private beta
            </span>
            <h1 className="lp-display mt-5 text-[clamp(2.6rem,7vw,4.8rem)] font-black leading-[1.02]">
              15 analysts.
              <br />
              <span className="text-[var(--lp-accent-2)]">One conversation.</span>
            </h1>
            <p className="mt-6 text-[clamp(1.05rem,1.6vw,1.25rem)] leading-relaxed text-[var(--lp-text-secondary)] max-w-xl">
              Finava deploys 15 specialized AI agents on any stock — fundamentals, DCF valuation,
              insider activity, technicals, macro, and sentiment — and synthesizes one clear briefing.
              Research depth that used to cost{" "}
              <span className="text-[var(--lp-text)] font-semibold">$32,000 a year.</span>
            </p>
            <div className="mt-8">
              <a
                id="join"
                href="#join"
                className="inline-flex items-center justify-center text-[15px] font-semibold text-[#070b16] bg-[var(--lp-accent)] hover:bg-[var(--lp-accent-2)] transition-colors px-7 py-3.5 rounded-xl shadow-[0_8px_30px_-8px_rgba(77,156,248,0.6)]"
              >
                Join the waitlist
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* the scroll showpiece: 1 → 15 on the honeycomb */}
      <HexFormation />

      {/* tail so the pinned section has somewhere to release into */}
      <section className="relative py-32 text-center">
        <p className="text-[var(--lp-muted)] text-sm">
          Fifteen specialists. One verdict. — the rest of the page lives below.
        </p>
      </section>
    </main>
  );
}
