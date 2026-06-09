# Finava — LLM Cost Optimization, Deep Dive

*Per-agent model routing without losing accuracy. Math/finance model research. Implementation plan and API choice. All prices verified against live pricing pages, May 2026.*

---

## 0. Correction to my first report

My first pass mis-described Finava as a budgeting app. Reading the code properly: Finava is a **stock-research + trading platform**. A **CEO orchestrator agent** (`ceo.ts`) fans out to **13 specialist sub-agents** (DCF, Graham, technical, comparables, risk, macro, news, earnings, insider, options, sentiment, competitor, fundamentals, analyst), plus a backtest engine, a Markov regime model, and Alpaca trading. You already use **Perplexity Sonar** for the web-search agents.

The important correction: **you're not using Opus anywhere.** Every sub-agent uses `MODEL = claude-sonnet-4-6`. Haiku 4.5 is already used in the smart places (chat follow-ups, backtest parsing, the CEO "skeptic" pass). So the real cost driver isn't an over-powered top model — it's that **one user question fans out into 5–15 simultaneous Sonnet calls**, several of them with extended thinking and `max_tokens: 10000`.

---

## 1. The single most important insight

Look at what your DCF agent actually does:

```ts
function runDCF(fcf, growthRate, terminalGrowthRate, wacc, years = 10) { ... }  // ← the math is in TypeScript
...
const response = await anthropic.messages.create({
  model: MODEL,                              // Sonnet 4.6  ($3 / $15 per MTok)
  max_tokens: 10000,
  thinking: { type: "enabled", budget_tokens: 8000 },   // ← 8k thinking tokens billed as output
  ...
});
```

**The arithmetic is already done in code.** The model isn't computing the DCF — it receives a finished JSON blob and writes prose around it (financial-health summary, bear/base/bull, buy/hold/sell). That's a *narration* task, not a *reasoning* task — but it's running your most expensive configuration: Sonnet **plus** extended thinking **plus** a 10k token ceiling. Extended thinking tokens bill at the **output** rate ($15/MTok), so an 8k-thinking response can cost ~$0.10–0.12 on its own, ×13 agents × every query.

This reframes your whole question. **You don't need a "math genius" LLM** — your math is in code where it belongs (and where it's actually correct, deterministic, and auditable). What you need is the *cheapest model that narrates pre-computed numbers faithfully without inventing new ones.* That changes which models win.

---

## 2. Best LLMs for math — and why it barely matters here

I researched the 2026 math leaderboards (AIME, HMMT, MATH-500). The headline: **competition math is effectively solved.** Frontier and even mid-tier reasoning models cluster at 95–99% on AIME — Kimi K2.6 (96.4%), Qwen 3.6 (95.3%), GLM-5.1 (95.3%), GPT-5, Gemini 3.x, DeepSeek's reasoning line all sit in the same band. The benchmark no longer separates models.

Two consequences for Finava:

1. **For the arithmetic you actually do (DCF, ratios, beta, RSI/MACD): keep it in code.** No LLM, however good at AIME, should be trusted to multiply your free-cash-flow projections when a `for` loop does it deterministically for free. You already do this in `runDCF` and (from the technical agent) your indicators. Extend the pattern, don't replace it.

2. **Where you *do* want quantitative reasoning** (e.g. "given these scenarios, what's the implied range"), the cheap reasoning models are plenty: **Gemini 2.5/3 Flash with thinking**, **DeepSeek V-series**, **Qwen**. You do not need a frontier model for it.

### The counter-intuitive finding that actually matters for a finance app

Reasoning ability and factual reliability **move in opposite directions.** On hallucination benchmarks (Vectara), DeepSeek's reasoning model **R1 hallucinates 14.3%** vs its base **V3 at 3.9%** — and 71.7% of R1's hallucinations are "benign" (plausible-sounding fabricated additions). Non-reasoning **Gemini 2.5 Flash-Lite sits at ~3.3%.**

