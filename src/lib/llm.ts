/**
 * Per-agent LLM routing via OpenRouter.
 *
 * One OpenAI-compatible gateway (OpenRouter) fronts every model. Each routable
 * call-site ("agent") is mapped to the cheapest model that does its job, with a
 * single kill-switch — `LLM_ROUTING`:
 *   - "on"  (default): per-agent routing (Gemini Flash / Flash-Lite for narration,
 *                       Sonnet 4.6 where the user reads output, Haiku where it was).
 *   - "off": every agent falls back to the Sonnet/Haiku it used before this refactor,
 *            with its original thinking budget and max_tokens — i.e. behaves exactly
 *            as the app did pre-routing. Flip this env var to A/B or roll back instantly.
 *
 * Only the model + thinking/token budgets change. Prompts, content, and return
 * types are untouched. The CEO orchestration loop and the chat SSE stream stay on
 * the Anthropic SDK directly (they stream and/or use tools, which the string-return
 * `generate()` below intentionally does not), and Perplexity calls are untouched.
 */
import OpenAI from "openai";
import { recordUsage } from "@/lib/usage";

// ── Routing flag ────────────────────────────────────────────────────────────
// Default "on". Any value other than "off" (incl. unset) enables routing.
export const LLM_ROUTING_ON = (process.env.LLM_ROUTING ?? "on") !== "off";

// ── Model slugs (confirmed live on openrouter.ai/models) ─────────────────────
// NOTE: badges show these brand-level (Claude / GPT / Gemini / Grok), so the
// Gemini *version* (2.5 today; bump to 3.x when it GAs on OpenRouter) doesn't
// change the user-facing story.
const SONNET = "anthropic/claude-sonnet-4.6";
const HAIKU = "anthropic/claude-haiku-4.5";
const GPT5 = "openai/gpt-5.5"; // best math → the numeric agents
const GROK = "x-ai/grok-4.3"; // live-X social → sentiment
const GEMINI_FLASH = "google/gemini-2.5-flash";
const GEMINI_FLASH_LITE = "google/gemini-2.5-flash-lite";

// ── Routable call-sites ──────────────────────────────────────────────────────
export type AgentKey =
  // Tier C — user-facing quality, stays on Sonnet 4.6
  | "ceo" // CEO synthesis (stays on Anthropic SDK — streaming + tools; key kept for completeness)
  | "chat" // chat route main stream (stays on Anthropic SDK — SSE; key kept for completeness)
  | "aiTake"
  | "finavaSynthesis"
  | "briefingSynthesis"
  | "portfolioStatement"
  | "risk"
  | "dcf"
  | "compareVerdict" // Research · Compare lens — head-to-head verdict
  | "themesGenerate" // Research · Themes lens — AI-generated baskets
  | "scoutSelect" // Chat · Discovery scout — fit-rank the 503-name universe to a shortlist
  // Tier B — judgment over data → GPT-5.5 (the numbers) / Gemini (summarize)
  | "graham"
  | "comparables"
  | "competitor"
  | "analyst"
  | "macro"
  | "screenRead" // Research · Screen lens — basket commentary
  | "screenSuggest" // Research · Screen lens — suggested screens
  // Tier A — narrate pre-computed/fetched data → Gemini Flash-Lite (news → Flash, sentiment → Grok)
  | "technical"
  | "earnings"
  | "insider"
  | "options"
  | "fundamentals"
  | "news"
  | "sentiment"
  | "signalsNarrate" // Research · Signals lens — narrate cross-sectional events
  // Already-Haiku call-sites
  | "skeptic"
  | "chatFollowups"
  | "backtestParse"
  | "backtestSummary"
  | "screenParse" // Research · Screen lens — NL query → filter
  | "chatRouter" // Chat · Auto mode — classify intent (simple/agent/discover) + clarify gate
  | "titleConversation"; // Sidebar — clean 3–6 word auto-title for a chat

// Per-agent model when routing is ON.
const ROUTED_MODELS: Record<AgentKey, string> = {
  ceo: SONNET,
  chat: SONNET,
  aiTake: SONNET,
  finavaSynthesis: SONNET,
  briefingSynthesis: SONNET,
  portfolioStatement: SONNET,
  risk: SONNET,
  dcf: GPT5, // valuation math — best-in-class on AIME/HMMT
  compareVerdict: SONNET,
  themesGenerate: SONNET,
  scoutSelect: SONNET,
  // GPT-5.5 — the numbers: estimates/multiples/screens are figures
  graham: GPT5,
  comparables: GPT5,
  analyst: GPT5,
  competitor: SONNET, // qualitative moat reasoning + writing
  macro: GEMINI_FLASH,
  screenRead: GEMINI_FLASH_LITE,
  screenSuggest: GEMINI_FLASH_LITE,
  technical: GEMINI_FLASH_LITE,
  earnings: GEMINI_FLASH_LITE,
  insider: GEMINI_FLASH_LITE,
  options: GEMINI_FLASH_LITE,
  fundamentals: GEMINI_FLASH_LITE,
  news: GEMINI_FLASH, // long-context summarization of supplied articles
  sentiment: GROK, // live social (X)
  signalsNarrate: GEMINI_FLASH_LITE,
  skeptic: HAIKU,
  chatFollowups: HAIKU,
  backtestParse: HAIKU,
  backtestSummary: HAIKU,
  screenParse: HAIKU,
  chatRouter: HAIKU, // fast, cheap intent router for Auto mode
  titleConversation: GEMINI_FLASH_LITE, // tiny narration job — cheapest model
};

