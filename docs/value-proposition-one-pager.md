# Finava — Value Proposition One-Pager

*Formerly Lucra · finava.ai · June 2026. Every claim is backed by code (file paths) or cited competitor research (footnotes).*

---

## What it is — one sentence

> **Finava gives everyday investors their own research team: a panel of AI analysts that digs into any stock — and your actual portfolio — from every angle, shows its work, and tells you in plain English what matters.**

---

## Customer Value Proposition

**For** self-directed retail investors who make their own decisions but can't spend hours — or $24k/yr on a Bloomberg seat — doing institutional-grade diligence.

**The problem.** Today's tools force a bad trade-off. Research platforms (Perplexity, Google Finance, Fiscal.ai) know *markets* but not *you* — they can't see what you own. Portfolio tools (PortfolioPilot, Mezzi, Robinhood Cortex) know *you* but can't go *deep* — no valuation, no thesis-building. And all of them ship AI as a single answer box whose reasoning you can't inspect — which is exactly where they fail: independent testing found 37% of Google's AI finance answers inaccurate,¹ and PortfolioPilot was fined by the SEC for overstating its AI.²

**The value.** Finava closes the loop — **depth, context, and auditability** in one affordable product:

- **Depth** — a CEO agent orchestrates **15 specialist analysts in parallel** (fundamentals, technicals, insider filings, options flow, Graham value, macro, social hype…), then a **skeptic agent attacks the draft** before you see it (`src/agents/ceo.ts`, `src/agents/sub-agents/`).
- **Context** — Plaid links your real brokerage accounts; every conversation is primed with what you actually hold (`src/lib/plaidSync.ts`, `src/components/chat/GlobalComposer.tsx`).
- **Auditability** — analysis is grounded in primary sources (SEC EDGAR XBRL, Finnhub, Polygon), each agent's trace is visible in the chat, and untrusted web content is explicitly fenced (`src/lib/edgar.ts`, `src/lib/externalContent.ts`).

**The job it does:** *"Get me an institutional-quality second opinion on any stock — and on my own portfolio — in minutes, for the price of a streaming subscription."*

---

## How Finava is different

1. **A team, not a chatbot.** Every competitor ships one Q&A box. Finava's analysis is structurally multi-perspective: five signal agents stream live into the stock page's Finava tab and synthesize into a 0–100 score, fair-value estimate, catalysts, and risks (`/api/stock/[ticker]/finava-analysis`). Perplexity's comparable multi-agent product ("Computer") costs $200/mo or is enterprise-gated.³
2. **Valuation you can touch.** An interactive DCF computed from five years of real SEC cash-flow filings, with a WACC × growth sensitivity grid (`src/lib/dcf.ts`). Perplexity and Google do "DCF" only as a text prompt;⁴ Simply Wall St's is pre-baked. Interactive AI-assisted valuation is essentially unoccupied territory.
3. **It knows what you own.** Google explicitly disclaims personalized analysis;⁵ Fiscal.ai and Koyfin can't see portfolios. Finava's portfolio-aware chat is the default mode, not a bolt-on.
4. **Opinionated lenses, not a blank prompt.** Six research lenses — Board, Tune, Compare, Screen, Themes, Signals — score the **full S&P 500 (503 names) on six real factors** computed from primary data, with user-tunable weights, head-to-head radar comparisons, and plain-English screening (`src/lib/factors.ts`, `src/app/research/`).
5. **Honest economics.** Tiered model routing (Sonnet → Gemini Flash → Flash-Lite by task) plus per-user credit metering (`src/lib/llm.ts`, `src/lib/usage.ts`) makes deep multi-agent AI sustainable at a retail price point instead of a $200/mo gate.

**Where it's honestly at parity or behind:** Perplexity and Google have far greater licensed-data breadth (FactSet, S&P Global, live earnings transcripts) and free distribution; Public and Robinhood own trade execution; PortfolioPilot has RIA standing and optimization math (tax-loss harvesting, rebalancing) Finava doesn't do yet. Internally, stock-page sentiment is a Phase-1 placeholder and daily briefings are scaffolded, not live. Closest direct threats: **Fiscal.ai** (same user, deep data, but no portfolio awareness or multi-agent analysis)⁶ and **ChatGPT personal finance** (Plaid-linked but $100–200/mo and budgeting-framed).⁷

