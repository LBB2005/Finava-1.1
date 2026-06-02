type Tier = {
  name: string;
  price: string;
  cadence?: string;
  annual?: string;
  blurb: string;
  features: string[];
  cta: string;
  featured?: boolean;
};

const TIERS: Tier[] = [
  {
    name: "Research",
    price: "$25",
    cadence: "/ month",
    annual: "or $240/year — save $60",
    blurb: "Everything you need to research any stock.",
    features: [
      "30 multi-agent queries / month",
      "Full 15-agent analysis on any ticker",
      "Portfolio tracker with live P&L",
      "Backtesting engine (3 strategy types)",
      "Conversational chat (unlimited)",
      "Weekly AI market briefing",
    ],
    cta: "Start with Research",
  },
  {
    name: "Pro",
    price: "$59",
    cadence: "/ month",
    annual: "or $564/year — save $144",
    blurb: "For investors who want to go further.",
    features: [
      "100 multi-agent queries / month",
      "Everything in Research, plus:",
      "Priority processing",
    ],
    cta: "Start with Pro",
    featured: true,
  },
  {
    name: "Power",
    price: "Usage-based",
    blurb: "For serious investors who run deep research daily.",
    features: [
      "Unlimited multi-agent queries",
      "All Pro features",
      "API access",
      "Custom strategy configuration",
      "Dedicated support",
    ],
    cta: "Contact us",
  },
];

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5 text-[var(--lp-accent-2)]">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function Pricing() {
  return (
    <section id="pricing" className="max-w-[1140px] mx-auto px-5 sm:px-8 py-24 md:py-28">
      <div className="max-w-2xl mx-auto text-center mb-14">
        <span className="lp-eyebrow text-[var(--lp-accent-2)]">Pricing</span>
        <h2 className="lp-display mt-3 text-[clamp(1.9rem,4vw,2.8rem)] font-bold text-[var(--lp-text)]">
          Institutional-grade research. Individual pricing.
        </h2>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 items-start">
        {TIERS.map((t) => (
          <div
            key={t.name}
            className={`rounded-2xl p-7 relative ${
              t.featured
                ? "border-2 border-[var(--lp-accent)] bg-[var(--lp-surface)] shadow-[0_24px_60px_-30px_rgba(77,156,248,0.6)] lg:-mt-3 lg:mb-3"
                : "lp-card"
            }`}
          >
            {t.featured && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] font-bold uppercase tracking-wider text-[#070b16] bg-[var(--lp-accent)] px-3 py-1 rounded-full">
                Most popular
              </span>
            )}
            <h3 className="text-[15px] font-semibold text-[var(--lp-text-secondary)] uppercase tracking-wide">
              {t.name}
            </h3>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="lp-display text-[2.4rem] font-black text-[var(--lp-text)]">
                {t.price}
              </span>
              {t.cadence && (
                <span className="text-[15px] text-[var(--lp-muted)]">{t.cadence}</span>
              )}
            </div>
            {t.annual ? (
              <p className="mt-1 text-[12.5px] text-[var(--lp-muted)]">{t.annual}</p>
            ) : (
              <p className="mt-1 text-[12.5px] text-[var(--lp-muted)]">&nbsp;</p>
            )}
            <p className="mt-4 text-[14px] text-[var(--lp-text-secondary)]">{t.blurb}</p>

            <a
              href="#waitlist"
              className={`mt-6 block text-center text-[14px] font-semibold px-5 py-3 rounded-xl transition-colors ${
                t.featured
                  ? "text-[#070b16] bg-[var(--lp-accent)] hover:bg-[var(--lp-accent-2)]"
                  : "text-[var(--lp-text)] border border-[var(--lp-border-strong)] hover:bg-[var(--lp-surface-2)]"
              }`}
            >
              {t.cta}
            </a>

            <ul className="mt-7 space-y-3">
              {t.features.map((f) => (
                <li key={f} className="flex gap-2.5 text-[13.5px] text-[var(--lp-text-secondary)]">
                  <Check />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-10 text-center text-[13px] text-[var(--lp-muted)]">
        All plans include a 14-day free trial. No credit card required to join the waitlist.
      </p>
      <p className="mt-2 text-center text-[12px] text-[var(--lp-muted)] italic max-w-2xl mx-auto">
        Lucra is a research tool, not a financial advisor. All outputs are for informational
        purposes and do not constitute investment advice.
      </p>
    </section>
  );
}
