import AgentGridCompress from "./AgentGridCompress";
import HoneycombBackdrop from "./HoneycombBackdrop";

export default function Hero() {
  return (
    <section className="lp-hero relative overflow-hidden">
      <HoneycombBackdrop />
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
            Lucra deploys 15 specialized AI agents simultaneously on any stock — covering
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

        {/* 15 specialists → one verdict */}
        <AgentGridCompress />
      </div>
    </section>
  );
}
