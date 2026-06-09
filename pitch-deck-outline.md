# Finava — Pitch Deck Outline
*Slide-by-slide content guide for a pre-seed/seed raise*
*Build when ready: target ~12 slides, ~10–15 minutes to present*

---

## Slide 1 — Cover

**Visual direction:** Clean, dark background. Finava wordmark. One-line descriptor below.

**Content:**
- Company name: **Finava**
- Tagline: *The AI analyst team for self-directed investors*
- Founder name + contact
- Date / round (add when pitching)

**Presenter note:** Don't over-explain on this slide. Let the name and tagline do the work. Open with the demo or the problem immediately.

---

## Slide 2 — The Hook (The Problem, Made Visceral)

**Visual direction:** Side-by-side contrast. Left: a Bloomberg Terminal screenshot (complex, expensive). Right: a retail investor's screen (Yahoo Finance tabs, Reddit, ChatGPT). Or: a single compelling statistic.

**Headline:** *Retail investors are making six-figure decisions with tools built for browsing.*

**Key stats to include:**
- 50+ million self-directed investors in the US
- Average self-directed investor spends 3–5 hours per week on research
- Bloomberg Terminal: $31,980/year — the gold standard, priced for institutions
- The gap between what professionals use and what individuals can afford has never been larger

**Body (2–3 sentences):**
There is no middle ground between "Seeking Alpha gives me one person's opinion once a week" and "Bloomberg costs $32,000 a year." Retail investors are stitching together research from 10 browser tabs, asking ChatGPT questions it can't reliably answer, and making decisions without the full picture. Finava is that middle ground.

---

## Slide 3 — The Insight (Why Now)

**Visual direction:** Simple statement slide. Or timeline showing LLM capability progression.

**Headline:** *Large language models just crossed the threshold that makes this possible.*

**Key points:**
- Multi-agent LLM systems can now perform genuine analyst-quality reasoning — this wasn't true 3 years ago
- Real-time data APIs (SEC EDGAR, financial market data, web search) can now be combined with LLMs to produce accurate, sourced analysis at scale
- The cost of running a "team of analysts" on any stock has dropped from $1M+/year to dollars per query
- The timing is right: retail investor sophistication is increasing (post-2020 generation), but tools haven't kept up

---

## Slide 4 — The Product (Show, Don't Tell)

**Visual direction:** Product screenshot or short demo GIF. This is the most important slide. Make it visual.

**Headline:** *15 AI analysts. One conversation. Any stock.*

**Sub-headline:** *Type a question. Finava deploys every specialist at once.*

**Show:**
- The chat interface with a real query ("Give me the full picture on NVDA before earnings")
- The agent activity panel (show all 15 agents firing)
- A condensed version of the final briefing output

**Caption / annotations:**
- "15 specialist agents run in parallel — fundamentals, DCF, technicals, insider activity, macro, sentiment, options, and more"
- "A CEO synthesis agent compiles all findings into a single view with an explicit recommendation"
- "A skeptic agent pressure-tests the conclusion"
- "Results cached and tied to your portfolio context"

**Presenter note:** If doing a live demo, this is where you do it. The product sells itself — the briefing output is the pitch.

---

## Slide 5 — How It Works (The Architecture)

**Visual direction:** Clean diagram. Three columns or a flow diagram.

**Headline:** *Real data. Real analysis. In minutes.*

**Architecture overview:**
```
User Query
     ↓
15 Specialist Agents (in parallel):
Fundamentals → DCF → Technical → Insider → Earnings
Sentiment → Hype → Macro → Options → Risk
Analyst → Comparables → Graham → News → Competitor
     ↓
Data Sources:
SEC EDGAR | Finnhub | Perplexity | Alpaca
     ↓
CEO Synthesis Agent
     ↓
Skeptic / Critique Pass (Haiku)
     ↓
Briefing + Follow-up Questions
```

**Key proof points:**
- All 15 agents are live — not placeholders
- SEC Form 4 filings parsed directly (not via aggregator)
- 5-year XBRL time series from EDGAR
- Real-time web scanning via Perplexity sonar-pro
- Results cached with per-agent TTLs in Firestore

---

## Slide 6 — Market Size

**Visual direction:** Three concentric circles (TAM/SAM/SOM) or three stat blocks.

**Headline:** *A massive, underserved market at the intersection of fintech and AI.*

