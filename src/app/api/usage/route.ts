import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/requireAuth";
import { getUsageSummary } from "@/lib/usage";

export const runtime = "nodejs";

export async function GET() {
  const { userId, error } = await requireAuth();
  if (error) return error;
  try {
    const summary = await getUsageSummary(userId);
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[usage GET]", err);
    return NextResponse.json({ error: "Failed to load usage" }, { status: 500 });
  }
}
