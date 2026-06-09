import { NextResponse } from "next/server";

/**
 * Standardized API error response shape.
 *
 * Carries a structured `error` object (machine-readable `code`, human `message`,
 * optional `details`) PLUS a flat top-level `message` mirror reserved for clients
 * that read a flat top-level `message` (forward/back-compat affordance).
 */
export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  message: string;
};

/**
 * Build a standardized JSON error response.
 *
 * @param code    machine-readable error code (e.g. "validation_error")
 * @param message human-readable message (also mirrored at the top level)
 * @param status  HTTP status code
 * @param details optional extra context (e.g. flattened Zod issues)
 */
export function apiError(
  code: string,
  message: string,
  status: number,
  details?: unknown
): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = {
    error: details === undefined ? { code, message } : { code, message, details },
    message,
  };
  return NextResponse.json(body, { status });
}
