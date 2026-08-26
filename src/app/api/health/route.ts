import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";

export const runtime = "nodejs";
// A health check must never be cached — it has to reflect live state each hit.
export const dynamic = "force-dynamic";

/**
 * Liveness + readiness probe. Public (no auth) and deliberately thin: a tiny
 * Firestore read proves credentials + connectivity without exposing any data.
 * Returns 200 when healthy, 503 when a critical dependency is down — wire it into
 * uptime monitoring so a broken deploy is caught before users report it.
 */
export async function GET() {
  const checks: Record<string, "ok" | "error"> = {};

  try {
    // Reading a non-existent doc still round-trips to Firestore (auth + network).
    await db.collection("_health").doc("_ping").get();
    checks.firestore = "ok";
  } catch {
    checks.firestore = "error";
  }

  const healthy = Object.values(checks).every((c) => c === "ok");
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", checks, t: new Date().toISOString() },
    { status: healthy ? 200 : 503 }
  );
}
