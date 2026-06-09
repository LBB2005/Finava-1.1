# Task: Per-agent LLM routing via OpenRouter to cut cost without losing accuracy

## Context
Finava is a Next.js stock-research app. A CEO orchestrator (`src/agents/ceo.ts`) fans out to 13 specialist sub-agents (`src/agents/sub-agents/*.ts`). **Every sub-agent currently calls `claude-sonnet-4-6`** via `anthropic.messages.create`, and some use extended thinking with `max_tokens: 10000`. One user query fires 5–15 simultaneous Sonnet calls — that fan-out is the main cost. The actual math (DCF, indicators, ratios) is already computed in TypeScript (e.g. `runDCF()` in `dcf-agent.ts`); the model only narrates pre-computed JSON. So most agents are doing cheap narration on an expensive model.

Goal: route each agent to the cheapest model that does its job reliably, via **OpenRouter** (one OpenAI-compatible gateway, automatic provider fallback). Use **Gemini 2.5 Flash / Flash-Lite** for narration/judgment agents, keep **Claude Sonnet 4.6** only where the user reads the output, keep **Haiku 4.5** where it's already used. Do not touch the Perplexity search agents.

## Hard constraints
- Do NOT change agent behavior, prompts, data fetching, return types, or the SSE streaming contract. This is a model-routing refactor only.
- Keep all existing `system` prompts and user-message content identical.
- Leave Perplexity calls (`src/lib/perplexity.ts`, `hype-agent.ts`, `sentiment-agent.ts` search half, `macro`/`news` context fetch) completely untouched.
- Everything behind a kill-switch env var `LLM_ROUTING` (`"on"` = new per-agent routing, `"off"` = everything falls back to Sonnet/Haiku exactly as today). Default `"on"`.
- Must pass `npm run lint` and `npx tsc --noEmit` and `npm run build`.
- TypeScript strict, no `any` leaks beyond what already exists.

## Step 1 — Add OpenRouter gateway + a `generate()` wrapper
- Install the `openai` package.
- Create `src/lib/llm.ts` exporting:
  - An OpenAI client pointed at OpenRouter: `baseURL: "https://openrouter.ai/api/v1"`, `apiKey: process.env.OPENROUTER_API_KEY`, plus the `HTTP-Referer` / `X-Title` headers OpenRouter recommends.
  - `type AgentKey` (union of all routable call-sites — see Step 3 map).
  - `AGENT_MODELS: Record<AgentKey, string>` — the model slug per agent (Step 3). When `LLM_ROUTING === "off"`, all entries resolve to the Sonnet/Haiku they use today.
  - `async function generate({ agent, system, prompt, maxTokens, reasoning })`:
    - Normalizes to OpenAI chat format: `[{role:"system",content:system}, {role:"user",content:prompt}]`.
    - Looks up the model from `AGENT_MODELS[agent]`.
    - Passes `max_tokens: maxTokens`. If `reasoning` is set, pass OpenRouter's `reasoning: { max_tokens }` field; otherwise omit.
    - Returns the assistant message text as a plain `string`.
    - On error, throw with the agent name + status so the CEO's existing per-agent timeout/try-catch still isolates failures.
- Confirm the exact current OpenRouter slugs at https://openrouter.ai/models before hardcoding (they change). Expected: `anthropic/claude-sonnet-4.6`, `anthropic/claude-haiku-4.5`, `google/gemini-2.5-flash`, `google/gemini-2.5-flash-lite`.

## Step 2 — Env
- Add `OPENROUTER_API_KEY=` to `.env.example` and `.env.local` (leave value blank for me to fill).
- Add `LLM_ROUTING=on` to both.
- Keep `ANTHROPIC_API_KEY` and `PERPLEXITY_API_KEY` as-is (Perplexity still used directly).

## Step 3 — Migrate each `anthropic.messages.create` call-site to `generate()` and set its model

Replace the Anthropic SDK call in each file with `generate({ agent, system, prompt, maxTokens, reasoning })`, mapping the existing `system:` and the user `content` straight across, and returning the string (this simplifies the inconsistent extractors — some files use `response.content[0]`, others `.find(b => b.type === "text")`).

Model map (set in `AGENT_MODELS`):

**Tier C — keep Sonnet 4.6 (user-facing quality):**
- `ceo` → CEO main synthesis call in `ceo.ts` (the `MODEL` call, NOT the skeptic) → `anthropic/claude-sonnet-4.6`
- `chat` → `src/app/api/chat/route.ts` main stream → keep Sonnet (see Step 5 re streaming)
- `aiTake` → `src/app/api/stock/[ticker]/ai-take/route.ts` → `anthropic/claude-sonnet-4.6`
- `briefingSynthesis` → `src/app/api/briefing/generate/route.ts` MODEL call → `anthropic/claude-sonnet-4.6`
- `portfolioStatement` → `src/app/api/portfolio/statement/route.ts` → `anthropic/claude-sonnet-4.6`

