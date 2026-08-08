import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/requireAuth";
import { isAdminUid } from "@/lib/adminAllowlist";

/**
 * Gate a route to admins only. Requires a valid auth token AND an account on the
 * allowlist (ADMIN_UIDS or ADMIN_EMAILS). Mirrors the admin precedence in
 * entitlements.resolvePlan.
 */
export async function requireAdmin(): Promise<
  { userId: string; error?: never } | { userId?: never; error: NextResponse }
> {
  const auth = await requireAuth();
  if (auth.error) return { error: auth.error };

  const isDevUser = auth.userId === "dev-user" && process.env.NODE_ENV !== "production";
  if (!isDevUser && !(await isAdminUid(auth.userId))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { userId: auth.userId };
}
