import { NextResponse } from "next/server";
import { plaidClient, plaidConfigured } from "@/lib/plaid";
import { requireAuth } from "@/lib/requireAuth";
import { db } from "@/lib/firebase-admin";
import { decryptSecret } from "@/lib/crypto";

/**
 * Disconnects all linked Plaid brokerages. Per the chosen policy, the
 * last-synced holdings are *kept and converted to manual* entries (source flips
 * to "manual"), so the user owns and can edit them. The Plaid Items are removed
 * both locally and at Plaid (best-effort), which lifts the manual-entry lock.
 */
export async function POST() {
  const { userId, error } = await requireAuth();
  if (error) return error;

  try {
    const userRef = db.collection("users").doc(userId);
    const itemsSnap = await userRef.collection("plaidItems").get();

    // Best-effort: invalidate the access tokens at Plaid so they can't be reused.
    if (plaidConfigured()) {
      await Promise.all(
        itemsSnap.docs.map(async (d) => {
          const { accessToken } = d.data() as { accessToken?: string };
          if (!accessToken) return;
          try {
            await plaidClient.itemRemove({ access_token: decryptSecret(accessToken) });
          } catch (e) {
            console.warn("[plaid disconnect] itemRemove failed (continuing)", e);
          }
        })
      );
    }

    const batch = db.batch();
    // Drop the stored Items (this is what flips connected → false).
    itemsSnap.docs.forEach((d) => batch.delete(d.ref));
    // Convert synced holdings into editable manual entries.
    const holdingsSnap = await userRef.collection("holdings").get();
    holdingsSnap.docs.forEach((d) => {
      if ((d.data() as { source?: string }).source === "plaid") {
        batch.update(d.ref, { source: "manual", updatedAt: new Date().toISOString() });
      }
    });
    await batch.commit();

    return NextResponse.json({ ok: true, converted: holdingsSnap.size });
  } catch (err) {
    console.error("[plaid disconnect]", err);
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
  }
}