**Tier B — judgment over data → Gemini 2.5 Flash (keep Sonnet for risk + dcf):**
- `risk` → `anthropic/claude-sonnet-4.6`
- `dcf` → `anthropic/claude-sonnet-4.6`, but **reduce thinking from 8000 → 1500** (`reasoning: { max_tokens: 1500 }`) and **max_tokens 10000 → 2500**
- `graham`, `comparables`, `competitor`, `analyst`, `macro` → `google/gemini-2.5-flash`

**Tier A — narrate pre-computed/fetched data → Gemini 2.5 Flash-Lite:**
- `technical`, `earnings`, `insider`, `options`, `fundamentals`, `news`, `sentiment` → `google/gemini-2.5-flash-lite`
- For all Tier A: **remove `thinking` entirely** and **cap `max_tokens` at 1200** (keep 1500 only if a file already passed less).

**Already-Haiku call-sites → route as Haiku via OpenRouter:**
- `skeptic` → CEO skeptic calls (`SKEPTIC_MODEL`) → `anthropic/claude-haiku-4.5`
- `chatFollowups` → chat route follow-up generator → `anthropic/claude-haiku-4.5`
- `backtestParse`, `backtestSummary` → `src/app/api/backtest/route.ts` (both HAIKU calls) → `anthropic/claude-haiku-4.5`

Do NOT change `competitor`/`risk`/`dcf` data-fetch logic or the data-quality guard strings.

## Step 4 — Prompt caching on the static skill prompts (Anthropic models only)
`getSkillsPrompt(name)` returns a large constant system prompt per agent. For the agents that stay on Anthropic models (dcf, risk, ceo, skeptic), pass the system prompt with OpenRouter's Anthropic `cache_control: {type:"ephemeral"}` passthrough so repeated calls read from cache (~90% off input). The `chat` route already caches its system prompt — mirror that pattern. Skip caching for Gemini agents (different mechanism; not worth it now).

## Step 5 — Streaming caveat (`chat` route)
The chat route uses `anthropic.messages.stream` for SSE. Keep it on Sonnet and keep using the Anthropic SDK directly for the *stream* (don't force it through the non-streaming `generate()`), OR use the OpenAI SDK's streaming if you route it through OpenRouter — but either way the SSE `data: {text}` / `[DONE]` / `{followups}` / `{error}` wire format must stay byte-for-byte the same. The follow-up generator (Haiku) can move to `generate()`.

## Step 6 — Cost/latency instrumentation
Add lightweight logging in `generate()`: per call, log `{ agent, model, inputTokens, outputTokens, ms }` (OpenRouter returns usage). Gate behind `process.env.LLM_LOG === "on"`. This lets me confirm the savings and catch quality/latency regressions per agent.

## Step 7 — Rollout safety
- With `LLM_ROUTING=off`, the app must behave exactly as before (all Sonnet/Haiku, original thinking budgets, original max_tokens). Implement this by making `AGENT_MODELS` and the thinking/token overrides switch on the flag.
- This lets me A/B by flipping one env var and roll back instantly.

## Verification (do all of these before finishing)
1. `npx tsc --noEmit` clean, `npm run lint` clean, `npm run build` succeeds.
2. Write a throwaway script `scripts/test-routing.ts` that calls one Tier-A agent (e.g. `technical`), one Tier-B (`graham`), and the `dcf` agent with a sample ticker (e.g. AAPL) and prints model used + output, with `LLM_ROUTING=on`. Confirm non-empty, sensible output and that the data-quality guard still fires when data is missing.
3. Flip `LLM_ROUTING=off` and confirm the same script still works (all Sonnet) — proves the kill-switch.
4. Print a short summary table of every migrated call-site → model assigned, and the before/after `max_tokens` + thinking settings, so I can eyeball it.

## Deliverables
- `src/lib/llm.ts` (gateway + registry + `generate()` + logging)
- All sub-agents + the 5 API routes migrated
- `.env.example` / `.env.local` updated
- `scripts/test-routing.ts`
- A final summary of the call-site → model map and expected cost impact.

## Notes / rationale (so you make good calls on ambiguity)
- Reasoning models hallucinate MORE on factual finance data, so Tier A deliberately uses a NON-reasoning cheap model (Gemini Flash-Lite). Don't "upgrade" Tier A to a reasoning model.
- The math is in code; never move arithmetic into a model prompt.
- If an OpenRouter slug 404s, check the current id on openrouter.ai/models and use the closest current Gemini 2.5 Flash / Flash-Lite and Claude Sonnet 4.6 / Haiku 4.5 equivalents.
