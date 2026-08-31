import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  langfuseConfigured,
  captureIo,
  traceIdentity,
  observeLlmClient,
  observeAnthropic,
  anthropicUsage,
  setTracingApiForTest,
} from "./observability";
import { usageStore, makeRunContext } from "./runContext";

/** A minimal MessageStream stand-in: `once` listeners, fired on demand. */
function fakeStream() {
  const listeners = new Map<string, (arg: unknown) => void>();
  return {
    once(event: string, fn: (arg: unknown) => void) {
      listeners.set(event, fn);
      return this;
    },
    emit(event: string, arg: unknown) {
      listeners.get(event)?.(arg);
    },
    has(event: string) {
      return listeners.has(event);
    },
  };
}

function fakeGeneration() {
  return { update: vi.fn(), end: vi.fn() };
}

const ORIGINAL = { ...process.env };

beforeEach(() => {
  setTracingApiForTest(null);
});

afterEach(() => {
  process.env = { ...ORIGINAL };
  setTracingApiForTest(null);
  vi.restoreAllMocks();
});

function configure() {
  process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-test";
  process.env.LANGFUSE_SECRET_KEY = "sk-lf-test";
}

describe("langfuseConfigured", () => {
  it("is false when neither key is set", () => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    expect(langfuseConfigured()).toBe(false);
  });

  it("is false when only one key is set", () => {
    delete process.env.LANGFUSE_SECRET_KEY;
    process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-test";
    expect(langfuseConfigured()).toBe(false);

    delete process.env.LANGFUSE_PUBLIC_KEY;
    process.env.LANGFUSE_SECRET_KEY = "sk-lf-test";
    expect(langfuseConfigured()).toBe(false);
  });

  it("is true only with both keys", () => {
    configure();
    expect(langfuseConfigured()).toBe(true);
  });
});

describe("captureIo", () => {
  it("defaults to on", () => {
    delete process.env.LANGFUSE_CAPTURE_IO;
    expect(captureIo()).toBe(true);
  });

  it("is off only for the exact opt-out value", () => {
    process.env.LANGFUSE_CAPTURE_IO = "off";
    expect(captureIo()).toBe(false);
    process.env.LANGFUSE_CAPTURE_IO = "on";
    expect(captureIo()).toBe(true);
  });
});

describe("traceIdentity", () => {
  it("is empty outside a run context — never invents a session", () => {
    expect(traceIdentity()).toEqual({});
  });

  it("maps the run context's requestId to the session id", () => {
    const ctx = makeRunContext("user-1", "req-abc");
    usageStore.run(ctx, () => {
      expect(traceIdentity()).toEqual({ userId: "user-1", sessionId: "req-abc" });
    });
  });

  it("gives every agent in one run the same session id", () => {
    const ctx = makeRunContext("user-1", "req-shared");
    usageStore.run(ctx, () => {
      const a = traceIdentity();
      const b = traceIdentity();
      expect(a.sessionId).toBe(b.sessionId);
    });
  });
});

describe("observeLlmClient", () => {
  it("returns the client untouched when unconfigured", () => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    const client = {} as never;
    expect(observeLlmClient(client, { agent: "dcf" })).toBe(client);
  });

  it("returns the client untouched when configured but not yet registered", () => {
    configure();
    const client = {} as never;
    // registerTracing() has not run, so no API is loaded.
    expect(observeLlmClient(client, { agent: "dcf" })).toBe(client);
  });

  it("names the generation after the agent and passes identity through", () => {
    configure();
    const wrapped = { wrapped: true };
    const observeOpenAI = vi.fn().mockReturnValue(wrapped);
    setTracingApiForTest({ observeOpenAI: observeOpenAI as never });

    const client = {} as never;
    const result = observeLlmClient(client, {
      agent: "dcf",
      userId: "user-1",
      sessionId: "req-abc",
      metadata: { model: "openai/gpt-5.5" },
    });

    expect(result).toBe(wrapped);
    expect(observeOpenAI).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        generationName: "dcf",
        userId: "user-1",
        sessionId: "req-abc",
        generationMetadata: { model: "openai/gpt-5.5" },
      })
    );
  });

  it("falls back to the untraced client when wrapping throws", () => {
    configure();
    setTracingApiForTest({
      observeOpenAI: (() => {
        throw new Error("langfuse exploded");
      }) as never,
    });
    const client = {} as never;
    expect(observeLlmClient(client, { agent: "dcf" })).toBe(client);
  });
});

describe("anthropicUsage", () => {
  it("returns undefined for a missing or malformed usage block", () => {
    expect(anthropicUsage(undefined)).toBeUndefined();
    expect(anthropicUsage(null)).toBeUndefined();
    expect(anthropicUsage("nope")).toBeUndefined();
    expect(anthropicUsage({})).toBeUndefined();
  });

  it("maps input/output tokens and totals them", () => {
    expect(anthropicUsage({ input_tokens: 10, output_tokens: 5 })).toEqual({
      input: 10,
      output: 5,
      total: 15,
    });
  });

  it("carries the cache token fields through when present", () => {
    expect(
      anthropicUsage({
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 900,
        cache_creation_input_tokens: 100,
      })
    ).toEqual({
      input: 10,
      output: 5,
      cache_read_input_tokens: 900,
      cache_creation_input_tokens: 100,
      total: 15,
    });
  });
});

