import { NextResponse } from "next/server";
import { db, serializeDoc } from "@/lib/firebase-admin";
import { withRoute } from "@/lib/withRoute";
import { CreateConvictionSchema } from "@/lib/schemas/conviction";

function convictionsCol(uid: string) {
  return db.collection("users").doc(uid).collection("convictions");
}

/** GET /api/convictions — the user's Conviction Ledger, newest first. */
export const GET = withRoute({}, async ({ userId }) => {
  const snap = await convictionsCol(userId).orderBy("updatedAt", "desc").get();
  return NextResponse.json(snap.docs.map((doc) => serializeDoc(doc.id, doc.data())));
});

/** POST /api/convictions — record a new thesis (manual entry in v1). */
export const POST = withRoute({ body: CreateConvictionSchema }, async ({ userId, body }) => {
  const now = new Date().toISOString();
  const docRef = await convictionsCol(userId).add({
    userId,
    ticker: body.ticker,
    direction: body.direction,
    thesisTrait: body.thesisTrait,
    factorTags: body.factorTags,
    reasoning: body.reasoning,
    falsifier: body.falsifier,
    confidence: body.confidence,
    status: body.status,
    source: body.source,
    outcomePct: null,
    createdAt: now,
    updatedAt: now,
  });
  const snap = await docRef.get();
  return NextResponse.json(serializeDoc(snap.id, snap.data()!), { status: 201 });
});
