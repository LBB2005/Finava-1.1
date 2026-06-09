import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import { plaidClient, plaidConfigured } from "@/lib/plaid";
import { requireAuth } from "@/lib/requireAuth";
import { requireEntitlement } from "@/lib/entitlements";

/**
 * Creates a short-lived Plaid Link token scoped to the Investments product.
 * The client uses it to open Plaid Link; nothing here touches the user's data.
 */
export async function POST() {
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
    const res = await plaidClient.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: "Lucra",
      products: [Products.Investments],
      country_codes: [CountryCode.Us],
      language: "en",
    });
    return NextResponse.json({ link_token: res.data.link_token });
  } catch (err: unknown) {
    const detail =
      typeof err === "object" && err !== null && "response" in err
        ? (err as { response?: { data?: unknown } }).response?.data
        : undefined;
    console.error("[plaid create-link-token]", detail ?? err);
    return NextResponse.json({ error: "Failed to create link token" }, { status: 500 });
  }
}