// Per-agent model when routing is OFF — the model each call-site used before this
// refactor. Everything was Sonnet except the four Haiku call-sites.
const HAIKU_AGENTS = new Set<AgentKey>([
  "skeptic",
  "chatFollowups",
  "backtestParse",
  "backtestSummary",
  "screenParse",
  "chatRouter",
  "titleConversation",
]);
const FALLBACK_MODELS: Record<AgentKey, string> = Object.fromEntries(
  (Object.keys(ROUTED_MODELS) as AgentKey[]).map((k) => [
    k,
    HAIKU_AGENTS.has(k) ? HAIKU : SONNET,
  ])
) as Record<AgentKey, string>;

/**
 * Model slug per agent. Resolves to the routed model when LLM_ROUTING is on, or
 * to the original Sonnet/Haiku the agent used today when it's off.
 */
export const AGENT_MODELS: Record<AgentKey, string> = LLM_ROUTING_ON
  ? ROUTED_MODELS
  : FALLBACK_MODELS;

// ── Tier classification for the ON-routing token/thinking overrides ──────────
// Tier A: narrate pre-fetched data on a non-reasoning model — drop thinking, cap output.
const TIER_A = new Set<AgentKey>([
  "technical",
  "earnings",
  "insider",
  "options",
  "fundamentals",
  "news",
  "sentiment",
  "signalsNarrate",
  "chatRouter",
  "titleConversation",
]);
const TIER_A_MAX_TOKENS = 1200;
// Judgment agents on a non-Anthropic model (GPT-5.5 / Gemini) — drop the
// Anthropic-style thinking budget; the base model's reasoning is enough for
// narrating supplied figures/data. (competitor moved back to Sonnet, so it
// keeps its call-site budget and is intentionally NOT in this set.)
const TIER_B_NO_THINKING = new Set<AgentKey>([
  "graham",
  "comparables",
  "analyst",
  "macro",
  "screenRead",
  "screenSuggest",
]);
// DCF runs on GPT-5.5 (best math) with a bounded reasoning budget — the one
// numeric agent we let think, since it's the valuation showcase.
const DCF_MAX_TOKENS = 2500;
const DCF_REASONING_MAX_TOKENS = 1500;

function isAnthropicModel(model: string): boolean {
  return model.startsWith("anthropic/");
}

// ── OpenRouter client (OpenAI-compatible), kept on globalThis to survive HMR ──
const g = globalThis as typeof globalThis & { __openrouterClient?: OpenAI };

function getClient(): OpenAI {
  if (!g.__openrouterClient) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENROUTER_API_KEY is not set. Add it to .env.local and restart the dev server."
      );
    }
    g.__openrouterClient = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      // The SDK default request timeout is 10 minutes — far past every route's
      // maxDuration (60–300s) and the CEO's per-agent 60–120s caps. Bound it so
      // a hung upstream fails fast enough for callers to surface a clean error.
      timeout: 60_000,
      maxRetries: 1,
      defaultHeaders: {
        // Headers OpenRouter uses for attribution/rankings.
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://finava.app",
        "X-Title": process.env.NEXT_PUBLIC_APP_NAME ?? "Finava",
      },
    });
  }
  return g.__openrouterClient;
}

// OpenRouter accepts OpenAI content parts plus a `file` part for PDFs. The OpenAI
// SDK doesn't type `file`, so we describe the parts we actually send loosely.
export type LlmContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export interface GenerateOptions {
  agent: AgentKey;
  /** System prompt (mapped straight across from the original call). */
  system?: string;
  /** User message text. Ignored when `content` is provided. */
  prompt?: string;
  /** Multimodal user content (e.g. statement image/PDF). Overrides `prompt`. */
  content?: LlmContentPart[];
  /** The max output tokens the original call used. */
  maxTokens: number;
  /**
   * The original thinking/extended-reasoning budget (Anthropic `budget_tokens`),
   * if the original call used one. Passed through as OpenRouter `reasoning.max_tokens`.
   */
  reasoning?: number;
  /** Request Anthropic prompt-cache passthrough on the system prompt. */
  cache?: boolean;
  /**
   * Whether to meter this call against the user's credit allowance. Defaults to
   * `true`. Set `false` for system-cost calls the user shouldn't pay for (e.g.
   * auto-generating a conversation title).
   */
  meter?: boolean;
}

