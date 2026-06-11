import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/requireAuth";

function adminUids(): Set<string> {
  return new Set(
    (process.env.ADMIN_UIDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

/**
 * Gate a route to admins only. Requires a valid auth token AND a UID listed in
 * ADMIN_UIDS. Mirrors the admin precedence in entitlements.resolvePlan.
 */
export async function requireAdmin(): Promise<
  { userId: string; error?: never } | { userId?: never; error: NextResponse }
> {
  const auth = await requireAuth();
  if (auth.error) return { error: auth.error };

  const isDevUser = auth.userId === "dev-user" && process.env.NODE_ENV !== "production";
  if (!isDevUser && !adminUids().has(auth.userId)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { userId: auth.userId };
}
