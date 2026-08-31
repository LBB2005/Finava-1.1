/**
 * Langfuse tracing — the single seam every LLM call is observed through.
 *
 * The problem this solves: `llm.ts` routes ~13 agents across five providers
 * behind one `LLM_ROUTING` kill-switch, and `anthropic.ts` fronts three more
 * that stream. Flipping the switch changes the model under every one of them at
 * once, and today the only evidence of a regression is a user saying the output
 * got worse. Per-agent traces make that answerable: same agent, two models, side
 * by side, with latency, tokens and cost attached.
 *
 * Three rules this file exists to enforce:
 *
 *  1. UNCONFIGURED IS A NO-OP. With no keys set, every wrapper returns its
 *     argument unchanged and no OTel machinery is loaded. Same shape as
 *     `stripeConfigured()` / `liveHarnessConfigured()` — a deployment that has
 *     not opted in behaves exactly as it did before this file existed. This is
 *     also why the tracing packages are imported lazily: an unconfigured server
 *     should not pay to parse an exporter it will never call.
 *
 *  2. TRACING NEVER BREAKS A CALL. Observability is not load-bearing. Every
 *     entry point here swallows its own errors and falls back to the untraced
 *     path — a Langfuse outage must not take the crew down with it.
 *
 *  3. ONE RUN IS ONE SESSION. `runContext.requestId` becomes the Langfuse
 *     sessionId, so all 15 agents in a single crew debate group into one
 *     session instead of 15 orphan traces. That grouping is the whole point:
 *     "which agent regressed" is only answerable if you can see the others.
 *
 * SERVER-ONLY. Reads secrets and pulls in Node OTel; never import from a client
 * component.
 */

import type OpenAI from "openai";
import { usageStore, type RunContext } from "@/lib/runContext";
import { logger } from "@/lib/logger";

const log = logger("observability");

/**
 * Is Langfuse configured at all?
 *
 * Both keys are required: a public key alone cannot authenticate an export, and
 * a half-configured deployment that silently drops spans is worse than one that
 * plainly does nothing.
 */
export function langfuseConfigured(): boolean {
  return Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);
}

/**
 * Should prompt/completion text be sent to Langfuse?
 *
 * Defaults to on — a trace without its input is nearly useless for the thing
 * this was installed to do. Set `LANGFUSE_CAPTURE_IO=off` to export only
 * metadata (model, latency, tokens, cost) and keep prompt bodies, which can
 * carry a user's holdings, on our own infrastructure.
 */
export function captureIo(): boolean {
  return (process.env.LANGFUSE_CAPTURE_IO ?? "on") !== "off";
}

// ---------------------------------------------------------------------------
// Trace identity
// ---------------------------------------------------------------------------

export interface TraceIdentity {
  userId?: string;
  sessionId?: string;
}

/**
 * Who and what run this call belongs to, read off the ambient run context.
 *
 * Returns an empty object outside a run context rather than inventing an id:
 * a fabricated session would group unrelated calls, which is the exact failure
 * this is meant to prevent.
 */
export function traceIdentity(): TraceIdentity {
  const ctx = usageStore.getStore();
  if (!ctx) return {};
  return { userId: ctx.userId, sessionId: ctx.requestId };
}

/**
 * Run `fn` with this request's identity attached to every span inside it.
 *
 * Attaching identity at the RUN boundary rather than per call is the only thing
 * that actually produces a session. Putting a sessionId in a generation's
 * metadata looks right and does nothing: Langfuse groups by a propagated trace
 * attribute, so metadata-only ids leave you with N orphan traces and no way to
 * see the other fourteen agents in the debate. `propagateAttributes` writes into
 * the OTel context, which AsyncLocalStorage carries across every await inside
 * the run — so the CEO loop, the chat stream and each routed agent all land in
 * one session without any of them knowing this exists.
 *
 * Replaces `usageStore.run(...)` at each run boundary, so establishing the run
 * context and attaching its identity to the traces are the same act and cannot
 * drift apart.
 */
