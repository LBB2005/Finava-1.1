"use client";
import { useState } from "react";
import MagneticButton from "./MagneticButton";

const AGENT_CARDS: { name: string; blurb: string }[] = [
  { name: "Fundamentals", blurb: "Margins, growth and balance-sheet quality, read from primary filings." },
  { name: "DCF Valuation", blurb: "Builds the discounted cash flow, then stress-tests every assumption." },
  { name: "Insider Activity", blurb: "Form 4 buys and sells — clustered, weighted, contextualized." },
  { name: "Technicals", blurb: "Trend, momentum and the levels that matter, across timeframes." },
  { name: "Sentiment", blurb: "Real crowd signal from Reddit, X and YouTube — not keyword counting." },
  { name: "Macro Context", blurb: "Rates, cycles and currency pressure on the thesis." },
  { name: "Earnings", blurb: "Transcripts, guidance and the beat-miss pattern over time." },
  { name: "Options Flow", blurb: "Unusual positioning and what smart money is paying for." },
  { name: "Risk", blurb: "What breaks the thesis — named, ranked, quantified." },
  { name: "Analyst Consensus", blurb: "Street targets, and the direction they're drifting." },
  { name: "Comparables", blurb: "Multiples against true peers, not sector averages." },
  { name: "Graham Value", blurb: "Classic margin-of-safety screens, run honestly." },
  { name: "News & Catalysts", blurb: "What just happened, and what's on the calendar next." },
  { name: "Competitor Analysis", blurb: "Share shifts, moats and the threats forming at the edges." },
];

const COMPARE_ROWS: { label: string; cells: (string | boolean)[] }[] = [
  { label: "Annual cost", cells: ["$240–$1,200", "$32,000", "~$300", "$240"] },
  { label: "15 specialized agents on every stock", cells: [true, false, false, false] },
  { label: "Primary-source data — SEC EDGAR, live market", cells: [true, true, "Partial", false] },
  { label: "Verdict with a confidence level", cells: [true, false, false, false] },
  { label: "Conversational follow-up", cells: [true, false, false, true] },
];

const TIERS = [
  {
    name: "Analyst",
    price: 20,
    tag: "For the weekend deep-diver",
    features: ["25 full briefings a month", "Watchlist with thesis-aware alerts", "Weekly briefing email", "Interactive DCF with saved scenarios"],
    featured: false,
  },
  {
    name: "Pro",
    price: 60,
    tag: "For the serious individual investor",
    features: ["Unlimited briefings", "Portfolio X-Ray — the agent team on your whole book", "All 15 agents, including Options Flow", "Priority synthesis speed"],
    featured: true,
  },
  {
    name: "Quant",
    price: 100,
    tag: "For people who used to pay $32,000",
    features: ["Everything in Pro", "Backtesting and regime models", "API access", "Highest model tier on every agent"],
    featured: false,
  },
];

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-label="Yes">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function WaitlistForm({ id }: { id?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "busy") return;
    setState("busy");
    setMsg("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setState("ok");
      } else {
        setState("err");
        setMsg(body?.error ?? "Something went wrong — try again.");
      }
    } catch {
      setState("err");
      setMsg("Network error — try again.");
    }
  }

  if (state === "ok") {
    return (
      <p id={id} className="v2-mono" style={{ color: "#34d399", fontSize: 14, letterSpacing: "0.06em" }}>
        YOU&apos;RE ON THE LIST — CONFIRMATION SENT.
      </p>
    );
  }

  return (
    <form id={id} onSubmit={submit} className="v2-waitlist-form" aria-label="Join the waitlist">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email address"
        className="v2-input"
      />
      <MagneticButton type="submit" disabled={state === "busy"}>
        {state === "busy" ? "Joining…" : "Join the waitlist"}
      </MagneticButton>
      {state === "err" && (
        <p role="alert" style={{ color: "#f87171", fontSize: 13, margin: "6px 0 0", width: "100%" }}>
          {msg}
        </p>
      )}
    </form>
  );
}