For Finava this is decisive: **a model that invents a plausible revenue figure is worse than useless — it's a liability.** Independent 2026 testing found four of six leading models will *fabricate* financial figures when the source document is incomplete. So for your data-narration agents you specifically want a **low-hallucination, non-reasoning** model, not a flashy reasoner. This is the opposite of what "use the smartest model for finance" intuition suggests.

---

## 3. Best LLMs for financial analysis

Financial reasoning benchmarks (FinanceBench, FinQA, ConvFinQA, TAT-QA): top models reach only **~70–78% on FinQA** numeric reasoning — much less saturated than math, and the scores are noisy because of "benchmark hacking." The practical takeaways:

- **Faithfulness > raw IQ.** The differentiator in production finance isn't the leaderboard score, it's whether the model reports your fetched numbers without drifting. Favor low-hallucination models and constrain them with structured output.
- **Strong all-rounders for the judgment layer:** Claude Sonnet/Opus, Gemini 3.x Pro, GPT-5 class. These are where you keep spend for the agent whose *judgment* the user reads.
- **Best cheap-but-reliable workhorses:** **Gemini 2.5 Flash / Flash-Lite** (very low hallucination, fast, dirt cheap), **Claude Haiku 4.5** (already in your stack, strong, low-hallucination), **GPT-4.1-mini/nano**.
- **DeepSeek**: superb price/performance, but (a) reasoning variants hallucinate more, and (b) **data-residency** — first-party API is China-hosted, which is a real concern for routing users' portfolio data. If you want DeepSeek economics, run it via a Western host (Together/Fireworks/Azure) and prefer the non-reasoning variant.

---

## 4. Live pricing (verified May 2026, per 1M tokens)

| Model | Input | Output | Notes |
|---|---|---|---|
| Claude Opus 4.8 | $5 | $25 | not needed for Finava |
| **Claude Sonnet 4.6** (your `MODEL`) | $3 | $15 | keep for CEO + judgment agents |
| **Claude Haiku 4.5** (your `HAIKU`) | $1 | $5 | already used well; great default |
| Gemini 2.5 Flash | $0.30 | $2.50 | cheap, fast, low-hallucination; supports thinking |
| **Gemini 2.5 Flash-Lite** | $0.10 | $0.40 | cheapest reliable narration tier; ~3.3% hallucination |
| GPT-4.1-mini | $0.40 | $1.60 | |
| GPT-4.1-nano | $0.10 | $0.40 | |
| GPT-4o-mini | $0.15 | $0.60 | |
| DeepSeek V4-Flash | $0.14 | $0.28 | cache-hit input $0.0028; China-hosted caveat |
| Llama 3.3 70B (Groq) | $0.59 | $0.79 | ~280–350 tok/s, very fast; free tier |
| **Perplexity Sonar** | $1 | $1 | + ~$5–12 / 1k requests; you use this |
| **Perplexity Sonar Pro** (your agents) | $3 | $15 | + ~$6–14 / 1k requests |

Cross-cutting Anthropic discounts you're not using: **prompt caching** (cache reads = 0.1× input, i.e. 90% off the repeated system prompt) and **Batch API** (50% off, for non-realtime work like weekly briefings). They stack.

---

## 5. Per-agent routing plan (cheaper, same or better accuracy)

The trick is to split your 13 agents by **what the model is really doing**, then keep Sonnet only where a human reads its judgment or where the reasoning is genuinely hard.

### Tier A — Narrate pre-computed / fetched data → cheapest reliable model
These receive structured JSON (indicators, filings, fetched metrics) and format it. Low hallucination is the only requirement.

**Agents:** technical, earnings, insider, options, fundamentals, news (synthesis half), sentiment (synthesis half)
**Move to:** Gemini 2.5 Flash-Lite ($0.10/$0.40) or Haiku 4.5. **Drop `thinking`. Cut `max_tokens` to ~1,200.**
**Why safe:** the numbers come from your APIs, not the model; you're only paying for prose. ~20–40× cheaper than Sonnet-with-thinking, and *faster* (better UX on the fan-out).