export function runTraced<T>(ctx: RunContext, fn: () => T): T {
  return usageStore.run(ctx, () => withTraceIdentity(fn));
}

/** @see runTraced — this is its inner half, exported for tests and odd cases. */
export function withTraceIdentity<T>(fn: () => T): T {
  const lf = api();
  if (!lf) return fn();
  const id = traceIdentity();
  if (!id.userId && !id.sessionId) return fn();
  try {
    return lf.propagateAttributes({ userId: id.userId, sessionId: id.sessionId }, fn);
  } catch (err) {
    log.warn("langfuse identity propagation failed; continuing untraced", {
      err: err instanceof Error ? err.message : String(err),
    });
    return fn();
  }
}

// ---------------------------------------------------------------------------
// Registration (called from instrumentation.ts at server boot)
// ---------------------------------------------------------------------------

type SpanProcessor = { forceFlush(): Promise<void>; shutdown(): Promise<void> };

/**
 * The tracing functions, resolved once at registration.
 *
 * Loaded eagerly into this slot — rather than `import()`ed at each call site —
 * because the Anthropic `stream()` wrapper is synchronous: it must return the
 * caller's MessageStream, not a promise for one. Anything not loaded by the time
 * a call arrives is simply not traced, which is the correct failure direction.
 */
interface LangfuseApi {
  observeOpenAI: typeof import("@langfuse/openai").observeOpenAI;
  startObservation: typeof import("@langfuse/tracing").startObservation;
  propagateAttributes: typeof import("@langfuse/tracing").propagateAttributes;
}

const g = globalThis as typeof globalThis & {
  __langfuseProcessor?: SpanProcessor | null;
  __langfuseApi?: LangfuseApi;
};

/** The loaded tracing API, or null before registration / when unconfigured. */
function api(): LangfuseApi | null {
  return langfuseConfigured() ? (g.__langfuseApi ?? null) : null;
}

/**
 * Register the Langfuse span processor with a Node tracer provider.
 *
 * Deliberately NOT `@vercel/otel`: that registers Next's own internal spans too,
 * and shipping every RSC render to an LLM observability tool buries the fifteen
 * spans we actually care about. A bare NodeTracerProvider with one processor
 * exports only what we explicitly observe.
 *
 * Idempotent — Turbopack re-evaluates modules on every hot reload, and
 * registering a second provider would silently orphan the first one's spans.
 */
