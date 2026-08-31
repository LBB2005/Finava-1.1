/**
 * Next.js instrumentation — `register()` runs once when a server instance boots,
 * before it serves any request (Next 16, stable). We use it to fail fast on a
 * misconfigured environment: validating env here surfaces missing Firebase
 * credentials at startup with a single clear error instead of a cryptic 500 on
 * the first request.
 *
 * `onRequestError` (error tracking → Sentry) is wired in Milestone 3.
 */
export async function register(): Promise<void> {
  // Env validation only applies to the Node.js server runtime; the Edge runtime
  // strips most server vars and can't see the same config.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { validateEnv } = await import("@/lib/env");
  try {
    validateEnv();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (process.env.NODE_ENV === "production") {
      // Fail fast: a misconfigured production server must not start and serve
      // broken requests. This aborts server startup.
      throw err;
    }
    // In development, surface loudly but don't block pure-frontend work.
    console.error(`[instrumentation] Environment validation failed (continuing in dev):\n${message}`);
  }

  // LLM tracing. No-ops without LANGFUSE_* keys, and registers its own failures
  // rather than throwing — a missing tracer is not a reason to refuse to boot.
  // Deliberately after env validation so a genuinely misconfigured production
  // server still fails on the thing that matters first.
  const { registerTracing } = await import("@/lib/observability");
  await registerTracing();
}

/**
 * Global server error capture (Next calls this for every server-side error —
 * Server Components, Route Handlers, Server Actions).
 *
 * Vendor-neutral: this is the single seam where a hosted error tracker plugs in
 * — e.g. `Sentry.captureRequestError(err, request, context)` once @sentry/nextjs
 * is added and SENTRY_DSN is set. For now we emit a structured line so production
 * failures are visible and greppable instead of vanishing. Kept import-free so it
 * works on both the Node.js and Edge runtimes.
 */
export function onRequestError(
  err: unknown,
  request: { path?: string; method?: string; headers?: Record<string, string | string[]> },
  context: { routeType?: string; routePath?: string }
): void {
  const e = err as { message?: string; digest?: string };
  console.error(
    JSON.stringify({
      level: "error",
      tag: "onRequestError",
      msg: e?.message ?? "server error",
      digest: e?.digest,
      method: request?.method,
      path: request?.path,
      routeType: context?.routeType,
      routePath: context?.routePath,
      t: new Date().toISOString(),
    })
  );
}
