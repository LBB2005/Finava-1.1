# Lucra — LLM Cost Optimization Report

*Goal: cheaper, while staying accurate and fast. Prepared from a direct audit of the Lucra codebase plus model-pricing knowledge.*

> **Accuracy note on prices:** Web access dropped mid-session, so I could not refresh live pricing pages. Every dollar figure below is my best knowledge as of early–mid 2025 and is marked *(verify)*. Prices move, but the **relative** economics — and all the architecture recommendations — hold regardless of small changes. Confirm current numbers at the official pricing pages before you wire anything to a budget (links at the end).

---

## 1. The headline

You don't need Claude for everything, and you almost certainly don't need **Opus** for most of what's currently calling it. The single biggest lever isn't switching to a "free" model like DeepSeek — it's three things you can do *today without leaving Anthropic*:

1. **Stop using Opus where Sonnet works** (5× cost cut on those calls).
2. **Turn on prompt caching** for your static system prompts (up to ~90% off the input side of repeated calls).
3. **Cap `max_tokens`** — every endpoint is hardcoded to 4096, and output tokens are the expensive half.

Cheaper third-party models (DeepSeek, Gemini Flash, GPT-mini, Llama on Groq) are a real and worthwhile second layer of savings — but for a **personal-finance app handling users' transaction data, the privacy/compliance angle matters as much as the price** (see §6). The smart play is a **router**: cheap model for the high-volume grunt work, Claude reserved for the moments where quality is visible to the user.

---

## 2. What Lucra actually does today

Audit of your API routes and agent library:

| Endpoint / module | Model today | What it does | Realtime? |
|---|---|---|---|
| `api/categorize` | **Haiku 3.5** | Categorize transactions | Often batchable |
| `api/chat` | Sonnet 4 | General chat | Yes (user-facing) |
| `api/chat-stream` | Sonnet 4 | Streamed chat | Yes |
| `api/chat-financial` | Sonnet 4 | Financial Q&A | Yes |
| `api/analyze` | Sonnet 4 | Analysis | Mixed |
| `api/insights` | Sonnet 4 | Insight generation | No (can precompute) |
| `api/forecast` | Sonnet 4 | Forecasting | No (can precompute) |
| `api/coach` | Sonnet 4 | Financial coaching | Yes |
| `api/agent` + `agent/stream` | **Opus 4** | Agentic tool use | Yes |
| `agent/orchestrator` | **Opus 4** | Orchestration | Yes |
| `agent/insights-engine` | **Opus 4** | Insight engine | No |
| `agent/llm-tools` | **Opus 4** | Tool-calling loop | Yes |

Two things jump out:

- **Opus is doing the heavy lifting in the agent layer** — and Opus is the most expensive model by a wide margin.
- **Sonnet is the default for everything user-facing**, including routine tasks that a much cheaper model handles fine.

Your one genuinely cost-aware choice is already in place: categorization runs on Haiku. Good instinct — that's your highest-volume task. We can push it even cheaper, but you got the principle right.

---

## 3. The price landscape (per 1M tokens, USD — *verify*)

| Tier | Model | Input | Output | Notes |
|---|---|---|---|---|
| **Premium** | Claude Opus 4 | ~$15 | ~$75 | What your agent layer uses now |
| | Claude Sonnet 4 | ~$3 | ~$15 | Your default |
| **Mid / cheap-Claude** | Claude Haiku 3.5 | ~$0.80 | ~$4 | Your categorizer |
| **Budget frontier** | DeepSeek-V3 (chat) | ~$0.27 | ~$1.10 | + off-peak discount ~50%; cache hits ~$0.07 in |
| | DeepSeek-R1 (reasoner) | ~$0.55 | ~$2.19 | Reasoning model; off-peak ~75% off |
| | Gemini 2.5 Flash | ~$0.30 | ~$2.50 | Fast, strong, generous free tier |
| | Gemini 2.5 Flash-Lite | ~$0.10 | ~$0.40 | Cheapest "good enough" tier |
| | GPT-4.1-mini | ~$0.40 | ~$1.60 | |
| | GPT-4.1-nano | ~$0.10 | ~$0.40 | |
| | GPT-4o-mini | ~$0.15 | ~$0.60 | |
| **Open / near-free** | Llama 3.3 70B (Groq) | ~$0.59 | ~$0.79 | Extremely fast (~250+ tok/s); free tier w/ limits |
| | Llama 3.1 8B (Groq) | ~$0.05 | ~$0.08 | Trivial tasks |
| | Local (Ollama, Qwen/Llama) | $0 marginal | $0 marginal | You pay in infra + quality |

