import { NextResponse } from "next/server";
import { db, serializeDoc, deleteRefsInBatches } from "@/lib/firebase-admin";
import { requireAuth } from "@/lib/requireAuth";

function convDoc(uid: string, id: string) {
  return db.collection("users").doc(uid).collection("conversations").doc(id);
}

// Hard ceiling on a single transcript load; far above any real conversation.
const MAX_MESSAGES = 1000;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  try {
    const { id } = await params;
    const docRef = convDoc(userId, id);
    const snap = await docRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const msgSnap = await docRef
      .collection("messages")
      .orderBy("createdAt")
      .limit(MAX_MESSAGES)
      .get();
    const messages = msgSnap.docs.map((m) => serializeDoc(m.id, m.data()));
    return NextResponse.json({ ...serializeDoc(snap.id, snap.data()!), messages });
  } catch (err) {
    console.error("[conversation GET]", err);
    return NextResponse.json({ error: "Failed to load conversation" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  try {
    const { id } = await params;
    const docRef = convDoc(userId, id);
    // Delete all messages first, then the conversation doc itself.
    const msgSnap = await docRef.collection("messages").get();
    await deleteRefsInBatches([...msgSnap.docs.map((m) => m.ref), docRef]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[conversation DELETE]", err);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  try {
    const { id } = await params;
    const { title, archived } = await req.json();
    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (typeof title === "string") updates.title = title;
    if (typeof archived === "boolean") updates.archived = archived;
    const docRef = convDoc(userId, id);
    await docRef.update(updates);
    const snap = await docRef.get();
    return NextResponse.json(serializeDoc(snap.id, snap.data()!));
  } catch (err) {
    console.error("[conversation PATCH]", err);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
