import { NextResponse } from "next/server";
import { db, serializeDoc } from "@/lib/firebase-admin";
import { apiError } from "@/lib/apiError";
import { withRoute } from "@/lib/withRoute";
import { AddMessageSchema } from "@/lib/schemas/conversation";

export const POST = withRoute(
  { body: AddMessageSchema },
  async ({ userId, body }, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const { role, content, mode = "simple", agentTrace, durationMs } = body;

    // Verify the conversation belongs to this user
    const convRef = db.collection("users").doc(userId).collection("conversations").doc(id);
    const convSnap = await convRef.get();
    if (!convSnap.exists) {
      return apiError("not_found", "Conversation not found", 404);
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
  }
);
