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
}