export default function Sections() {
  return (
    <>
      {/* ——— Stat band ——— */}
      <section className="v2-section" style={{ paddingTop: 110, paddingBottom: 40 }}>
        <div className="v2-statband" data-reveal>
          {/* Initial text is the final value so reduced-motion (no GSAP) still
              shows real numbers; the counter setup resets these to 0 on mount. */}
          <div className="v2-stat">
            <span className="v2-stat-num v2-mono" data-count="15">15</span>
            <span className="v2-stat-label">specialized agents on every stock</span>
          </div>
          <div className="v2-stat">
            <span className="v2-stat-num v2-mono" data-count="32000" data-prefix="$">$32,000</span>
            <span className="v2-stat-label">per year — what this depth used to cost</span>
          </div>
          <div className="v2-stat">
            <span className="v2-stat-num v2-mono" data-count="20" data-prefix="$" data-suffix="/mo">$20/mo</span>
            <span className="v2-stat-label">where Finava starts</span>
          </div>
        </div>
      </section>

      {/* ——— Agent grid ——— */}
      <section id="agents" className="v2-section">
        <p className="v2-eyebrow v2-mono" data-reveal>THE DESK</p>
        <h2 className="v2-h2" data-reveal>A full research desk,<br /><em>on demand.</em></h2>
        <p className="v2-lede" data-reveal>
          Every briefing starts with fourteen specialists working the same ticker at once.
          A fifteenth — the CEO Synthesis agent — weighs their disagreements and issues the verdict.
        </p>
        <div className="v2-agent-grid">
          {AGENT_CARDS.map((a, i) => (
            <div key={a.name} className="v2-agent-card" data-reveal>
              <span className="v2-agent-idx v2-mono">{String(i + 1).padStart(2, "0")}</span>
              <h3>{a.name}</h3>
              <p>{a.blurb}</p>
            </div>
          ))}
          <div className="v2-agent-card v2-agent-card--ceo" data-reveal>
            <span className="v2-agent-idx v2-mono" style={{ color: "#7cc0ff" }}>15</span>
            <h3>CEO Synthesis</h3>
            <p>
              Reads all fourteen reports, weighs the conflicts, and delivers one conviction-driven
              view — with a confidence level you can hold it to.
            </p>
          </div>
        </div>
      </section>

      {/* ——— Comparison ——— */}
      <section id="compare" className="v2-section">
        <p className="v2-eyebrow v2-mono" data-reveal>THE ALTERNATIVES</p>
        <h2 className="v2-h2" data-reveal>Why not just…</h2>
        <div className="v2-table-wrap" data-reveal>
          <table className="v2-table">
            <thead>
              <tr>
                <th aria-label="Capability" />
                <th className="v2-table-finava">Finava</th>
                <th>Bloomberg Terminal</th>
                <th>Seeking Alpha</th>
                <th>ChatGPT</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((row) => (
                <tr key={row.label}>
                  <td className="v2-table-label">{row.label}</td>
                  {row.cells.map((cell, i) => (
                    <td key={i} className={i === 0 ? "v2-table-finava" : undefined}>
                      {cell === true ? <Check /> : cell === false ? <span style={{ color: "#6f7f97" }}>—</span> : <span className="v2-mono" style={{ fontSize: 13 }}>{cell}</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="v2-footnote" data-reveal>
          Bloomberg gives you the data and 30 windows. Finava gives you the conclusion — and shows its work.
        </p>
      </section>

      {/* ——— Pricing ——— */}
      <section id="pricing" className="v2-section">
        <p className="v2-eyebrow v2-mono" data-reveal>PRICING</p>
        <h2 className="v2-h2" data-reveal>Institutional depth.<br /><em>Individual price.</em></h2>
        <div className="v2-pricing-grid">
          {TIERS.map((t) => (
            <div key={t.name} className={`v2-price-card${t.featured ? " v2-price-card--featured" : ""}`} data-reveal>
              {t.featured && <span className="v2-price-flag v2-mono">MOST POPULAR</span>}
              <h3>{t.name}</h3>
              <p className="v2-price-tag">{t.tag}</p>
              <div className="v2-price-num">
                <span className="v2-mono v2-price-dollar">${t.price}</span>
                <span className="v2-price-per">/mo</span>
              </div>
              <ul>
                {t.features.map((f) => (
                  <li key={f}>
                    <Check />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ——— Final CTA ——— */}
      <section id="waitlist" className="v2-section v2-final">
        <h2 className="v2-h2 v2-h2--big" data-reveal>
          Stop reading research.<br /><em>Start interrogating it.</em>
        </h2>
        <p className="v2-lede" data-reveal style={{ margin: "0 auto 36px", textAlign: "center" }}>
          Finava is in private beta. Join the waitlist and we&apos;ll send your invite as seats open.
        </p>
        <div data-reveal>
          <WaitlistForm />
        </div>
        <p className="v2-mono v2-final-fine" data-reveal>PRIVATE BETA · NO CARD REQUIRED</p>
      </section>

      {/* ——— Footer ——— */}
      <footer className="v2-footer">
        <span className="v2-wordmark">FINAVA</span>
        <span className="v2-footer-note">Research, not investment advice.</span>
        <span className="v2-mono" style={{ fontSize: 12, color: "#6f7f97" }}>© 2026 FINAVA · FINAVA.AI</span>
      </footer>
    </>
  );
}