**The shape of it:** Opus → Sonnet is ~5×. Sonnet → Haiku is ~3–4×. Sonnet → Gemini Flash-Lite / GPT-nano / DeepSeek is **~10–30×** on a blended basis. So the savings ladder is: *demote Opus → demote Sonnet → offload to a budget model where quality won't be missed.*

---

## 4. Two non-obvious levers that often beat model-swapping

**Prompt caching.** Your endpoints send a fixed `system` prompt on every call. With Anthropic prompt caching, cached input reads are ~90% cheaper than fresh input. For chat where the system prompt is large and constant, this can cut total cost more than switching models — and you keep Claude's quality. *Gemini and DeepSeek have their own cache mechanisms too (DeepSeek cache hits ~$0.07/M).* This is close to free money and low-risk; do it first.

**Output tokens dominate, and you're not capping them.** Output is 4–5× the price of input across every provider, and all 12 endpoints are hardcoded `max_tokens: 4096`. A categorizer returning a label needs maybe 50–200 tokens. Setting realistic per-endpoint caps (e.g. categorize ≤256, insights ≤1024, chat ≤2048) cuts the expensive half of the bill and *also makes responses faster* — directly serving your "fast" goal.

**Bonus — the Batch API (50% off).** `insights`, `forecast`, and `insights-engine` don't need to answer in real time. Anthropic (and OpenAI/Gemini) offer batch endpoints at ~50% discount for async work. Precompute these on a schedule instead of on the request path.

**Bonus — do math in code, not in the model.** For `forecast` and any numeric `analyze`, don't ask the LLM to compute — compute in TypeScript and let the model *narrate* the numbers. This improves accuracy (LLMs are unreliable at arithmetic) *and* lets you use a cheaper model for the narration, since the hard part is no longer the model's job. Two birds.

---

## 5. Recommended routing (the actual plan)

Introduce a tiny model-router and an abstraction layer so swapping a provider is a one-line change. Then:

| Endpoint | Today | Recommended | Why |
|---|---|---|---|
| `categorize` | Haiku | **Gemini Flash-Lite / GPT-nano / DeepSeek-V3**, batched | Highest volume, deterministic, ~10× cheaper than Haiku; use few-shot + structured JSON output |
| `insights`, `forecast`, `insights-engine` | Sonnet/Opus | **Sonnet via Batch API**, math in code | Not realtime → 50% batch discount; demote Opus→Sonnet |
| `analyze` | Sonnet | **Haiku or Gemini Flash**, escalate to Sonnet on low confidence | Most analyses are routine |
| `chat`, `chat-stream`, `chat-financial`, `coach` | Sonnet | **Keep Sonnet for quality, but add caching + token caps**; optionally route simple turns to Haiku/Flash | User-facing quality is visible; protect it but trim waste |
| `agent`, `agent/stream`, `orchestrator`, `llm-tools` | **Opus** | **Sonnet 4** | Sonnet is strong at tool use; Opus rarely justified for orchestration. ~5× saving here |

