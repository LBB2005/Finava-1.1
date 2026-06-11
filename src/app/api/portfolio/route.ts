import { NextResponse } from "next/server";
import { db, serializeDoc, deleteRefsInBatches } from "@/lib/firebase-admin";
import { withRoute } from "@/lib/withRoute";
import { AddHoldingSchema } from "@/lib/schemas/portfolio";

function holdingsCol(uid: string) {
  return db.collection("users").doc(uid).collection("holdings");
}

export const GET = withRoute({}, async ({ userId }) => {
  const snap = await holdingsCol(userId).orderBy("ticker").get();
  const holdings = snap.docs.map((doc) => serializeDoc(doc.id, doc.data()));
  return NextResponse.json(holdings);
});

export const DELETE = withRoute({}, async ({ userId }) => {
  const snap = await holdingsCol(userId).get();
  await deleteRefsInBatches(snap.docs.map((doc) => doc.ref));
  return NextResponse.json({ ok: true });
});

export const POST = withRoute({ body: AddHoldingSchema }, async ({ userId, body }) => {
  const { ticker, companyName, shares, avgCost, sector } = body;

  const upperTicker = ticker.toUpperCase();
  const docRef = holdingsCol(userId).doc(upperTicker);
  const existing = await docRef.get();
  const now = new Date().toISOString();

  if (existing.exists) {
    await docRef.update({
      shares,
      avgCost,
      companyName: companyName ?? null,
      sector: sector ?? null,
      updatedAt: now,
    });
  } else {
    await docRef.set({
      userId,
      ticker: upperTicker,
      companyName: companyName ?? null,
      shares,
      avgCost,
      sector: sector ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  const updated = await docRef.get();
  return NextResponse.json(serializeDoc(updated.id, updated.data()!), { status: 201 });
});
