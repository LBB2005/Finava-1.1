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
    expect(body.max_tokens).toBe(2500); // DCF_MAX_TOKENS overrides the caller's 9999
  });
});