export async function registerTracing(): Promise<void> {
  if (!langfuseConfigured()) return;
  if (g.__langfuseProcessor !== undefined) return;

  try {
    const [{ LangfuseSpanProcessor }, { NodeTracerProvider }, openai, tracing] =
      await Promise.all([
        import("@langfuse/otel"),
        import("@opentelemetry/sdk-trace-node"),
        import("@langfuse/openai"),
        import("@langfuse/tracing"),
      ]);

    const processor = new LangfuseSpanProcessor({
      // Passed explicitly rather than left to the SDK's own env lookup: it
      // accepts both LANGFUSE_BASE_URL and LANGFUSE_BASEURL, and getting the
      // region wrong is not a visible failure — US keys against the default EU
      // host authenticate as nobody and every span is dropped with a 401 nobody
      // reads. Undefined here keeps the SDK's own default.
      baseUrl: process.env.LANGFUSE_BASE_URL || undefined,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      release: process.env.VERCEL_GIT_COMMIT_SHA,
      ...(captureIo() ? {} : { mask: () => "[redacted]" }),
    });

    new NodeTracerProvider({ spanProcessors: [processor] }).register();
    g.__langfuseApi = {
      observeOpenAI: openai.observeOpenAI,
      startObservation: tracing.startObservation,
      propagateAttributes: tracing.propagateAttributes,
    };
    g.__langfuseProcessor = processor as unknown as SpanProcessor;
    log.info("langfuse tracing registered");
  } catch (err) {
    // A tracer that fails to start must not stop the server from starting.
    g.__langfuseProcessor = null;
    delete g.__langfuseApi;
    log.error("langfuse tracing failed to register", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Flush pending spans.
 *
 * Serverless functions are frozen the moment a response is returned, which drops
 * anything still sitting in the batch queue. Long-lived runs (the CEO crew, a
 * Finava Live harness step) should call this before returning; short ones can
 * rely on the flush interval.
 */
export async function flushTraces(): Promise<void> {
  const processor = g.__langfuseProcessor;
  if (!processor) return;
  try {
    await processor.forceFlush();
  } catch (err) {
    log.warn("langfuse flush failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Test seam: install a stub API (or clear it) without a real exporter. */
export function setTracingApiForTest(stub: Partial<LangfuseApi> | null): void {
  delete g.__langfuseProcessor;
  if (stub === null) delete g.__langfuseApi;
  else g.__langfuseApi = stub as LangfuseApi;
}

// ---------------------------------------------------------------------------
// OpenAI / OpenRouter
// ---------------------------------------------------------------------------

export interface ObserveOptions extends TraceIdentity {
  /** The routable agent this call belongs to — becomes the generation name. */
  agent: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Wrap the OpenRouter client for one call, naming the generation after the agent.
 *
 * Wrapped per call rather than once at construction because the interesting
 * attributes — which agent, which user, which run — differ on every call and the
 * client is a process-wide singleton. `observeOpenAI` returns a proxy, so this is
 * an allocation, not a new connection pool.
 */
export function observeLlmClient(client: OpenAI, opts: ObserveOptions): OpenAI {
  const lf = api();
  if (!lf) return client;
  try {
    return lf.observeOpenAI(client, {
      generationName: opts.agent,
      traceName: opts.agent,
      userId: opts.userId,
      sessionId: opts.sessionId,
      tags: opts.tags,
      generationMetadata: opts.metadata,
    }) as OpenAI;
  } catch (err) {
    log.warn("langfuse openai wrap failed; continuing untraced", {
      agent: opts.agent,
      err: err instanceof Error ? err.message : String(err),
    });
    return client;
  }
}

// ---------------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------------

/**
 * The subset of a Langfuse generation this file uses. Declared structurally so
 * the Anthropic instrumentation below has no import-time dependency on the SDK.
 */
interface Generation {
  update(attrs: Record<string, unknown>): void;
  end(): void;
}

/** Anthropic usage → Langfuse usageDetails, tolerating a missing field. */
export function anthropicUsage(usage: unknown): Record<string, number> | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const u = usage as Record<string, unknown>;
  const input = typeof u.input_tokens === "number" ? u.input_tokens : undefined;
  const output = typeof u.output_tokens === "number" ? u.output_tokens : undefined;
  const cacheRead =
    typeof u.cache_read_input_tokens === "number" ? u.cache_read_input_tokens : undefined;
  const cacheWrite =
    typeof u.cache_creation_input_tokens === "number"
      ? u.cache_creation_input_tokens
      : undefined;
  if (input === undefined && output === undefined) return undefined;

  const details: Record<string, number> = {};
  if (input !== undefined) details.input = input;
  if (output !== undefined) details.output = output;
  if (cacheRead !== undefined) details.cache_read_input_tokens = cacheRead;
  if (cacheWrite !== undefined) details.cache_creation_input_tokens = cacheWrite;
  details.total = (input ?? 0) + (output ?? 0);
  return details;
}

/** Start a generation observation for an Anthropic call, or null when off. */
function startAnthropicGeneration(
  method: "create" | "stream",
  params: Record<string, unknown>
): Generation | null {
  const lf = api();
  if (!lf) return null;
  try {
    return lf.startObservation(
      `anthropic.messages.${method}`,
      {
        model: typeof params.model === "string" ? params.model : undefined,
        input: captureIo() ? { system: params.system, messages: params.messages } : undefined,
        modelParameters: {
          max_tokens: params.max_tokens as number,
          temperature: params.temperature as number,
        },
        // Identity is NOT set here — it arrives as a propagated trace attribute
        // from withTraceIdentity(). Setting it as metadata too would look
        // correct while grouping nothing.
        metadata: { streaming: method === "stream" },
      },
      { asType: "generation" }
    ) as unknown as Generation;
  } catch (err) {
    log.warn("langfuse anthropic span failed to start", {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Close a generation from a completed Anthropic message. */
function endWithMessage(gen: Generation, message: unknown): void {
  const m = (message ?? {}) as Record<string, unknown>;
  gen.update({
    output: captureIo() ? m.content : undefined,
    usageDetails: anthropicUsage(m.usage),
    metadata: { stop_reason: m.stop_reason },
  });
  gen.end();
}

/** Close a generation that failed. */
function endWithError(gen: Generation, err: unknown): void {
  gen.update({
    level: "ERROR",
    statusMessage: err instanceof Error ? err.message : String(err),
  });
  gen.end();
}

/**
 * Wrap an Anthropic client so `messages.create` and `messages.stream` emit
 * generation spans.
 *
 * There is no first-party `observeAnthropic`, and the streaming path is the one
 * that matters here (the CEO loop and the chat SSE stream both use it), so this
 * is hand-rolled. The stream case deliberately does NOT wrap the returned
 * `MessageStream`: callers iterate it, await `finalMessage()`, attach their own
 * listeners and abort it, and any proxy around that object is a chance to break
 * one of those. Instead we attach listeners — `finalMessage` / `error` / `abort`
 * — which observe the same events without standing between the caller and the
 * stream.
 */
export function observeAnthropic<T extends object>(client: T): T {
  // Checked per call inside the proxy rather than once here: the client is built
  // lazily and cached on globalThis, so a wrap decision made at construction
  // would outlive a later registration.
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop !== "messages" || !value || typeof value !== "object") {
        return typeof value === "function" ? value.bind(target) : value;
      }
      return wrapMessages(value as Record<string | symbol, unknown>);
    },
  });
}

function wrapMessages(messages: Record<string | symbol, unknown>): object {
  return new Proxy(messages, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      const fn = value.bind(target) as (...args: unknown[]) => unknown;

      if (prop === "create") {
        return (...args: unknown[]) => {
          const gen = startAnthropicGeneration("create", asParams(args[0]));
          if (!gen) return fn(...args);
          return Promise.resolve(fn(...args)).then(
            (message) => {
              endWithMessage(gen, message);
              return message;
            },
            (err) => {
              endWithError(gen, err);
              throw err;
            }
          );
        };
      }

      if (prop === "stream") {
        return (...args: unknown[]) => {
          const gen = startAnthropicGeneration("stream", asParams(args[0]));
          const stream = fn(...args);
          if (!gen) return stream;
          attachStreamListeners(stream, gen);
          return stream;
        };
      }

      return fn;
    },
  });
}

function asParams(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * Observe a MessageStream's terminal events.
 *
 * `once` on every terminal event, and a guard flag besides: a stream that errors
 * after emitting `finalMessage` would otherwise end an already-ended span, which
 * OTel treats as a no-op but which would also overwrite the recorded outcome.
 */
function attachStreamListeners(stream: unknown, gen: Generation): void {
  const s = stream as { once?: (event: string, listener: (arg: unknown) => void) => unknown };
  if (typeof s?.once !== "function") {
    // Not a MessageStream (a test double, most likely). End the span rather than
    // leak it — an unclosed generation shows in Langfuse as a hung call.
    gen.end();
    return;
  }

  let settled = false;
  const settle = (fn: () => void) => {
    if (settled) return;
    settled = true;
    try {
      fn();
    } catch (err) {
      log.warn("langfuse anthropic span failed to close", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  };

  s.once("finalMessage", (message: unknown) => settle(() => endWithMessage(gen, message)));
  s.once("error", (err: unknown) => settle(() => endWithError(gen, err)));
  s.once("abort", (err: unknown) => settle(() => endWithError(gen, err)));
}
