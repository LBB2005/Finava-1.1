# Lucra — Execution Plan: From Built to Working Business

*Owner: Liam · Drafted 2026-06-04 · Status: pre-launch, pre-revenue, solo founder*

> **The one job:** Convert an impressive artifact into a validated business.
> The product is built. The business is not. This plan closes that gap.

---

## The thesis in one paragraph

Lucra is a technically real, multi-agent stock-research product in a large, real market, sitting at the highest-risk stage: no billing, no users, no proven economics. The work ahead is **not more building** — it is proving three things in order: (1) you can make money per query, (2) people will pay and stay, (3) you can defend it. Everything below serves those three proofs.

---

## Guardrails (read before starting)

- **No new features until billing + metering are live.** Scope discipline is the scarcest asset.
- **Charge from day one.** A free user is an opinion; a paying user is a fact.
- **One wedge, one product.** Trading bot, hedge-fund desk, and backtester are roadmap — not launch surface.
- **Measure everything.** Every phase below has a number attached. If you can't measure it, you can't claim it.

---

## Phase 0 — Instrument & Gate (Week 1)

*Goal: make the business measurable. Nothing else can happen until this is done.*

| # | Action | Done when |
|---|--------|-----------|
| 0.1 | Per-query cost logging — record model, token count, $ cost for every agent call | Every query writes a cost record |
| 0.2 | Usage metering per user (queries used vs. plan limit) | Dashboard shows usage by user |
| 0.3 | Rate limiting + hard quota enforcement | A user cannot exceed their plan |
| 0.4 | Stripe billing live (the 3 tiers) | A real card can be charged |

**Exit criteria:** You can answer "what did query X cost me, and is this user over their limit?" with data.

---

## Phase 1 — Prove the Unit Economics (Weeks 2–3)

*Goal: confirm a query can be served profitably. If it can't, the whole model changes — better to know now.*

| # | Action | Target |
|---|--------|--------|
| 1.1 | Measure true fully-loaded cost per multi-agent query, by ticker complexity | Real number, not estimate |
| 1.2 | Make agent dispatch **adaptive** — fire only relevant agents (4–6), not all 15 every time | Avg agents/query drops |
| 1.3 | Route extractive/cheap agents to a smaller model; reserve top model for synthesis | COGS per query falls |
| 1.4 | Aggressive per-ticker caching with sensible TTLs (fundamentals daily, sentiment hourly, etc.) | Cache hit rate measured |
| 1.5 | Recompute gross margin at each tier after optimizations | **≥ 65% gross margin** |

**Exit criteria:** A $25 / 30-query plan clears ≥65% gross margin. If not — raise price, cut query allowance, or cut agent count. Decide with data.

---

## Phase 2 — Prove Demand & Retention (Weeks 3–8, overlaps Phase 1)

*Goal: the only metrics that replace a pitch deck — paying users and a retention curve.*

| # | Action | Target |
|---|--------|--------|
| 2.1 | Narrow to ONE sharp wedge (recommended: *"deepest pre-earnings briefing on any stock in 3 minutes"*) | Wedge chosen + messaged |
| 2.2 | Soft launch to 50–100 paying users (Reddit r/investing, FinTwit, Product Hunt, personal network) | 50+ paying users |
| 2.3 | Replace placeholder testimonials with real quotes; delete fakes | Zero placeholder content |
| 2.4 | Kill default `create-next-app` README; ship a real one | Done |
| 2.5 | Track activation (first successful query), WAU, and 30-day retention | Cohort curve exists |
| 2.6 | Weekly user interviews (5/week) — why they stay, why they'd churn | Notes logged |

**Exit criteria:** 50+ paying users and a real 30-day retention number. This single curve is worth more than the entire deck.

---

## Phase 3 — Remove the Existential Risks (Weeks 4–10, parallel)

*Goal: defuse the two things that can kill the company regardless of traction — regulation and accuracy.*

| # | Action | Done when |
|---|--------|-----------|
| 3.1 | Fintech/securities lawyer reviews recommendation language + disclaimers | Sign-off received |
| 3.2 | Shift output from "buy/sell call" → framed analysis (bull case / bear case / what would change the view) | Live in product |
| 3.3 | Build an accuracy eval harness: agent outputs vs. ground truth (DCF inputs, insider figures, fundamentals) | Benchmark runs + scores |
| 3.4 | Surface "we couldn't verify X" rather than guessing — never let a hallucinated number reach the user unflagged | Verification gate live |

**Exit criteria:** Legal sign-off on language + a measurable accuracy benchmark you'd be willing to publish.

---

## Phase 4 — Build a Defensible Moat (ongoing from Week 6)

*Goal: stop relying on "15 agents" (copyable in a weekend) and compound real advantages.*

| Moat | What it is | Why it's defensible |
|------|-----------|---------------------|
| **Memory & portfolio context** | Research that improves the longer someone uses it; framed to their actual holdings | Real switching cost |
| **Proprietary eval/data asset** | Your accuracy benchmark (from 3.3) | Quality flywheel + marketing proof competitors can't fake |
| **Content-led distribution** | SEO + weekly briefings + comparison content | Get known before Robinhood/Anthropic move |

**Written answer to "why won't a giant crush you?":** workflow + memory + brand among serious researchers — *not* the orchestration pattern. Have this on one slide.

---

## Pre-Raise Readiness Bar

Do not raise until every box is checked. Each one turns a skeptic's bullet into a slide.

- [ ] Billing live, revenue flowing
- [ ] Gross margin per query proven ≥ 65%
- [ ] 50+ paying users with a 30-day retention curve
- [ ] One sharp wedge you're demonstrably best at
- [ ] Legal sign-off on recommendation language
- [ ] Accuracy benchmark you'd publish
- [ ] One honest, one-line moat story you believe

---

## Positioning fixes (do alongside, low effort)

- Drop **"hedge-fund-quality."** Use: *"Five hours and ten tabs of research, in three minutes, on any stock."* — true, testable, compelling.
- Drop the **"unoccupied quadrant"** framing in the deck. Lead with the **demo** and the three proof-metrics instead.
- Pre-empt the three skeptic questions (economics, churn, big-tech threat) **before** investors ask. Naming the bear case is the single most credibility-building move a founder can make.

---

## Suggested sequencing (Gantt-lite)

```
Week:        1   2   3   4   5   6   7   8   9   10
Phase 0  ▓▓▓▓
Phase 1      ▓▓▓▓▓▓▓▓
Phase 2          ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
Phase 3              ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
Phase 4                      ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ (ongoing)
```

Phases 0→1 are strictly sequential. 2, 3, 4 run in parallel once the meter is on.

---

## What to explicitly NOT do (for now)

- ❌ Build new agents or features
- ❌ Ship the hedge-fund trading desk to real users
- ❌ Wire up live (real-money) order placement
- ❌ Chase B2B/white-label before retail retention is proven
- ❌ Raise on "lines of code built solo"

---

## The single sentence to remember

> **You have an impressive artifact, not yet a validated business — and the only work that counts is closing that gap: billing on, economics proven, real users retained.**
