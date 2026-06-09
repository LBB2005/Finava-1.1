import { NextResponse } from "next/server";
import { plaidClient, plaidConfigured } from "@/lib/plaid";
import { requireAuth } from "@/lib/requireAuth";
import { requireEntitlement } from "@/lib/entitlements";
import { db } from "@/lib/firebase-admin";
import { rebuildHoldings } from "@/lib/plaidSync";

/**
 * Exchanges a Plaid Link public_token for a long-lived access_token, stores the
 * Item server-side in Firestore, then runs an initial holdings sync.
 *
 * The access_token is a secret and never leaves the server.
 */
export async function POST(req: Request) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  const gate = await requireEntitlement(userId, "plaidLinking");
  if (gate) return gate;

  if (!plaidConfigured()) {
    return NextResponse.json(
      { error: "Plaid is not configured (missing PLAID_CLIENT_ID/PLAID_SECRET)" },
      { status: 503 }
    );
  }

  try {
    const { public_token, institution } = await req.json();
    if (!public_token || typeof public_token !== "string") {
      return NextResponse.json({ error: "public_token is required" }, { status: 400 });
    }

    const exchange = await plaidClient.itemPublicTokenExchange({ public_token });
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;

    // Persist the Item server-side (admin SDK → never exposed to client).
    const now = new Date().toISOString();
    await db
      .collection("users")
      .doc(userId)
      .collection("plaidItems")
      .doc(itemId)
      .set({
        itemId,
        accessToken,
        institutionName: institution?.name ?? null,
        institutionId: institution?.institution_id ?? null,
        createdAt: now,
        lastSyncedAt: now,
      });

    // Replace the whole book with the Plaid book (across all linked items).
    const summary = await rebuildHoldings(userId);

    await db
      .collection("users")
      .doc(userId)
      .collection("plaidItems")
      .doc(itemId)
      .update({ lastSyncedAt: new Date().toISOString() });

    return NextResponse.json({ ok: true, institution: institution?.name ?? null, ...summary });
  } catch (err: unknown) {
    const detail =
      typeof err === "object" && err !== null && "response" in err
        ? (err as { response?: { data?: unknown } }).response?.data
        : undefined;
    console.error("[plaid exchange]", detail ?? err);
    return NextResponse.json({ error: "Failed to link account" }, { status: 500 });
  }
}