### Tier B — Judgment/synthesis over data → mid tier, escalate when needed
Real interpretation, but bounded.

**Agents:** DCF (interpretation only — math stays in `runDCF`), Graham scorecard, comparables, competitor, analyst, risk
**Move to:** Gemini 2.5 Flash *with thinking* ($0.30/$2.50) **or** keep Haiku 4.5. Keep Sonnet for risk + DCF if you want maximum polish. **Remove the 8k thinking budget from DCF** — the hard part is already computed; a 1–2k budget is ample.

### Tier C — The orchestrator the user actually reads → keep Sonnet 4.6
**Agent:** CEO final compilation/synthesis (`ceo.ts` MODEL call). This is your visible quality. Don't touch it — but **add prompt caching** to its large static system prompt.

### Already optimal — leave alone
- Skeptic pass → Haiku ✓
- Backtest NL-parse + summary → Haiku ✓
- Chat follow-ups → Haiku ✓
- Web-search agents (hype, sentiment-search, macro/news context) → Perplexity Sonar ✓ — though consider **sonar** ($1/$1) instead of **sonar-pro** ($3/$15) for hype/sentiment where you don't need flagship depth. That alone is a ~5–15× cut on those calls.

---

## 6. Worked cost example (illustrative; assumes ~10 agents fire on a deep query)

| | Today (all Sonnet, some w/ thinking) | After routing |
|---|---|---|
| 6 Tier-A narration agents | ~$0.02 ea → **$0.12** | Flash-Lite ~$0.0006 ea → **$0.004** |
| 3 Tier-B judgment agents | ~$0.02 ea → **$0.06** | Flash-thinking / Haiku ~$0.006 ea → **$0.018** |
| DCF (Sonnet + 8k thinking) | **~$0.10** | Sonnet, 1.5k thinking → **~$0.025** |
| CEO synthesis (Sonnet) | **~$0.04** | unchanged + caching → **~$0.03** |
| Perplexity (sonar-pro) | **~$0.02** | sonar where ok → **~$0.008** |
| **Per deep query** | **~$0.34** | **~$0.085** |

≈ **75% cheaper per deep query**, with the user-facing synthesis *unchanged* and lower latency (Flash/Haiku are faster than Sonnet+thinking). Numbers are directional — plug in your real token counts to firm them up. The ranking (Tier A is where almost all the waste is) is robust.

**Good for users?** Yes — faster fan-out, same headline quality, and *lower* fabrication risk on the data agents. **Good for you (dev/cost)?** Yes — biggest savings come from the highest-volume, lowest-risk agents. The only real risk is quality drift on an individual agent; mitigated by keeping Sonnet for judgment + CEO, and your existing skeptic cross-check pass.

---

## 7. What API / gateway to use

You have two clean paths. Given your codebase already abstracts the client (`anthropic` proxy) and sets `model:` per call, you're unusually well set up for either.

**Recommended: OpenRouter as a unified gateway.** One OpenAI-compatible endpoint, one key, 500+ models (Claude, Gemini, GPT, DeepSeek, Llama, Qwen) addressed by a string slug, with **automatic provider fallback** if one is down — valuable when a deep query depends on 10 calls succeeding. It lets you A/B a model per agent by changing one string, and avoids wiring three SDKs. Small markup vs direct, worth it for the iteration speed. Keep **Anthropic direct** for the CEO/Sonnet calls (your highest-quality path) if you want to avoid any markup there, and route the cheap agents through OpenRouter.

**Alternative: direct SDKs** (Anthropic + Google Gemini, optionally DeepSeek via a Western host). Lowest per-token cost, most control, but you own fallback/retry and more integration code.

**Perplexity: keep it.** You like it and it's the right tool for the live-search agents (hype, sentiment, macro/news context) — it bundles search + citations. Don't rebuild that with a base model + search tool; just consider sonar vs sonar-pro per agent.

