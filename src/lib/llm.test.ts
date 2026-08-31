import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks at the boundary ────────────────────────────────────────────────────
const create = vi.fn();
vi.mock("openai", () => {
  class APIError extends Error {
    status?: number;
    constructor(message: string, status?: number) {
      super(message);
      this.status = status;
    }
  }
  class OpenAI {
    chat = { completions: { create } };
    static APIError = APIError;
  }
  return { default: OpenAI };
});

// Don't drag firebase-admin in via usage.ts — metering is fire-and-forget.
vi.mock("@/lib/usage", () => ({ recordUsage: vi.fn() }));

beforeEach(() => {
  create.mockReset();
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AGENT_MODELS routing table", () => {
  it("maps every agent key to a non-empty model slug when routing is on", async () => {
    const { AGENT_MODELS, LLM_ROUTING_ON } = await import("./llm");
    expect(LLM_ROUTING_ON).toBe(true); // unset env defaults to on
    for (const [agent, model] of Object.entries(AGENT_MODELS)) {
      expect(model, agent).toBeTruthy();
      expect(typeof model).toBe("string");
    }
  });

  it("routes the numeric dcf agent to GPT-5.5 and narration to Gemini when on", async () => {
    const { AGENT_MODELS } = await import("./llm");
    expect(AGENT_MODELS.dcf).toBe("openai/gpt-5.5");
    expect(AGENT_MODELS.sentiment).toBe("x-ai/grok-4.3");
    expect(AGENT_MODELS.titleConversation).toBe("google/gemini-2.5-flash-lite");
  });

  it("collapses to the Sonnet/Haiku fallback when LLM_ROUTING=off", async () => {
    vi.resetModules();
    vi.stubEnv("LLM_ROUTING", "off");
    const { AGENT_MODELS, LLM_ROUTING_ON } = await import("./llm");
    expect(LLM_ROUTING_ON).toBe(false);
    // dcf was GPT-5.5 when routed; off → back to Sonnet.
    expect(AGENT_MODELS.dcf).toBe("anthropic/claude-sonnet-4.6");
    expect(AGENT_MODELS.ceo).toBe("anthropic/claude-sonnet-4.6");
    // Haiku call-sites stay on Haiku.
    expect(AGENT_MODELS.skeptic).toBe("anthropic/claude-haiku-4.5");
    expect(AGENT_MODELS.chatRouter).toBe("anthropic/claude-haiku-4.5");
    vi.resetModules();
  });
});

describe("generate()", () => {
  it("returns the assistant text on a successful completion", async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: "hello world" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
    const { generate } = await import("./llm");
    const out = await generate({ agent: "dcf", prompt: "value AAPL", maxTokens: 500 });
    expect(out).toBe("hello world");
    expect(create).toHaveBeenCalledOnce();
    // The resolved model for dcf (routing on) is GPT-5.5.
    expect(create.mock.calls[0][0].model).toBe("openai/gpt-5.5");
  });

  it("throws (does not silently return '') on an empty completion", async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: "   " }, finish_reason: "length" }],
      usage: { prompt_tokens: 10, completion_tokens: 0 },
    });
    const { generate } = await import("./llm");
    await expect(generate({ agent: "dcf", prompt: "x", maxTokens: 100 })).rejects.toThrow(
      /empty content/,
    );
  });

  it("wraps an upstream API error with the agent name and model", async () => {
    create.mockRejectedValue(new Error("upstream 503"));
    const { generate } = await import("./llm");
    await expect(generate({ agent: "dcf", prompt: "x", maxTokens: 100 })).rejects.toThrow(
      /\[llm:dcf\].*request failed/,
    );
  });

  it("falls back to the Anthropic model when the primary model errors", async () => {
    create
      .mockRejectedValueOnce(new Error("gpt upstream 503"))
      .mockResolvedValueOnce({
        choices: [{ message: { content: "fallback answer" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 8, completion_tokens: 4 },
      });
    const { generate } = await import("./llm");
    const out = await generate({ agent: "dcf", prompt: "x", maxTokens: 100 });
    expect(out).toBe("fallback answer");
    expect(create).toHaveBeenCalledTimes(2);
    // First attempt = primary (gpt-5.5), second = the Sonnet fallback.
    expect(create.mock.calls[0][0].model).toBe("openai/gpt-5.5");
    expect(create.mock.calls[1][0].model).toBe("anthropic/claude-sonnet-4.6");
  });

  it("rejects PDF/file input routed to a non-Anthropic model", async () => {
    const { generate } = await import("./llm");
    // dcf routes to GPT-5.5 (non-Anthropic) → file part must be refused.
    await expect(
      generate({
        agent: "dcf",
        content: [{ type: "file", file: { filename: "a.pdf", file_data: "..." } }],
        maxTokens: 100,
      }),
    ).rejects.toThrow(/requires an Anthropic model/);
    expect(create).not.toHaveBeenCalled();
  });

  it("passes a reasoning budget for the dcf agent", async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    const { generate } = await import("./llm");
    await generate({ agent: "dcf", prompt: "x", maxTokens: 9999 });
    const body = create.mock.calls[0][0];
    expect(body.reasoning).toEqual({ max_tokens: 1500 }); // DCF_REASONING_MAX_TOKENS
    // 2500 content + 1500 reasoning. This assertion previously read 2500, which
    // encoded the bug: OpenRouter counts reasoning against max_tokens, so the
    // model could spend the whole budget thinking and return nothing at all.
    expect(body.max_tokens).toBe(4000); // overrides the caller's 9999
  });
});

describe("reasoning token budget", () => {
  // Regression for a silent, expensive production failure: OpenRouter counts
  // reasoning tokens against max_tokens, so a reasoning model given a budget it
  // can spend entirely on thinking returns an EMPTY completion with
  // finish_reason "length". Observed on gpt-5.5 at max_tokens 2500 / reasoning
  // 1500: 2500 completion tokens, 0 characters of content, $0.075 a call, and
  // then the fallback burns too. It looks like a model outage, not a config bug.
  beforeEach(() => {
    create.mockResolvedValue({
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
  });

  async function paramsFor(agent: string, maxTokens: number, reasoning?: number) {
    const { generate } = await import("./llm");
    await generate({ agent: agent as never, prompt: "x", maxTokens, reasoning });
    return create.mock.calls.at(-1)![0];
  }

  it("leaves the dcf agent real headroom for its answer", async () => {
    const p = await paramsFor("dcf", 500);
    expect(p.max_tokens - p.reasoning.max_tokens).toBeGreaterThanOrEqual(1000);
  });

  it("raises max_tokens rather than shrinking the reasoning budget", async () => {
    // Shrinking reasoning would silently degrade the analysis instead of the
    // caller finding out the budget was wrong.
    const p = await paramsFor("dcf", 500);
    expect(p.reasoning.max_tokens).toBe(1500);
  });

  it("protects any agent that is given a reasoning budget, not just dcf", async () => {
    // The failure is a property of reasoning models and token accounting, so an
    // agent that later gains a reasoning budget must inherit the guard.
    const p = await paramsFor("competitor", 1200, 1100);
    expect(p.max_tokens - p.reasoning.max_tokens).toBeGreaterThanOrEqual(1000);
  });

  it("leaves a call with no reasoning budget untouched", async () => {
    const p = await paramsFor("finavaSynthesis", 1500);
    expect(p.max_tokens).toBe(1500);
    expect(p.reasoning).toBeUndefined();
  });

  it("does not inflate an already-generous budget", async () => {
    const p = await paramsFor("competitor", 9000, 1000);
    expect(p.max_tokens).toBe(9000);
  });
});
