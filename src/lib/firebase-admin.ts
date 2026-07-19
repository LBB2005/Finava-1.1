import * as admin from "firebase-admin";
import { getServerEnv } from "@/lib/env";

if (!admin.apps.length) {
  const env = getServerEnv();
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

export const adminAuth = admin.auth();
export const db = admin.firestore();

/**
 * Delete document refs in chunked batches. Firestore batches cap at 500
 * operations, so an unchunked batch.commit() throws on larger collections.
 */
export async function deleteRefsInBatches(
  refs: admin.firestore.DocumentReference[],
  chunkSize = 450
): Promise<void> {
  for (let i = 0; i < refs.length; i += chunkSize) {
    const batch = db.batch();
    refs.slice(i, i + chunkSize).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

/** Convert a Firestore Timestamp (or Date) to an ISO string, or null. */
export function tsToISO(
  val: admin.firestore.Timestamp | Date | null | undefined
): string | null {
  if (!val) return null;
  if (val instanceof admin.firestore.Timestamp) return val.toDate().toISOString();
  return (val as Date).toISOString();
}

/** Serialize a Firestore document, converting all Timestamps to ISO strings. */
export function serializeDoc(
  id: string,
  data: admin.firestore.DocumentData
): Record<string, unknown> {
  const result: Record<string, unknown> = { id };
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof admin.firestore.Timestamp) {
      result[key] = value.toDate().toISOString();
    } else {
      result[key] = value;
    }
  }
  return result;
}
