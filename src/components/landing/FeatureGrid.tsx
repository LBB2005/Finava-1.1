import type { ReactNode } from "react";

type Feature = {
  icon: ReactNode;
  title: string;
  body: string;
};

const I = (paths: ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    {paths}
  </svg>
);

const FEATURES: Feature[] = [
  {
    icon: I(<>
      <line x1="4" y1="20" x2="4" y2="10" />
      <line x1="10" y1="20" x2="10" y2="4" />
      <line x1="16" y1="20" x2="16" y2="13" />
      <line x1="22" y1="20" x2="2" y2="20" />
    </>),
    title: "Real numbers, not summaries.",
    body:
      "Finava pulls 5 years of SEC EDGAR XBRL data — revenue, margins, operating cash flow, R&D spend, debt load — and builds a full DCF model with terminal value. You see the actual inputs, not a black-box rating. If the model says the stock is overvalued by 40%, you know exactly why.",
  },
  {
    icon: I(<>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
      <circle cx="12" cy="12" r="10" />
    </>),
    title: "See who's buying before you do.",
    body:
      "Every Form 4 filing is a signal. Finava reads SEC insider transaction filings in real time, filters for meaningful purchases ($100K+), and identifies whether insiders are making new bets or adding to existing ones. The kind of data that used to require a dedicated EDGAR analyst.",
  },
  {
    icon: I(<>
      <path d="M2 12h4l3-8 4 16 3-8h6" />
    </>),
    title: "Know when a stock is getting crowded.",
    body:
      "Finava scans Reddit, X, YouTube, and financial forums in real time and returns a 0–10 hype score with sourced citations. Catch momentum before it peaks. Know when a narrative is already priced in.",
  },
  {
    icon: I(<>
      <line x1="6" y1="3" x2="6" y2="21" />
      <rect x="3.5" y="8" width="5" height="8" rx="1" />
      <line x1="16" y1="3" x2="16" y2="21" />
      <rect x="13.5" y="6" width="5" height="7" rx="1" />
    </>),
    title: "RSI, MACD, and moving averages — synthesised, not listed.",
    body:
      "Finava doesn't just display technical indicators — it tells you what they mean together. Bullish divergence on RSI while price tests the 200-day? You'll know, and you'll know why it matters.",
  },
  {
    icon: I(<>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M2.5 12h19" />
      <path d="M12 2.5c3 3 3 16 0 19c-3-3-3-16 0-19Z" />
    </>),
    title: "Your stock doesn't trade in a vacuum.",
    body:
      "Rate environment, yield curve shape, sector rotation, and regime context all affect your thesis. Finava's macro agent pulls multi-source economic data and tells you how the current environment affects the stock you're researching.",
  },
  {
    icon: I(<>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>),
    title: "Analyst consensus. Options flow. Peer comparables. Graham value.",
    body:
      "Finava's 15 agents cover every major analytical framework used by professional investors — Wall Street consensus targets, unusual options activity, peer group multiples, Benjamin Graham intrinsic value, and competitor analysis. Nothing is left on the table.",
  },
];

export default function FeatureGrid() {
  return (
    <section id="product" className="bg-[var(--lp-bg-2)] border-y border-[var(--lp-border)]">
      <div className="max-w-[1140px] mx-auto px-5 sm:px-8 py-24 md:py-28">
        <div className="max-w-2xl">
          <span className="lp-eyebrow text-[var(--lp-accent-2)]">The product</span>
          <h2 className="lp-display mt-3 text-[clamp(1.9rem,4vw,2.8rem)] font-bold text-[var(--lp-text)]">
            Type a ticker. Get the full picture.
          </h2>
          <p className="mt-4 text-[clamp(1rem,1.4vw,1.15rem)] text-[var(--lp-text-secondary)]">
            Finava deploys every specialist at once, so no angle gets missed.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="lp-card rounded-2xl p-6">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center text-[var(--lp-accent-2)] bg-[var(--lp-accent-soft)]">
                {f.icon}
              </div>
              <h3 className="mt-5 text-[17px] font-semibold text-[var(--lp-text)] leading-snug">
                {f.title}
              </h3>
              <p className="mt-3 text-[14px] leading-relaxed text-[var(--lp-text-secondary)]">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
