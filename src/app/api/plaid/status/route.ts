import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/requireAuth";
import { db } from "@/lib/firebase-admin";

export interface PlaidInstitution {
  itemId: string;
  name: string | null;
  lastSyncedAt: string | null;
}

/**
 * Reports whether the user has any linked Plaid brokerage. Drives the
 * "connected → lock manual entry" behaviour and the Settings → Connections row.
 * Never returns access tokens.
 */
export async function GET() {
  const { userId, error } = await requireAuth();
  if (error) return error;

  try {
    const snap = await db
      .collection("users")
      .doc(userId)
      .collection("plaidItems")
      .get();

    const institutions: PlaidInstitution[] = snap.docs.map((d) => {
      const data = d.data() as { institutionName?: string | null; lastSyncedAt?: string | null };
      return {
        itemId: d.id,
        name: data.institutionName ?? null,
        lastSyncedAt: data.lastSyncedAt ?? null,
      };
    });

    return NextResponse.json({ connected: institutions.length > 0, institutions });
  } catch (err) {
    console.error("[plaid status]", err);
    return NextResponse.json({ error: "Failed to load Plaid status" }, { status: 500 });
  }
}
