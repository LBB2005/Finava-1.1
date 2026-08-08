// Cached Finava verdict — read-only. Serves the last completed 5-agent run for
// THIS user + ticker (written by the finava-analysis stream on completion).
// 404 = never run, which the client renders as the "Generate" state. No LLM
// calls, no metering, no rate limiter (matches the app's other per-user
// Firestore reads).
import { NextResponse } from "next/server";
import { withRoute } from "@/lib/withRoute";
import { apiError } from "@/lib/apiError";
import { readVerdict } from "@/lib/verdictStore";

export const GET = withRoute<undefined, true, { params: Promise<{ ticker: string }> }>(
  {},
  async ({ userId }, { params }) => {
    const { ticker } = await params;
    const symbol = (ticker ?? "").trim().toUpperCase();
    if (!symbol) return apiError("bad_request", "Missing ticker.", 400);

    const cached = await readVerdict(userId, symbol);
    if (!cached) return apiError("not_found", "No verdict yet.", 404);

    return NextResponse.json(cached);
  }
);
