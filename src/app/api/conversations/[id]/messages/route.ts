import { NextResponse } from "next/server";
import { db, serializeDoc } from "@/lib/firebase-admin";
import { requireAuth } from "@/lib/requireAuth";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  try {
    const { id } = await params;
    const body = await req.json();
    const { role, content, mode = "simple", agentTrace, durationMs } = body;

    // Verify the conversation belongs to this user
    const convRef = db.collection("users").doc(userId).collection("conversations").doc(id);
    const convSnap = await convRef.get();
    if (!convSnap.exists) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const msgRef = await convRef.collection("messages").add({
      conversationId: id,
      role,
      content,
      mode,
      agentTrace: agentTrace ? JSON.stringify(agentTrace) : null,
      durationMs: typeof durationMs === "number" ? durationMs : null,
      createdAt: now,
    });

    await convRef.update({ updatedAt: now });

    const msgSnap = await msgRef.get();
    return NextResponse.json(serializeDoc(msgSnap.id, msgSnap.data()!), { status: 201 });
  } catch (err) {
    console.error("[messages POST]", err);
    return NextResponse.json({ error: "Failed to save message" }, { status: 500 });
  }
}
