"use client";
import { useState } from "react";

const QA = [
  {
    q: "Is Lucra's data real, or is it making things up?",
    a: "Every figure in a Lucra briefing is pulled from a primary source — SEC EDGAR for financials and insider transactions, Finnhub for market data and earnings, and Perplexity for real-time news and sentiment. When Lucra can't verify a data point, it says so rather than guessing.",
  },
  {
    q: "Is Lucra giving me financial advice?",
    a: "No. Lucra is a research tool — it synthesises information and presents analysis, but every decision is yours to make. Think of it like having a very thorough analyst team: they give you the research, you decide what to do with it.",
  },
  {
    q: "How is this different from just asking ChatGPT about a stock?",
    a: "ChatGPT doesn't have access to real-time market data, SEC filings, or live financial figures. It also doesn't maintain context about your portfolio or investment style across sessions. Lucra is purpose-built for investment research: 15 domain-specific agents, real data sources, and a persistent memory of what you own and how you invest.",
  },
  {
    q: "Can I import my existing portfolio?",
    a: "Yes. Lucra supports manual entry, CSV upload, and brokerage statement parsing. Once your holdings are in, every AI analysis is automatically contextualised to your actual positions.",
  },
  {
    q: "What happens to my data?",
    a: "Your portfolio and conversation data is stored securely in Firebase and never sold to third parties. See our Privacy Policy for details.",
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="max-w-[760px] mx-auto px-5 sm:px-8 py-24 md:py-28">
      <div className="text-center mb-12">
        <span className="lp-eyebrow text-[var(--lp-accent-2)]">FAQ</span>
        <h2 className="lp-display mt-3 text-[clamp(1.9rem,4vw,2.8rem)] font-bold text-[var(--lp-text)]">
          Common questions
        </h2>
      </div>

      <div className="space-y-3">
        {QA.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={i} className="lp-card rounded-xl overflow-hidden">
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="w-full flex items-center justify-between gap-4 text-left px-5 py-4"
                aria-expanded={isOpen}
              >
                <span className="text-[15px] font-medium text-[var(--lp-text)]">{item.q}</span>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="flex-shrink-0 text-[var(--lp-muted)] transition-transform duration-200"
                  style={{ transform: isOpen ? "rotate(180deg)" : "none" }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <div
                className="grid transition-all duration-200 ease-out"
                style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
              >
                <div className="overflow-hidden">
                  <p className="px-5 pb-5 text-[14px] leading-relaxed text-[var(--lp-text-secondary)]">
                    {item.a}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