So: **Perplexity for search agents, Anthropic-direct for CEO/Sonnet, OpenRouter for the cheap Tier-A/B agents.**

---

## 8. Implementation plan (your code is ready for this)

1. **Replace the two constants with a per-agent registry.** Today every agent imports `MODEL`. Introduce:
   ```ts
   export const AGENT_MODELS = {
     ceo:        "anthropic/claude-sonnet-4-6",
     dcf:        "anthropic/claude-sonnet-4-6",   // math in code; light thinking
     risk:       "anthropic/claude-sonnet-4-6",
     graham:     "google/gemini-2.5-flash",
     comparables:"google/gemini-2.5-flash",
     technical:  "google/gemini-2.5-flash-lite",  // Tier A
     earnings:   "google/gemini-2.5-flash-lite",
     insider:    "google/gemini-2.5-flash-lite",
     options:    "google/gemini-2.5-flash-lite",
     fundamentals:"google/gemini-2.5-flash-lite",
     // ...
   } as const;
   ```
2. **One `generate()` wrapper** behind which OpenRouter (OpenAI-style) and Anthropic-direct both live, taking `{ agent, system, prompt, maxTokens, thinking? }`. Each sub-agent calls `generate({ agent: "dcf", ... })` instead of `anthropic.messages.create`. Minimal diff — you already pass `system` + `messages` uniformly.
3. **Strip `thinking` from Tier-A agents; lower `max_tokens`** (10000 → ~1200 for narration; DCF thinking 8000 → ~1500).
4. **Add prompt caching** to the big static skill system prompts (`getSkillsPrompt(...)`) and the CEO system prompt — they're constant across calls.
5. **Batch the weekly briefing** (`briefing/generate`) via Batch API — it's a cron, not realtime → 50% off.
6. **Instrument cost per agent** (log input/output tokens × model price) so you can see the routing pay off and catch quality regressions. A/B one agent at a time: ship Tier A first (lowest risk), measure, then Tier B.

Order by risk: caching + token caps + de-thinking (pure win, day 1) → Tier A swap → sonar/sonar-pro tuning → Tier B swap, each behind the cost instrumentation.

---

## Sources

- Anthropic pricing & caching/batch — [claude.com/pricing](https://claude.com/pricing) · [platform.claude.com/docs/en/about-claude/pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- DeepSeek pricing (V4-Flash/Pro) — [api-docs.deepseek.com/quick_start/pricing](https://api-docs.deepseek.com/quick_start/pricing)
- Gemini pricing — [ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing) · [pricepertoken Flash-Lite](https://pricepertoken.com/pricing-page/model/google-gemini-2.5-flash-lite)
- OpenAI mini/nano pricing — [openai.com/api/pricing](https://openai.com/api/pricing/)
- Groq pricing/speed — [groq.com/pricing](https://groq.com/pricing)
- Perplexity Sonar pricing — [docs.perplexity.ai/docs/getting-started/pricing](https://docs.perplexity.ai/docs/getting-started/pricing)
- Math leaderboards (AIME/HMMT 2026) — [llm-stats.com/benchmarks/aime-2026](https://llm-stats.com/benchmarks/aime-2026) · [benchlm.ai/math](https://benchlm.ai/math)
- Financial benchmarks (FinQA/FinanceBench) — [awesomeagents.ai finance leaderboard](https://awesomeagents.ai/leaderboards/finance-llm-leaderboard/) · [azilen best LLMs for finance](https://www.azilen.com/learning/best-llms-for-financial-analysis/)
- Hallucination rates (reasoning vs base; Gemini Flash-Lite) — [suprmind.ai hallucination benchmarks](https://suprmind.ai/hub/ai-hallucination-rates-and-benchmarks/)
- OpenRouter gateway/fallback — [openrouter.ai/docs](https://openrouter.ai/docs/guides/routing/provider-selection)
