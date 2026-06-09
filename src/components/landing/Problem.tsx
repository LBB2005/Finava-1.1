export default function Problem() {
  return (
    <section className="max-w-[1140px] mx-auto px-5 sm:px-8 py-24 md:py-28">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="lp-display text-[clamp(1.9rem,4vw,2.8rem)] font-bold text-[var(--lp-text)]">
          You&apos;re making six-figure decisions with incomplete information.
        </h2>
        <div className="mt-7 space-y-5 text-[clamp(1rem,1.4vw,1.15rem)] leading-relaxed text-[var(--lp-text-secondary)]">
          <p>
            The tools retail investors have access to fall into two categories: too shallow, or too
            expensive.
          </p>
          <p>
            Free platforms give you a stock chart and three bullet points of news. Seeking Alpha
            gives you one writer&apos;s opinion, once a week, on the stocks they choose to cover.
            Bloomberg Terminal costs $32,000 a year and requires weeks of training to use. And
            ChatGPT hallucinates balance sheet numbers.
          </p>
          <p>
            None of them do what a real analyst team does: pull every relevant signal
            simultaneously, synthesise it into a clear view, and tell you what it means for your
            position.
          </p>
          <p className="text-[var(--lp-text)] font-medium">
            That gap is exactly what Finava was built to close.
          </p>
        </div>
      </div>
    </section>
  );
}