/**
 * Resolve the effective model + token/thinking budgets for an agent, applying the
 * ON-routing overrides. When routing is off, the call's original budgets are used
 * verbatim against the Sonnet/Haiku fallback model.
 */
function resolveCall(opts: GenerateOptions): {
  model: string;
  maxTokens: number;
  reasoning?: number;
} {
  const model = AGENT_MODELS[opts.agent];
  let maxTokens = opts.maxTokens;
  let reasoning = opts.reasoning;

  if (LLM_ROUTING_ON) {
    if (TIER_A.has(opts.agent)) {
      maxTokens = Math.min(maxTokens, TIER_A_MAX_TOKENS);
      reasoning = undefined; // non-reasoning narration model
    } else if (opts.agent === "dcf") {
      maxTokens = DCF_MAX_TOKENS;
      reasoning = DCF_REASONING_MAX_TOKENS;
    } else if (TIER_B_NO_THINKING.has(opts.agent)) {
      reasoning = undefined; // judgment on GPT/Gemini, no Anthropic thinking budget
    }
  }

  return { model, maxTokens, reasoning };
}

/**
 * Single entry point for every routable, non-streaming LLM call. Normalizes to
 * OpenAI chat format, routes via OpenRouter, and returns the assistant text as a
 * plain string. Throws (with the agent name + status) on failure so each caller's
 * existing per-agent try/catch + timeout still isolates it.
 */
export async function generate(opts: GenerateOptions): Promise<string> {
  const { agent, system, cache } = opts;
  const { model, maxTokens, reasoning } = resolveCall(opts);
  const start = Date.now();

  // PDF/file input is only validated against Anthropic's native document support
  // (the statement route runs on Sonnet). If an agent that sends a `file` part is
  // ever re-tiered to a non-Anthropic model, fail loudly here rather than silently
  // shipping an unparsed PDF to a model that can't read it.
  if (opts.content?.some((p) => p.type === "file") && !isAnthropicModel(model)) {
    throw new Error(
      `[llm:${agent}] file/PDF input requires an Anthropic model (native document support); ` +
        `resolved model is ${model}. Re-tier this agent to Sonnet/Haiku or attach an OpenRouter file-parser plugin.`
    );
  }

  const messages: unknown[] = [];
  if (system) {
    // For Anthropic models with caching requested, render the system prompt as a
    // cache_control content block so repeated calls read it from cache (~90% off
    // input). Other models / no-cache use a plain string.
    if (cache && isAnthropicModel(model)) {
      messages.push({
        role: "system",
        content: [
          { type: "text", text: system, cache_control: { type: "ephemeral" } },
        ],
      });
    } else {
      messages.push({ role: "system", content: system });
    }
  }
  messages.push({
    role: "user",
    content: opts.content ?? [{ type: "text", text: opts.prompt ?? "" }],
  });

  // Build the request body. `reasoning` and content `file` parts are OpenRouter
  // extensions the OpenAI SDK doesn't type, so assemble loosely and cast.
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages,
  };
  if (reasoning != null) body.reasoning = { max_tokens: reasoning };

  let response;
  try {
    response = await getClient().chat.completions.create(
      body as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
    );
  } catch (err) {
    const status =
      err instanceof OpenAI.APIError && err.status ? ` (status ${err.status})` : "";
    const msg = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`[llm:${agent}] ${model} request failed${status}: ${msg}`);
  }

  const rawContent = response.choices?.[0]?.message?.content;
  const text = typeof rawContent === "string" ? rawContent : "";

  const u = response.usage;
  // Meter this call against the current user's allowance (userId comes from the
  // route's AsyncLocalStorage context — see src/lib/usage.ts). Fire-and-forget.
  // Skipped when `meter: false` (system-cost calls the user shouldn't pay for).
  if (opts.meter !== false) {
    void recordUsage({
      agent,
      model,
      inputTokens: u?.prompt_tokens,
      outputTokens: u?.completion_tokens,
    });
  }

  if (process.env.LLM_LOG === "on") {
    console.log(
      `[llm] ${JSON.stringify({
        agent,
        model,
        inputTokens: u?.prompt_tokens ?? null,
        outputTokens: u?.completion_tokens ?? null,
        ms: Date.now() - start,
      })}`
    );
  }

  // An empty/blank completion is a failure, not a valid result — throw it so each
  // caller's existing try/catch isolates it (the CEO turns it into a non-empty
  // is_error tool_result; routes surface an error) rather than silently returning
  // "". A bare "" would poison the CEO tool_result loop (the Messages API rejects
  // empty tool_result content, aborting the whole run) or persist an empty briefing.
  if (!text.trim()) {
    const finish = response.choices?.[0]?.finish_reason ?? "unknown";
    throw new Error(
      `[llm:${agent}] ${model} returned empty content (finish_reason: ${finish}). ` +
        `Likely truncated (raise max_tokens) or content-filtered.`
    );
  }

  return text;
}
