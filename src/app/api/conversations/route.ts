import { NextResponse } from "next/server";
import { db, serializeDoc } from "@/lib/firebase-admin";
import { requireAuth } from "@/lib/requireAuth";

function convsCol(uid: string) {
  return db.collection("users").doc(uid).collection("conversations");
}

export async function GET() {
  const { userId, error } = await requireAuth();
  if (error) return error;
  try {
    const snap = await convsCol(userId).orderBy("updatedAt", "desc").limit(50).get();

    const conversations = await Promise.all(
      snap.docs.map(async (doc) => {
        const msgSnap = await doc.ref.collection("messages").orderBy("createdAt").get();
        const messages = msgSnap.docs.map((m) => serializeDoc(m.id, m.data()));
        return { ...serializeDoc(doc.id, doc.data()), messages };
      })
    );

    return NextResponse.json(conversations);
  } catch (err) {
    console.error("[conversations GET]", err);
    return NextResponse.json({ error: "Failed to load conversations" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  try {
    const body = await req.json();
    const { title, context } = body;
    const now = new Date().toISOString();
    const docRef = await convsCol(userId).add({
      userId,
      title: title ?? null,
      context: context ?? null,
      createdAt: now,
      updatedAt: now,
    });
    const snap = await docRef.get();
    return NextResponse.json(
      { ...serializeDoc(snap.id, snap.data()!), messages: [] },
      { status: 201 }
    );
  } catch (err) {
    console.error("[conversations POST]", err);
    return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
  }
}