**TAM — Total Addressable Market:**
~$30B+ annually spent on financial data, research, and analytics globally (Bloomberg, FactSet, Refinitiv, Seeking Alpha, newsletters, research tools combined)

**SAM — Serviceable Addressable Market:**
~$8–10B — the subset targeting non-institutional investors and self-directed individuals in the US and English-speaking markets. Includes: Seeking Alpha ($299/year × millions of subscribers), Motley Fool ($199/year), Koyfin ($468–$948/year), investment newsletter market

**SOM — Serviceable Obtainable Market (Year 3):**
~$50–100M ARR — capturing 0.5–1% of the SAM with 50,000–100,000 paying subscribers at $25–$59/month average

**Supporting stats:**
- 50M+ self-directed investors in the US (SIFMA 2024)
- Self-directed investing grew 40%+ post-2020 and has not reversed
- Seeking Alpha has ~1M+ paid subscribers at $299/year = ~$300M ARR from one content business. Finava is a better product at a lower price.

---

## Slide 7 — Business Model

**Visual direction:** Clean pricing table or unit economics breakdown.

**Headline:** *Subscription SaaS with strong unit economics at scale.*

**Pricing tiers:**

| Tier | Price | Target User |
|---|---|---|
| Research | $25/month | Self-directed investors, beginners |
| Pro | $59/month | Active investors, finance-savvy |
| Power | Usage-based | Heavy users, API access |

**Unit economics (at maturity):**

| Metric | Research Tier | Pro Tier |
|---|---|---|
| Monthly revenue/user | $25 | $59 |
| Est. COGS/user (API costs) | ~$8–12 | ~$15–20 |
| Gross margin | ~52–68% | ~66–75% |
| CAC (estimated, content/SEO led) | ~$40–80 | ~$60–120 |
| LTV (12-month, 70% retention) | ~$210 | ~$495 |
| LTV:CAC | ~3–4× | ~4–8× |

**Key cost driver:** Anthropic API (Claude Sonnet 4 + Haiku) — primary variable cost. Rate limiting and query quotas are the primary lever for margin management.

**Revenue levers:**
- Usage-based upsell above plan limits
- Hedge fund / Pro tier penetration as trust builds
- Potential B2B: white-label for RIAs, fintech platforms, newsletters

---

## Slide 8 — Competitive Landscape

**Visual direction:** 2×2 positioning matrix (Depth of Analysis vs. Price / Accessibility)

**Headline:** *The upper-right quadrant is ours.*

**Matrix:**
- Y-axis: Depth of analysis (surface → institutional grade)
- X-axis: Price / Accessibility (institutional → retail)

**Positions:**
- Upper-left: Bloomberg ($32K), FactSet ($15K+) — deep but inaccessible
- Lower-left: Koyfin ($39–$79/mo) — good data, no AI synthesis
- Lower-right: Seeking Alpha, Motley Fool — retail, but shallow
- Lower-right: ChatGPT/Perplexity — accessible but generic
- Upper-right: **Finava** — deep + retail accessible (currently unoccupied)

**One-line competitive summary:**
Koyfin has the data but no AI. Seeking Alpha has AI summaries but one writer's view. ChatGPT has no real-time data. Bloomberg has everything but costs $32,000. Finava is the first product at the intersection of all four.

---

## Slide 9 — Traction

**Visual direction:** Metrics, milestones, or a screenshot of usage if available.

*(Complete when traction exists — pre-launch version below)*

**Pre-launch version:**

**Headline:** *Built, not pitched.*

**What exists today:**
- Full product built and functional — 15 live agents, real data integrations, 9,000+ lines of TypeScript across 115 files
- Python trading bot with live Alpaca paper trading integration
- Complete portfolio management, backtesting engine, briefing generation
- Firebase auth, full Firestore data model
- Deployed on Vercel with sub-300ms response times on non-agent routes

**What's left to launch:**
- Stripe billing integration (~1 week)
- Rate limiting / usage quotas (~3 days)
- Order placement API for hedge fund tab (~2 days)
- Estimated 4–6 weeks to production SaaS

**Waitlist:**
*(Add when you have waitlist numbers)*

**Presenter note:** Investors fund builders. The fact that this is built by one person is itself a signal. Lean into it.

---

## Slide 10 — Go-to-Market

**Visual direction:** Funnel or channel breakdown.

