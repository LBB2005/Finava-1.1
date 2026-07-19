import { db } from "@/lib/firebase-admin";
import { plaidClient } from "@/lib/plaid";
import { decryptSecret } from "@/lib/crypto";
import type { Holding as PlaidHolding, Security } from "plaid";

/** Security types we treat as positions with a ticker. */
const TICKER_TYPES = new Set(["equity", "etf", "mutual fund"]);

export interface PlaidSyncSummary {
  imported: number; // positions written
  skipped: number; // holdings without a usable ticker (options, derivatives, unknown)
  cash: number | null; // total cash detected (null = none found, cash left untouched)
  // True when the destructive rebuild was skipped because Plaid returned zero
  // positions and no cash for linked items — we refuse to wipe a non-empty book.
  skippedEmptyRebuild?: boolean;
}

interface AggregatedPosition {
  ticker: string;
  companyName: string | null;
  shares: number;
  // share-weighted total cost, divided by shares at write time
  totalCost: number;
}

interface FetchedPositions {
  positions: Map<string, AggregatedPosition>;
  cash: number;
  foundCash: boolean;
  skipped: number;
}

/**
 * Fetch + normalise holdings for ONE Plaid access_token. Pure read — no writes.
 *
 * Cost basis note: Plaid's `cost_basis` is documented as the *total* cost basis,
 * but in sandbox and for most institutions it is returned *per share* (it tracks
 * `institution_price`, not `institution_value`). We treat it as per-share and
 * fall back to `institution_price` when null.
 */
async function fetchPositions(accessToken: string): Promise<FetchedPositions> {
  const res = await plaidClient.investmentsHoldingsGet({ access_token: accessToken });
  const { holdings, securities } = res.data;
  const securityMap = new Map<string, Security>(securities.map((s) => [s.security_id, s]));

  const positions = new Map<string, AggregatedPosition>();
  let cash = 0;
  let foundCash = false;
  let skipped = 0;

  for (const h of holdings as PlaidHolding[]) {
    const security = securityMap.get(h.security_id);
    if (!security) {
      skipped++;
      continue;
    }

    // Cash-type holdings feed the buying-power balance, not the positions list.
    if (security.type === "cash") {
      cash += h.institution_value ?? 0;
      foundCash = true;
      continue;
    }

    const ticker = security.ticker_symbol?.trim().toUpperCase();
    if (!ticker || !TICKER_TYPES.has(security.type ?? "")) {
      skipped++;
      continue;
    }

    const shares = h.quantity ?? 0;
    if (shares <= 0) {
      skipped++;
      continue;
    }

    const perShareCost = h.cost_basis ?? h.institution_price ?? 0;
    const existing = positions.get(ticker);
    if (existing) {
      existing.shares += shares;
      existing.totalCost += perShareCost * shares;
      existing.companyName = existing.companyName ?? security.name ?? null;
    } else {
      positions.set(ticker, {
        ticker,
        companyName: security.name ?? null,
        shares,
        totalCost: perShareCost * shares,
      });
    }
  }

  return { positions, cash, foundCash, skipped };
}

/** Merge one position map into an accumulator (sum shares + cost across brokerages). */
function mergeInto(target: Map<string, AggregatedPosition>, src: Map<string, AggregatedPosition>) {
  for (const [ticker, pos] of src) {
    const existing = target.get(ticker);
    if (existing) {
      existing.shares += pos.shares;
      existing.totalCost += pos.totalCost;
      existing.companyName = existing.companyName ?? pos.companyName;
    } else {
      target.set(ticker, { ...pos });
    }
  }
}

/**
 * Rebuild the user's entire holdings book from every linked Plaid Item.
 *
 * This is a *replace* operation: the existing holdings collection is wiped and
 * re-written from Plaid. That's intentional — once a brokerage is connected,
 * Plaid is the sole source of truth (manual entry is locked in the UI), so a
 * rebuild correctly reflects buys, sells, and position changes since last sync.
 */
export async function rebuildHoldings(userId: string): Promise<PlaidSyncSummary> {
  const itemsSnap = await db
    .collection("users")
    .doc(userId)
    .collection("plaidItems")
    .get();

  const combined = new Map<string, AggregatedPosition>();
  let cash = 0;
  let foundCash = false;
  let skipped = 0;

  for (const doc of itemsSnap.docs) {
    const { accessToken } = doc.data() as { accessToken?: string };
    if (!accessToken) continue;
    // Decrypt at rest. A decrypt failure propagates and aborts the rebuild BEFORE
    // any delete (see the empty-book guard below), so the existing book is never
    // wiped on a key/ciphertext problem.
    const r = await fetchPositions(decryptSecret(accessToken));
    mergeInto(combined, r.positions);
    skipped += r.skipped;
    if (r.foundCash) {
      foundCash = true;
      cash += r.cash;
    }
  }

  const holdingsCol = db.collection("users").doc(userId).collection("holdings");
  const existing = await holdingsCol.get();
  const now = new Date().toISOString();

  // Guardrail against silent data loss. If the rebuild produced zero positions
  // AND no cash while the user still has a non-empty book, the far likelier
  // cause is a transient/empty Plaid response (outage, Item in an error/pending
  // state, or a not-yet-throwing failure) than a genuine full liquidation. The
  // delete-all + write-none below would irreversibly destroy the user's holdings
  // and cost-basis history, so we refuse the wipe and leave the current book
  // intact. A real move-to-cash still returns cash (foundCash), and a real
  // liquidation reflects on the next sync that returns data.
  if (combined.size === 0 && !foundCash && existing.docs.length > 0) {
    console.warn(
      `[plaidSync] Skipping holdings rebuild for ${userId}: Plaid returned no ` +
        `positions or cash for ${itemsSnap.docs.length} linked item(s); refusing ` +
        `to wipe ${existing.docs.length} existing holding(s).`
    );
    return { imported: 0, skipped, cash: null, skippedEmptyRebuild: true };
  }

  // Atomic replace: delete the old book, write the Plaid book. For a ticker
  // present in both, the set() wins (last write); tickers no longer held are
  // dropped (handles sold positions).
  const batch = db.batch();
  existing.docs.forEach((d) => batch.delete(d.ref));
  for (const pos of combined.values()) {
    const avgCost = pos.shares > 0 ? pos.totalCost / pos.shares : 0;
    batch.set(holdingsCol.doc(pos.ticker), {
      userId,
      ticker: pos.ticker,
      companyName: pos.companyName,
      shares: pos.shares,
      avgCost,
      sector: null,
      source: "plaid",
      createdAt: now,
      updatedAt: now,
    });
  }
  await batch.commit();

  if (foundCash) {
    const settingsRef = db
      .collection("users")
      .doc(userId)
      .collection("portfolioSettings")
      .doc("default");
    const snap = await settingsRef.get();
    if (snap.exists) {
      await settingsRef.update({ cashBalance: cash, updatedAt: now });
    } else {
      await settingsRef.set({ cashBalance: cash, updatedAt: now });
    }
  }

  return { imported: combined.size, skipped, cash: foundCash ? cash : null };
}
