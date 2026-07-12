import { NextResponse } from "next/server";
import { db, serializeDoc } from "@/lib/firebase-admin";
import { withRoute } from "@/lib/withRoute";
import { CreateConversationSchema } from "@/lib/schemas/conversation";

function convsCol(uid: string) {
  return db.collection("users").doc(uid).collection("conversations");
}

// The list view only needs enough messages to derive a title (first user
// message). Full transcripts are loaded lazily via GET /api/conversations/[id];
// `?full=1` keeps the search modal's full-text search working, with a defensive
// per-conversation cap so one runaway thread can't blow up the payload.
const PREVIEW_MESSAGES = 4;
const FULL_MESSAGES_CAP = 200;

export const GET = withRoute({}, async ({ req, userId }) => {
  const { searchParams } = new URL(req.url);
  const full = searchParams.get("full") === "1";
  const perConvLimit = full ? FULL_MESSAGES_CAP : PREVIEW_MESSAGES;

  const snap = await convsCol(userId).orderBy("updatedAt", "desc").limit(50).get();

  // Archived chats stay in Firestore but are hidden from the sidebar list.
  // Filtered in code (not a `where`) so older docs without the flag need no index.
  const visible = snap.docs.filter((doc) => doc.data().archived !== true);

  const conversations = await Promise.all(
    visible.map(async (doc) => {
      const data = doc.data();
      // Preview messages only exist to derive a fallback title for conversations
      // that don't have one stored yet. Titled conversations (the common case)
      // skip the subcollection read entirely, turning the list from one read per
      // conversation into ~one total. `?full=1` still hydrates every transcript.
      const needsMessages = full || !data.title;
      const messages = needsMessages
        ? (
            await doc.ref
              .collection("messages")
              .orderBy("createdAt")
              .limit(perConvLimit)
              .get()
          ).docs.map((m) => serializeDoc(m.id, m.data()))
        : [];
      return { ...serializeDoc(doc.id, data), messages };
    })
  );

  return NextResponse.json(conversations);
});

export const POST = withRoute({ body: CreateConversationSchema }, async ({ userId, body }) => {
  const { id, title, context, pageContext } = body;
  const now = new Date().toISOString();
  const data = {
    userId,
    title: title ?? null,
    context: context ?? null,
    pageContext: pageContext ?? null,
    createdAt: now,
    updatedAt: now,
  };
  // The client generates the id so the streaming UI can render optimistically
  // before this write lands. Fall back to an auto-id when none is provided.
  const docRef = id ? convsCol(userId).doc(id) : convsCol(userId).doc();
  await docRef.set(data);
  const snap = await docRef.get();
  return NextResponse.json(
    { ...serializeDoc(snap.id, snap.data()!), messages: [] },
    { status: 201 }
  );
});