describe("observeAnthropic", () => {
  it("passes calls straight through when unconfigured", async () => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    const create = vi.fn().mockResolvedValue({ content: "hi" });
    const client = observeAnthropic({ messages: { create } });

    await expect(client.messages.create({ model: "m" })).resolves.toEqual({ content: "hi" });
    expect(create).toHaveBeenCalledWith({ model: "m" });
  });

  it("records a generation for messages.create and closes it with usage", async () => {
    configure();
    const gen = fakeGeneration();
    const startObservation = vi.fn().mockReturnValue(gen);
    setTracingApiForTest({ startObservation: startObservation as never });

    const message = {
      content: [{ type: "text", text: "hi" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 7, output_tokens: 3 },
    };
    const client = observeAnthropic({ messages: { create: vi.fn().mockResolvedValue(message) } });

    const result = await client.messages.create({ model: "claude-sonnet-4-6", max_tokens: 100 });

    expect(result).toBe(message);
    expect(startObservation).toHaveBeenCalledWith(
      "anthropic.messages.create",
      expect.objectContaining({ model: "claude-sonnet-4-6" }),
      { asType: "generation" }
    );
    expect(gen.update).toHaveBeenCalledWith(
      expect.objectContaining({ usageDetails: { input: 7, output: 3, total: 10 } })
    );
    expect(gen.end).toHaveBeenCalledTimes(1);
  });

  it("marks the generation failed and rethrows when create rejects", async () => {
    configure();
    const gen = fakeGeneration();
    setTracingApiForTest({ startObservation: vi.fn().mockReturnValue(gen) as never });

    const client = observeAnthropic({
      messages: { create: vi.fn().mockRejectedValue(new Error("overloaded")) },
    });

    await expect(client.messages.create({ model: "m" })).rejects.toThrow("overloaded");
    expect(gen.update).toHaveBeenCalledWith(
      expect.objectContaining({ level: "ERROR", statusMessage: "overloaded" })
    );
    expect(gen.end).toHaveBeenCalledTimes(1);
  });

  it("returns the caller's stream object itself, not a proxy", () => {
    configure();
    setTracingApiForTest({ startObservation: vi.fn().mockReturnValue(fakeGeneration()) as never });

    const stream = fakeStream();
    const client = observeAnthropic({ messages: { stream: vi.fn().mockReturnValue(stream) } });

    expect(client.messages.stream({ model: "m" })).toBe(stream);
  });

  it("closes the stream's generation on finalMessage", () => {
    configure();
    const gen = fakeGeneration();
    setTracingApiForTest({ startObservation: vi.fn().mockReturnValue(gen) as never });

    const stream = fakeStream();
    const client = observeAnthropic({ messages: { stream: vi.fn().mockReturnValue(stream) } });
    client.messages.stream({ model: "m" });

    expect(gen.end).not.toHaveBeenCalled();
    stream.emit("finalMessage", { usage: { input_tokens: 1, output_tokens: 2 } });

    expect(gen.update).toHaveBeenCalledWith(
      expect.objectContaining({ usageDetails: { input: 1, output: 2, total: 3 } })
    );
    expect(gen.end).toHaveBeenCalledTimes(1);
  });

  it("closes the generation once, even if error follows finalMessage", () => {
    configure();
    const gen = fakeGeneration();
    setTracingApiForTest({ startObservation: vi.fn().mockReturnValue(gen) as never });

    const stream = fakeStream();
    const client = observeAnthropic({ messages: { stream: vi.fn().mockReturnValue(stream) } });
    client.messages.stream({ model: "m" });

    stream.emit("finalMessage", { usage: { input_tokens: 1, output_tokens: 2 } });
    stream.emit("error", new Error("late failure"));

    expect(gen.end).toHaveBeenCalledTimes(1);
  });

  it("records a stream that errors before completing", () => {
    configure();
    const gen = fakeGeneration();
    setTracingApiForTest({ startObservation: vi.fn().mockReturnValue(gen) as never });

    const stream = fakeStream();
    const client = observeAnthropic({ messages: { stream: vi.fn().mockReturnValue(stream) } });
    client.messages.stream({ model: "m" });
    stream.emit("error", new Error("upstream 529"));

    expect(gen.update).toHaveBeenCalledWith(
      expect.objectContaining({ level: "ERROR", statusMessage: "upstream 529" })
    );
    expect(gen.end).toHaveBeenCalledTimes(1);
  });

  it("does not leak a span when the returned value is not a stream", () => {
    configure();
    const gen = fakeGeneration();
    setTracingApiForTest({ startObservation: vi.fn().mockReturnValue(gen) as never });

    const client = observeAnthropic({ messages: { stream: vi.fn().mockReturnValue({}) } });
    client.messages.stream({ model: "m" });

    expect(gen.end).toHaveBeenCalledTimes(1);
  });

  it("omits prompt bodies when LANGFUSE_CAPTURE_IO=off", async () => {
    configure();
    process.env.LANGFUSE_CAPTURE_IO = "off";
    const gen = fakeGeneration();
    const startObservation = vi.fn().mockReturnValue(gen);
    setTracingApiForTest({ startObservation: startObservation as never });

    const client = observeAnthropic({
      messages: { create: vi.fn().mockResolvedValue({ content: "secret answer" }) },
    });
    await client.messages.create({ model: "m", messages: [{ role: "user", content: "holdings" }] });

    expect(startObservation.mock.calls[0][1].input).toBeUndefined();
    expect(gen.update).toHaveBeenCalledWith(expect.objectContaining({ output: undefined }));
  });

  it("leaves non-messages properties alone", () => {
    configure();
    setTracingApiForTest({ startObservation: vi.fn() as never });
    const client = observeAnthropic({ apiKey: "sk-test", messages: {} });
    expect(client.apiKey).toBe("sk-test");
  });
});