**Headline:** *Content-led growth targeting investors who already know they have this problem.*

**Phase 1 — Waitlist & Community (Launch)**
- SEO content targeting high-intent searches: "how to research stocks," "best stock analysis tools 2026," "seeking alpha alternative"
- Reddit/Twitter/X presence in r/investing, r/SecurityAnalysis, r/personalfinance, FinTwit
- Product Hunt launch (high-conversion channel for research tools)
- Targeted outreach to finance content creators + newsletter writers (affiliate/referral)

**Phase 2 — Word of Mouth + Content (Months 1–6)**
- Agent output quality drives organic sharing ("look at what this thing found on NVDA")
- Weekly market briefings as standalone content marketing pieces
- YouTube comparison content: "Finava vs. Bloomberg for retail investors"

**Phase 3 — B2B Channel (Months 6–18)**
- White-label for financial newsletters (large existing audiences, need to add AI value)
- RIA / independent advisor tier (smaller total market but higher ACV)
- Fintech API partnerships

**Customer acquisition cost target:** <$80 blended (content-led should keep this manageable)

---

## Slide 11 — Team

**Visual direction:** Clean headshot + 3–4 bullet bio.

**Headline:** *Built by someone who felt the problem personally.*

*(Fill in your background — suggested framing below)*

**[Your name] — Founder**
- [Your professional background — finance? tech? both?]
- Why you: You built this because you were the frustrated retail investor. You understand the product as a user.
- Technical depth: Built a 15-agent AI system, full SaaS product, Python trading bot — solo, from scratch
- [Any relevant credentials, prior companies, education]

**Presenter note:** Solo founder is a risk factor investors will flag. Address it directly: "I'm looking to bring on [X type of co-founder / early hire] with the first round." If you have advisors, mentors, or investors with relevant expertise, put them here too.

---

## Slide 12 — The Ask

**Visual direction:** Clean, simple. Numbers prominent.

**Headline:** *[Raise amount] to get from built to scaled.*

**Raise:** $[X]M [pre-seed / seed]
**Instrument:** [SAFE / Priced round] at $[X]M [cap / valuation]

**Use of funds:**
- 40% — Engineering / first hire (back-end, to own infra and the trading execution layer)
- 30% — Customer acquisition (content, SEO, paid experiments)
- 20% — API cost reserve (Anthropic, data providers — need runway as users scale)
- 10% — Legal, compliance, operations

**18-month milestones:**
- Month 2: Public launch, Stripe billing live, first 100 paying users
- Month 6: 1,000 paying subscribers, content flywheel established, hedge fund tab fully functional
- Month 12: 5,000 paying subscribers, first B2B / newsletter partnerships
- Month 18: $1.5–2M ARR, Series A ready

**Closing line:**
> "The research gap for retail investors is real, it's large, and it's never been more solvable than it is right now. We've built the product. We're looking for partners to help us scale it."

---

## Appendix Slides (Have Ready, Don't Present Unless Asked)

**A1 — Deep Product Walkthrough**
Full agent architecture diagram, data flow, tech stack

**A2 — Financial Model Detail**
Monthly projections, sensitivity analysis, API cost breakdown by query type

**A3 — Regulatory / Legal Considerations**
"Research tool, not financial advisor" framework, FINRA/SEC analysis, how Seeking Alpha and others operate in this space

**A4 — Competitive Feature Matrix**
Detailed feature-by-feature comparison vs. all major competitors

**A5 — User Personas**
Detailed profiles of the Research tier and Pro tier user archetypes

---

## Presentation Tips

**On the demo:** The best version of this pitch starts with the product. Open with: "Let me show you what this looks like" — run a live Finava query on a stock that's in the news. The output speaks for itself.

**On the solo founder question:** Don't be defensive. Say: "I built everything you've seen. I'm raising to scale, not to start." Then tell them exactly what profile of co-founder or early hire you're bringing on.

**On traction (pre-launch):** Be specific about what's built. "We have X lines of code, Y integrations, Z weeks to launch" is more compelling than "we're almost ready." Investors fund builders.

**On the AI disclaimer:** Proactively address the "isn't this just ChatGPT?" question before they ask it. The answer is: 15 agents, real primary data sources (SEC EDGAR, Finnhub, Perplexity), portfolio context, and purpose-built workflows. ChatGPT is a hammer; Finava is a surgical suite.
