# Finava Multi-Agent Orchestration — Architecture Map

_Produced during the June 2026 audit/hardening pass. Reflects the code as of that pass._

## 1. The three orchestration surfaces

| Surface | Route | Orchestration | Models |
|---|---|---|---|
| **Chat · Simple** | `POST /api/chat` | Single streaming Sonnet call, no tools | `claude-sonnet-4-6` (direct Anthropic SDK) + Haiku follow-ups via OpenRouter |
| **Chat · Agent / Deep Research / Discovery** | `POST /api/agent` | CEO tool-use loop → parallel sub-agents → skeptic → revision | Sonnet CEO (direct SDK); sub-agents routed per-tier via OpenRouter |
| **Finava Analysis (stock page FINAVA tab)** | `POST /api/stock/[ticker]/finava-analysis` | 5 signal agents in parallel (SSE per-signal) → Sonnet synthesis verdict; failed signals degrade to neutral-50 cards | fundamentals/technical/sentiment/analyst/insider agents (Flash-Lite/Flash) + `finavaSynthesis` (Sonnet) |
| **AI Take (stock page overview)** | `POST /api/stock/[ticker]/ai-take` | One-shot `generate()` over bundled stock data | Sonnet (`aiTake`) |
| **Research lenses** | `POST/GET /api/research/*` | One-shot `generate()` calls per lens (no agent loop) | Sonnet / Gemini Flash / Flash-Lite / Haiku per lens |

## 2. CEO orchestrator (`src/agents/ceo.ts`)

- **Entry**: `runCeoAgent(userPrompt, portfolioContext, emit, opts)` called from `/api/agent` inside a `ReadableStream` + `usageStore.run({userId}, …)` context. SSE events (`AgentEvent` in `src/types/chat.ts`) flow to the client: `agent_start/complete/error`, `ceo_thinking`, `ceo_compiling`, `skeptic_start/complete`, `final_response`, `followups`, `done`, plus discovery events.
- **Loop**: up to 10 iterations (15 in deep research); each turn is a streamed `anthropic.messages.stream()` with `cache_control` on the system prompt and the 15-agent toolset (`src/agents/tools/index.ts`). Tool-use blocks are dispatched **in parallel** (`Promise.all`), each wrapped in `withTimeout` (60s standard / 120s deep / per-agent overrides) and the Firestore `agentCache` (check before run, deferred save).
- **Failure isolation**: a failed agent emits `agent_error` and returns `is_error: true` tool_result text — the CEO is told, the run continues. An exhausted loop emits an explicit fallback message (never a silent hang).
- **Self-correction**: `critiqueAndRevise()` — Haiku skeptic critique → full Sonnet revision (no tools) — shared with discovery synthesis. Best-effort: failure keeps the draft.
- **Tail**: follow-up questions (Haiku, started concurrently with the skeptic pass), ticker-memory + style persistence collected in `pendingWrites` and flushed before `done` (Vercel freeze safety).
- **Modes**: `deepResearch` (32K synth tokens, all agents), `discover`+`tier` (scout-only toolset; quick = narrative, deep = client-driven waves).

## 3. Sub-agents (`src/agents/sub-agents/*.ts`)

15 crew agents + the discovery scout. Pattern: fetch real data (Finnhub / Polygon / SEC EDGAR / Perplexity / StockTwits) → compute in code where possible → narrate via `generate()` (`src/lib/llm.ts`). Tier routing (OpenRouter, kill-switch `LLM_ROUTING=off`):

- **Tier C (Sonnet)**: risk, dcf, compareVerdict, themesGenerate, scoutSelect, aiTake, synthesis call-sites
- **Tier B (Gemini Flash)**: graham, comparables, competitor, analyst, macro, screenRead, screenSuggest
- **Tier A (Flash-Lite, ≤1200 tok, no reasoning)**: technical, earnings, insider, options, fundamentals, news, sentiment, signalsNarrate
- **Haiku**: skeptic, chatFollowups, screenParse, backtest*
- **Perplexity sonar-pro direct**: hype agent (returns search output verbatim), news/sentiment enrichment

External web/social content is fenced with `<external_data>` blocks (`src/lib/externalContent.ts`) before prompt interpolation, and the CEO/synthesis/skeptic prompts carry an explicit untrusted-quoted-content rule.

## 4. Discovery funnel (`src/agents/discovery.ts`, `scout-agent.ts`)

Quick: CEO calls `scout_universe` → Sonnet ranks the S&P 500 factor universe → narrative. Deep: scout returns ~20 picks → **client** posts deterministic waves (≤5 tickers each) back to `/api/agent` → `runDiscoveryWave` runs 8 batch agents + macro + 6 valuation agents on top-3, concurrency-capped at 4 (Finnhub rate limits), every agent error stringified (never throws) → final `runDiscoverySynthesis` Sonnet pass + shared skeptic→revision.

## 5. Research lenses (`src/app/api/research/*`)

- **Tune/factors**: data-only (no LLM), 15-min in-process factor-universe cache.
- **Compare**: factor scores + live quotes → Sonnet verdict (JSON, 502 on parse failure).
- **Screen**: 3 modes — `parse` (Haiku NL→filter), `commentary` (Flash), `suggest` (Flash).
- **Themes**: Sonnet basket generation, 6h in-process memo, ticker validation against the real S&P list, in-flight dedupe.
- **Signals**: client-computed factual events → Flash-Lite narration only.

## 6. Usage metering (`src/lib/usage.ts`)

`usageStore` (AsyncLocalStorage) carries `userId` per request; `recordUsage()` is called from the `generate()` choke-point, both direct-Anthropic streaming paths (CEO turns, revision, chat), and flat-credit Perplexity calls. Tokens → cost-weighted credits (`MODEL_PRICING`, fallback = most expensive tier, cache reads at 10%), accumulated in `userUsage/{userId}` Firestore day buckets. Enforcement: `checkUsageLimit()` (429 before any spend, fails open on Firestore errors) + `checkDeepResearchAllowed()`/`recordDeepResearchRun()` (monthly/trial run caps, counted at initiation only — waves/synthesis continuations aren't re-charged).

## 7. Clients & resilience

- `src/lib/anthropic.ts`: lazy singleton on `globalThis` (HMR-safe); `MODEL = claude-sonnet-4-6`, `HAIKU = claude-haiku-4-5`. SDK defaults: 2 retries.
- `src/lib/llm.ts`: OpenRouter (OpenAI SDK) singleton, `timeout: 60s`, `maxRetries: 1`; throws on empty completions (so callers' is_error path engages instead of poisoning the tool_result loop); fails loudly if a `file` part would route to a non-Anthropic model.
- Perplexity fetches: 30s `AbortSignal.timeout` (45s hype); StockTwits 10s.
- All SSE responses set `X-Accel-Buffering: no` + no-cache headers.
