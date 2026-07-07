import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/firebase-admin";
import { withRoute } from "@/lib/withRoute";
import { deriveAndCacheDna } from "@/lib/investorDnaStore";

/** "This is me" / "Not quite — refine" — captured as the first ML correction labels. */
const DnaFeedbackSchema = z.object({
  verdict: z.enum(["confirmed", "refine"]),
  note: z.string().max(500).optional().default(""),
});

/**
 * GET /api/dna — the user's Investor DNA, recomputed fresh from their holdings
 * crossed with the scored factor universe. Honors the `allowInvestorDNA` privacy
 * setting (default on). Returns `dna: null` with `hasHoldings` so the room can
 * tell "turned off" from "no holdings yet" from "holdings outside the S&P".
 */
export const GET = withRoute({}, async ({ userId }) => {
  const settingsSnap = await db.collection("userSettings").doc(userId).get();
  const allowed = (settingsSnap.data()?.allowInvestorDNA as boolean | undefined) ?? true;
  if (!allowed) {
    return NextResponse.json({ dna: null, hasHoldings: false, allowed: false });
  }

  const dna = await deriveAndCacheDna(userId);
  if (dna) {
    return NextResponse.json({ dna, hasHoldings: true, allowed: true, uncovered: dna.coverage.uncovered });
  }

  // No DNA derived — distinguish "no holdings yet" from "holdings, none covered"
  // and hand back the specific tickers so the empty state can name them.
  const snap = await db.collection("users").doc(userId).collection("holdings").select().get();
  const uncovered = snap.docs.map((d) => d.id);
  return NextResponse.json({ dna: null, hasHoldings: snap.size > 0, allowed: true, uncovered });
});

/** PATCH /api/dna — record the user's verdict on their read (label seed for the ML moat). */
export const PATCH = withRoute({ body: DnaFeedbackSchema }, async ({ userId, body }) => {
  await db.collection("users").doc(userId).collection("investorDNA").doc("current").set(
    { feedback: { verdict: body.verdict, note: body.note, at: new Date().toISOString() } },
    { merge: true }
  );
  return NextResponse.json({ ok: true });
});
