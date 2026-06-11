import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { requireAuth } from "@/lib/requireAuth";

export const runtime = "nodejs";

const MAX_MESSAGES = 200;

/**
 * Publish a read-only snapshot of a conversation to the top-level `shares`
 * collection (public — no auth on read). Re-sharing the same conversation
 * refreshes the snapshot in place so the link stays stable.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  try {
    const { id } = await params;
    const convRef = db
      .collection("users").doc(userId)
      .collection("conversations").doc(id);
    const snap = await convRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const msgSnap = await convRef
      .collection("messages")
      .orderBy("createdAt")
      .limit(MAX_MESSAGES)
      .get();
    const messages = msgSnap.docs
      .map((m) => {
        const { role, content, createdAt } = m.data() as {
          role?: string; content?: string; createdAt?: string;
        };
        return { role: role === "user" ? "user" : "assistant", content: content ?? "", createdAt: createdAt ?? null };
      })
      .filter((m) => m.content);

    if (messages.length === 0) {
      return NextResponse.json({ error: "Nothing to share yet" }, { status: 400 });
    }

    const conv = snap.data()!;
    const firstUser = messages.find((m) => m.role === "user");
    const title: string =
      conv.title ??
      (firstUser ? firstUser.content.slice(0, 60) : "Finava conversation");

    // Stable link: reuse the conversation's existing share doc when present.
    const existingShareId = typeof conv.shareId === "string" ? conv.shareId : null;
    const shareRef = existingShareId
      ? db.collection("shares").doc(existingShareId)
      : db.collection("shares").doc();

    await shareRef.set({
      title,
      messages,
      createdBy: userId,
      sourceConversationId: id,
      createdAt: new Date().toISOString(),
    });
    if (!existingShareId) await convRef.update({ shareId: shareRef.id });

    return NextResponse.json({ shareId: shareRef.id, url: `/share/${shareRef.id}` });
  } catch (err) {
    console.error("[conversation share]", err);
    return NextResponse.json({ error: "Failed to create share link" }, { status: 500 });
  }
}
