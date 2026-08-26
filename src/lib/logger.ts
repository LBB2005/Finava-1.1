import { currentRequestId } from "@/lib/runContext";

/**
 * Minimal structured logger. Emits one JSON line per event, stamped with the
 * current request's correlation id (from the run context) so a single request —
 * including its multi-agent crew — can be traced end-to-end.
 *
 * Vendor-neutral by design: `emit()` is the single seam where a hosted sink
 * (Sentry / Axiom / Datadog) can be added later without touching any call site.
 *
 * Redaction: context values are shallow-sanitized and a sensitive-key allowlist
 * is always dropped, so prompts / emails / tokens never reach the logs. Never put
 * user content in the `msg` string itself — pass structured fields instead.
 */

type Level = "debug" | "info" | "warn" | "error";

// Keys whose values must never be logged, even if a caller passes them.
const REDACT_KEYS = new Set([
  "prompt",
  "content",
  "messages",
  "email",
  "accessToken",
  "token",
  "apiKey",
  "authorization",
  "password",
  "secret",
]);

const MAX_STR = 200;

function sanitize(context?: Record<string, unknown>): Record<string, unknown> {
  if (!context) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context)) {
    if (REDACT_KEYS.has(k)) {
      out[k] = "[redacted]";
    } else if (v === null || v === undefined) {
      out[k] = v;
    } else if (typeof v === "string") {
      out[k] = v.length > MAX_STR ? `${v.slice(0, MAX_STR)}…` : v;
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    } else {
      // No nested blobs — they could smuggle PII into logs.
      out[k] = "[object]";
    }
  }
  return out;
}

function emit(level: Level, tag: string, msg: string, context?: Record<string, unknown>): void {
  const requestId = currentRequestId();
  const line = JSON.stringify({
    level,
    tag,
    msg,
    ...(requestId ? { requestId } : {}),
    ...sanitize(context),
    t: new Date().toISOString(),
  });
  // Single sink seam — route to the matching console stream for now.
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export interface Logger {
  debug(msg: string, context?: Record<string, unknown>): void;
  info(msg: string, context?: Record<string, unknown>): void;
  warn(msg: string, context?: Record<string, unknown>): void;
  error(msg: string, context?: Record<string, unknown>): void;
}

/** A tagged logger, e.g. `const log = logger("ceo")`. */
export function logger(tag: string): Logger {
  return {
    debug: (m, c) => emit("debug", tag, m, c),
    info: (m, c) => emit("info", tag, m, c),
    warn: (m, c) => emit("warn", tag, m, c),
    error: (m, c) => emit("error", tag, m, c),
  };
}
