import AgentFan from "./AgentFan";

const STEPS = [
  {
    n: "1",
    title: "Type your question",
    body:
      'Ask anything: "Is NVDA overvalued right now?" or "What are insiders doing at AAPL?" Natural language — no syntax to learn.',
  },
  {
    n: "2",
    title: "15 agents fire in parallel",
    body:
      "Finava dispatches specialists across fundamentals, valuation, technicals, insider data, sentiment, and macro — all simultaneously, all pulling from real data sources.",
  },
  {
    n: "3",
    title: "Get a synthesised briefing",
    body:
      "A CEO-level synthesis agent compiles every finding into a single, readable briefing with an explicit view and confidence level. Then a skeptic agent pressure-tests it.",
  },
  {
    n: "4",
    title: "Dig deeper or act on it",
    body:
      "Ask follow-ups, add the stock to a watchlist, or track it in your portfolio and let Finava brief you on it every week.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className="max-w-[1140px] mx-auto px-5 sm:px-8 py-24 md:py-28">
      <div className="max-w-2xl">
        <span className="lp-eyebrow text-[var(--lp-accent-2)]">How it works</span>
        <h2 className="lp-display mt-3 text-[clamp(1.9rem,4vw,2.8rem)] font-bold text-[var(--lp-text)]">
          From question to conviction in minutes.
        </h2>
      </div>

      <div className="mt-12">
        <AgentFan />
        <p className="text-center text-[13px] text-[var(--lp-muted)] mt-2">
          15 specialists, dealt on every question.
        </p>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-4">
        {STEPS.map((s, i) => (
          <div key={s.n} className="relative">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-[var(--lp-accent-soft)] text-[var(--lp-accent-2)] flex items-center justify-center text-[15px] font-bold">
                {s.n}
              </span>
              {i < STEPS.length - 1 && (
                <span className="hidden md:block flex-1 h-px bg-[var(--lp-border)]" />
              )}
            </div>
            <h3 className="mt-4 text-[16px] font-semibold text-[var(--lp-text)]">{s.title}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-[var(--lp-text-secondary)]">
              {s.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
