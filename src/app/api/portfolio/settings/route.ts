import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { withRoute } from "@/lib/withRoute";
import { PortfolioSettingsSchema } from "@/lib/schemas/portfolio";

function settingsDoc(uid: string) {
  return db.collection("users").doc(uid).collection("portfolioSettings").doc("default");
}

async function getOrCreate(uid: string) {
  const docRef = settingsDoc(uid);
  const snap = await docRef.get();
  if (!snap.exists) {
    const data = { cashBalance: 0, updatedAt: new Date().toISOString() };
    await docRef.set(data);
    return data;
  }
  return snap.data()!;
}

export const GET = withRoute({}, async ({ userId }) => {
  const settings = await getOrCreate(userId);
  return NextResponse.json(settings);
});

export const PATCH = withRoute({ body: PortfolioSettingsSchema }, async ({ userId, body }) => {
  const { cashBalance } = body;
  const docRef = settingsDoc(userId);
  const snap = await docRef.get();
  const now = new Date().toISOString();
  if (snap.exists) {
    await docRef.update({ cashBalance, updatedAt: now });
  } else {
    await docRef.set({ cashBalance, updatedAt: now });
  }
  return NextResponse.json({ cashBalance, updatedAt: now });
});