**The router pattern in one paragraph:** classify each incoming request as *trivial / standard / hard* (a cheap heuristic or a Haiku/Flash call), send trivial+standard to the budget tier, reserve Sonnet for hard or user-visible-quality moments, and keep an escalation path (if the cheap model's output fails a validation/confidence check, retry on Sonnet). You capture ~80% of the savings while keeping a quality floor.

---

## 6. The DeepSeek / "free LLM" question — read this before you switch

You specifically asked about DeepSeek. Honest take for a **fintech** product:

- **Price:** genuinely excellent — roughly **10× cheaper than Sonnet**, and V3/R1 are capable. On raw $/quality it's one of the best deals available.
- **Privacy & compliance — the catch:** DeepSeek's first-party API is **hosted in China**, and you'd be sending users' **financial transaction data** to it. For a personal-finance app that's a serious data-residency and trust concern, and potentially a regulatory one depending on your users' jurisdictions. Don't route real user financial data to it on a whim.
- **The fix if you want DeepSeek economics safely:** DeepSeek's weights are open, so run them through a **Western-hosted provider** (Together, Fireworks, Azure AI Foundry, AWS Bedrock Marketplace) or **self-host**. You keep most of the cost advantage and control where the data lives.
- **Truly free options:** Gemini's free tier (AI Studio) and Groq's free tier are real but rate-limited — great for dev/testing or low-volume background jobs, not for production scale. **Local models via Ollama** (Llama 3.x, Qwen 2.5) are zero marginal cost and fully private — ideal for the categorizer if you have a server — but you trade away some quality and take on the ops burden.
- **Reliability/latency:** budget APIs vary more in uptime and speed than Anthropic. For *user-facing* paths, a slower/flakier model hurts UX more than the cents you save. Use cheap models on **background** work first.

**Net:** DeepSeek is a strong fit for **batch, background, non-sensitive-or-properly-hosted** work. Be deliberate before it touches live user financial data.

---

## 7. Suggested rollout order (lowest risk → highest)

1. **Cap `max_tokens` per endpoint** and **enable prompt caching.** Pure savings, no quality risk, ~1 hour of work.
2. **Demote the Opus agent layer to Sonnet 4.** Test tool-use quality; ~5× saving on those calls.
3. **Move `insights`/`forecast`/`insights-engine` to the Batch API** and compute numbers in code. 50% off + accuracy win.
4. **Build the model-router abstraction** (single `complete()`-style interface, provider behind a flag — you already have `complete()` in `src/lib/claude.ts`, so this is a natural extension).
5. **Route `categorize` to a budget model** (Gemini Flash-Lite or self-hosted), batched, with a Haiku/Sonnet fallback on parse failure.
6. **A/B the cheaper tier on `analyze`/non-critical chat**, with confidence-based escalation.

Each step is independently shippable and independently reversible.

---

## 8. Rough savings intuition

Without your request volumes I can't give a dollar total, but directionally, on a typical mix:

- Opus→Sonnet on the agent layer alone: **~80% off those calls.**
- Caching + token caps across all Sonnet endpoints: commonly **30–60% off** those calls.
- Budget model + batch for categorization/insights: **~90% off** that slice.

Realistic blended outcome for an app shaped like Lucra: **roughly 50–75% lower LLM spend** with negligible user-visible quality change, *before* you ever touch DeepSeek — and more if you do, carefully.

If you tell me your monthly token volumes (or point me at usage logs), I'll turn this into a hard dollar model and a concrete `model-router.ts`.

---

## 9. Sources to verify the numbers (web was down this session)

- Anthropic pricing — https://www.anthropic.com/pricing and https://docs.claude.com/en/docs/about-claude/pricing
- DeepSeek pricing — https://api-docs.deepseek.com/quick_start/pricing
- Google Gemini pricing — https://ai.google.dev/gemini-api/docs/pricing
- OpenAI pricing — https://platform.openai.com/docs/pricing
- Groq pricing — https://groq.com/pricing
- Prompt caching (Anthropic) — https://docs.claude.com/en/docs/build-with-claude/prompt-caching
- Batch API (Anthropic) — https://docs.claude.com/en/docs/build-with-claude/batch-processing
