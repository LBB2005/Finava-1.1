import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/requireAuth";
import { apiError } from "@/lib/apiError";

/**
 * Options shared by both route entrypoints.
 *
 * - `auth`: when `true` (default) the request must carry a valid Bearer token
 *   (or the dev-bypass sentinel outside production); `userId` is then a string.
 *   When `false`, auth is skipped and `userId` is `null`.
 * - `body`: when given, the request body is parsed as JSON and validated against
 *   this Zod schema; the typed result is passed to the handler / returned.
 */
export type RouteOptions<S extends z.ZodType | undefined, A extends boolean = true> = {
  auth?: A;
  body?: S;
};

/** Validated body type for a given schema option (or `undefined` when no schema). */
type BodyOf<S extends z.ZodType | undefined> = S extends z.ZodType
  ? z.infer<S>
  : undefined;

/**
 * Static type of `userId` for a given `auth` flag: `null` only when auth is
 * explicitly disabled (`auth: false`), otherwise `string` (auth defaults to
 * `true`, so `userId` is always present at runtime).
 */
type UserIdFor<A extends boolean> = A extends false ? null : string;

/** Context handed to a JSON route handler. */
export type RouteContext<S extends z.ZodType | undefined, A extends boolean = true> = {
  req: Request;
  userId: UserIdFor<A>;
  body: BodyOf<S>;
};

/** Successful result of the shared auth+parse+validate core. */
type CoreSuccess<S extends z.ZodType | undefined, A extends boolean = true> = {
  userId: UserIdFor<A>;
  body: BodyOf<S>;
};

/**
 * Shared auth + JSON-parse + Zod-validate core used by both `withRoute` (JSON)
 * and `withAuthRaw` (SSE). Returns either the resolved `{ userId, body }` or a
 * `NextResponse` error to short-circuit on.
 */
async function authParseValidate<S extends z.ZodType | undefined, A extends boolean = true>(
  req: Request,
  options: RouteOptions<S, A>
): Promise<CoreSuccess<S, A> | NextResponse> {
  const { auth = true, body: schema } = options;

  let userId: string | null = null;
  if (auth) {
    const result = await requireAuth();
    if (result.error) return result.error;
    userId = result.userId;
  }

  let body = undefined as BodyOf<S>;
  if (schema) {
    let parsed: unknown;
    try {
      parsed = await req.json();
    } catch {
      return apiError("invalid_json", "Request body must be valid JSON", 400);
    }

    const validated = schema.safeParse(parsed);
    if (!validated.success) {
      return apiError(
        "validation_error",
        "Validation failed",
        400,
        z.flattenError(validated.error)
      );
    }
    body = validated.data as BodyOf<S>;
  }

  // Runtime computes `userId` as `string | null`; the static `UserIdFor<A>`
  // narrows it to `string` (auth on) or `null` (auth off) at the type boundary.
  return { userId: userId as UserIdFor<A>, body };
}

/**
 * Wrap a JSON route handler with standardized auth, body parsing/validation, and
 * error handling.
 *
 * The handler receives `{ req, userId, body }` and may return any `Response`
 * (e.g. `NextResponse.json(...)`); that response is returned as-is. Any thrown
 * error is logged and converted to a standardized 500 `apiError`.
 *
 * @example
 *   export const POST = withRoute({ body: MySchema }, async ({ userId, body }) => {
 *     return NextResponse.json(await save(userId, body), { status: 201 });
 *   });
 */
export function withRoute<
  S extends z.ZodType | undefined = undefined,
  A extends boolean = true,
  C = unknown
>(
  options: RouteOptions<S, A>,
  handler: (ctx: RouteContext<S, A>, routeContext: C) => Promise<Response> | Response
): (req: Request, routeContext?: C) => Promise<Response> {
  return async (req: Request, routeContext?: C): Promise<Response> => {
    const core = await authParseValidate(req, options);
    if (core instanceof NextResponse) return core;

    try {
      return await handler({ req, userId: core.userId, body: core.body }, routeContext as C);
    } catch (err) {
      console.error("[withRoute]", err);
      return apiError("internal", "Something went wrong", 500);
    }
  };
}

/**
 * Auth + parse + validate for streaming (SSE) routes.
 *
 * Runs the SAME auth/parse/validate core as `withRoute`, but does NOT invoke a
 * handler and does NOT wrap any stream in try/catch. It returns EITHER the
 * resolved `{ userId, body }` (success) OR a `NextResponse` error.
 *
 * SSE routes own their mid-stream error handling and must emit those errors as
 * SSE events, NOT as JSON `apiError`s.
 *
 * @example
 *   const res = await withAuthRaw({ body: ChatRequestSchema })(req);
 *   if (res instanceof NextResponse) return res;
 *   const { body } = res;
 *   // ...build and return the ReadableStream
 */
export function withAuthRaw<S extends z.ZodType | undefined = undefined, A extends boolean = true>(
  options: RouteOptions<S, A>
): (req: Request) => Promise<CoreSuccess<S, A> | NextResponse> {
  return (req: Request) => authParseValidate(req, options);
}