---

## Competitor snapshot

| | **Finava** | Perplexity Finance | Google Finance (beta) | PortfolioPilot | Public.com |
|---|---|---|---|---|---|
| **Core mechanic** | Multi-agent analyst team + factor lenses | Cited answer-engine over 40+ data feeds | Gemini Q&A + Deep Search | RIA portfolio scoring & optimization | Brokerage with AI layer |
| **Per-stock depth** | 15 agents + skeptic, visible traces | Text answers; agentic depth $200/mo+ ³ | "Bare-bones" on complex questions ⁸ | Baskets/screens only, $99/mo ⁹ | Snippets, heavy disclaimers ¹⁰ |
| **Interactive DCF** | ✅ from SEC filings | ❌ prompt-only ⁴ | ❌ | ❌ | ❌ |
| **Portfolio-aware AI** | ✅ Plaid + every chat primed | ✅ Plaid, reactive Q&A ¹¹ | ❌ watchlists only ⁵ | ✅ (its core) | ✅ (own brokerage) |
| **Tunable factor screening** | ✅ S&P 500, 6 factors | NL screener | Basic | ❌ | ❌ |
| **Executes trades** | ❌ by design | ❌ | ❌ | ❌ | ✅ AI agents ¹² |
| **Price** | Freemium + metered plans | $0 / $20 / $200 | Free | $0 / $29 / $99 | $0 / $10/mo + 0.49% AI fees |

---

## Potential — where this goes

- **Proactive intelligence.** Daily AI briefings and thesis-aware watchlist alerts — the briefing routes are already scaffolded (`src/app/api/briefing/`) and the Signals lens already computes the underlying events. Watchlists everywhere else are dumb lists.
- **From analysis to action.** Alpaca rails are wired (`/api/alpaca/*`); paper trading and agent-monitored strategies meet Public/Robinhood's agentic trading — with research-grade reasoning behind every move instead of a disclaimer.
- **A personalization moat.** Ticker memory (`tickerMemory` collection) plus conversation history compound into an analyst that knows your style, your holdings, and your past theses — the asset platform giants structurally won't build for liability reasons.⁵
- **Distribution.** Wealthsimple acquired Fey; IBKR backs Reflexivity — brokerages demonstrably pay for exactly this DNA.¹³ B2B2C or partnership is a live path alongside the consumer subscription.

---

### Sources

1. The College Investor, 2025 retest: 37% of Google AI finance answers inaccurate — thecollegeinvestor.com/66208
2. SEC press release 2024-36: $175k "AI-washing" settlement with Global Predictions (PortfolioPilot) — sec.gov/newsroom/press-releases/2024-36
3. Perplexity Computer for Professional Finance (May 2026), Max $200/mo — gadgetbond.com/perplexity-computer-for-professional-finance-launch
4. DCF on Perplexity is prompt-pattern only — gkotte.com/perplexity-finance
5. Google Search Help: "does not provide personalized financial advice"; watchlists, no broker sync — support.google.com/websearch/answer/16490185
6. Fiscal.ai (ex-FinChat): $39–79/mo, no portfolio linking — matchmybroker.com/tools/fiscal-ai-review
7. OpenAI ChatGPT personal finance (May 2026), Pro-only — openai.com/index/personal-finance-chatgpt
8. Techpoint Africa / College Investor depth reviews of Google & Perplexity finance AI
9. PortfolioPilot AI Equity Research = screens/baskets, Platinum tier — portfoliopilot.com/explore/ai-equity-research
10. Public Alpha: "not investment research… may give inaccurate responses" — help.public.com/en/articles/9354354
11. Perplexity Portfolio via Plaid (Mar 2026), reactive Q&A — wealthmanagement.com/artificial-intelligence/perplexity-upgrades-finance-capabilities
12. Public "Agentic Brokerage" AI Agents (Mar 31, 2026) — prnewswire.com (Public AI Agents release)
13. Fey → Wealthsimple (Aug 2025) — betakit.com; Reflexivity ← IBKR Series B — fintechfutures.com
