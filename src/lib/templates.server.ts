import { db } from "@/lib/firebase-admin";
import { buildTemplateBlock, sanitizeFormats } from "@/lib/templates";

/**
 * Fetch a user's response template by id and render it into the system-prompt
 * block. Returns "" when the id is missing, the template doesn't exist, or it
 * carries nothing to inject — so callers can append the result unconditionally.
 *
 * Reads the user's own subcollection, so a `templateId` from the client can only
 * ever resolve to that user's own templates (no cross-user access).
 */
export async function getTemplateBlock(userId: string, templateId?: string | null): Promise<string> {
  if (!userId || !templateId) return "";
  try {
    const snap = await db.collection("users").doc(userId).collection("playbooks").doc(templateId).get();
    if (!snap.exists) return "";
    const data = snap.data() ?? {};
    const instructions = typeof data.instructions === "string" ? data.instructions : "";
    const formats = sanitizeFormats(data.formats ?? data.format);
    return buildTemplateBlock(instructions, formats);
  } catch (err) {
    console.error("[getTemplateBlock]", err);
    return "";
  }
}
