// src/types/watchlist.ts

/** A user-owned named list of tickers. Mirrors the Firestore doc shape
 *  (serialized) returned by /api/watchlists. */
export interface Watchlist {
  id: string;
  name: string;
  tickers: string[]; // uppercase, de-duped, array order = display order
  createdAt: string; // ISO
  updatedAt: string; // ISO
}
