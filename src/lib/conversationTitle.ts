/**
 * Auto-generate a clean, human-readable title for a conversation.
 *
 * The sidebar otherwise shows the user's first message truncated mid-sentence.
 * After the first user↔assistant exchange exists, we ask the cheapest routed
 * model for a short Title-Case label and store it on the conversation doc.
 *
 * The title call is NOT metered against the user's credits (`meter: false`) —
 * good UX shouldn't cost them. Generation is idempotent and self-guarding, so
 * callers fire it and forget: a failure just leaves the raw-prompt fallback in
 * place until the next trigger.
 */
import { db } from "@/lib/firebase-admin";
import { generate } from "@/lib/llm";

/** Max characters we persist for a title (the DB schema caps at 200; we keep it short). */
const MAX_TITLE_LEN = 60;
/** How much of each message we feed the model — enough for topic, small enough to stay cheap. */
const MAX_INPUT_CHARS = 500;

/**
 * Clean a raw model response into a presentable title: trim, strip wrapping
 * quotes/backticks, collapse internal whitespace, drop trailing punctuation, and
 * clamp length. Returns "" when nothing usable remains (caller skips the write).
 */
export function sanitizeTitle(raw: string): string {
  let t = (raw ?? "").trim();
  // Strip a leading "Title:" style prefix some models add.
  t = t.replace(/^(?:title|chat|conversation)\s*[:\-–]\s*/i, "");
  // Strip matching wrapping quotes/backticks (straight or curly).
  t = t.replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, "").trim();
  // Collapse internal whitespace/newlines.
  t = t.replace(/\s+/g, " ");
  // Drop trailing punctuation (but keep closing parens).
  t = t.replace(/[.,;:!?\-–—\s]+$/g, "").trim();
  if (t.length > MAX_TITLE_LEN) {
    t = t.slice(0, MAX_TITLE_LEN).replace(/\s+\S*$/, "").trim();
  }
  return t;
}

const SYSTEM_PROMPT =
  "You write concise titles for chat conversations. Output a 3–6 word title in " +
  "Title Case that captures the topic. No quotation marks, no trailing " +
  "punctuation, no preamble — output only the title itself.";

/**
 * Generate and persist a title for `convId` if it doesn't have one yet and the
 * first user↔assistant exchange is complete. No-op otherwise. Never throws —
 * errors are logged and swallowed so titling can't break a chat.
 */
export async function generateConversationTitle(
  userId: string,
  convId: string
): Promise<void> {
  try {
    const convRef = db
      .collection("users")
      .doc(userId)
      .collection("conversations")
      .doc(convId);
    const convSnap = await convRef.get();
    if (!convSnap.exists) return;
    // Manual rename / prior auto-title always wins.
    const existing = convSnap.data()?.title;
    if (typeof existing === "string" && existing.trim()) return;

    const msgsSnap = await convRef
      .collection("messages")
      .orderBy("createdAt")
      .get();
    let firstUser = "";
    let firstAssistant = "";
    for (const doc of msgsSnap.docs) {
      const m = doc.data() as { role?: string; content?: string };
      if (!firstUser && m.role === "user" && m.content) firstUser = m.content;
      else if (!firstAssistant && m.role === "assistant" && m.content)
        firstAssistant = m.content;
      if (firstUser && firstAssistant) break;
    }
    // Need a complete exchange before we can title meaningfully.
    if (!firstUser || !firstAssistant) return;

    const prompt =
      `User asked:\n${firstUser.slice(0, MAX_INPUT_CHARS)}\n\n` +
      `Assistant replied:\n${firstAssistant.slice(0, MAX_INPUT_CHARS)}`;

    const raw = await generate({
      agent: "titleConversation",
      meter: false,
      system: SYSTEM_PROMPT,
      prompt,
      maxTokens: 24,
    });

    const title = sanitizeTitle(raw);
    if (!title) return; // leave the raw-prompt fallback in place; retry next trigger
    await convRef.update({ title });
  } catch (err) {
    console.warn(`[conversationTitle] failed for ${convId}:`, err);
  }
}
