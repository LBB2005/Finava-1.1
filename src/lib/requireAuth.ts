import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

// Private-beta lockdown: when BETA_ADMIN_ONLY is set, only UIDs in ADMIN_UIDS may
// authenticate, so every requireAuth-gated route is admins-only without per-route
// edits. Flip the env var off to reopen the app to all signed-in users.
function betaBlocked(userId: string): boolean {
  if (process.env.BETA_ADMIN_ONLY !== "1") return false;
  const admins = new Set(
    (process.env.ADMIN_UIDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return !admins.has(userId);
}

export async function requireAuth(): Promise<
  { userId: string; error?: never } | { userId?: never; error: NextResponse }
> {
  const headersList = await headers();
  const authHeader = headersList.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const token = authHeader.slice(7);

  // Dev-only bypass: mirrors AuthContext's client-side "DEV AUTH ON" mock
  // session so authed APIs work in local/preview dev without a real Google
  // sign-in. Hard-gated to non-production — in a production build NODE_ENV is
  // "production" and this branch is dead, so the sentinel can never authenticate.
  if (process.env.NODE_ENV !== "production" && token === "dev-bypass") {
    return { userId: "dev-user" };
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (betaBlocked(decoded.uid)) {
      return { error: NextResponse.json({ error: "Private beta" }, { status: 403 }) };
    }
    return { userId: decoded.uid };
  } catch {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
}
