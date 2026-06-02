"use client";
import useSWR from "swr";
import { authFetch, authFetcher } from "@/lib/authFetch";
import type { Watchlist } from "@/types/watchlist";

const KEY = "/api/watchlists";

export function useWatchlists() {
  const { data, error, isLoading, mutate } = useSWR<Watchlist[]>(KEY, authFetcher, {
    revalidateOnFocus: false,
  });
  const watchlists = data ?? [];

  async function createWatchlist(name: string): Promise<Watchlist> {
    const res = await authFetch(KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error("Failed to create watchlist");
    const created: Watchlist = await res.json();
    await mutate();
    return created;
  }

  async function updateWatchlist(
    id: string,
    patch: { name?: string; tickers?: string[] }
  ): Promise<Watchlist> {
    const res = await authFetch(`${KEY}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error("Failed to update watchlist");
    const updated: Watchlist = await res.json();
    await mutate();
    return updated;
  }

  async function deleteWatchlist(id: string): Promise<void> {
    const res = await authFetch(`${KEY}/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete watchlist");
    await mutate();
  }

  /** Convenience: add a ticker to a watchlist (no-op if already present). */
  async function addTicker(id: string, ticker: string): Promise<void> {
    const wl = watchlists.find((w) => w.id === id);
    if (!wl) return;
    const sym = ticker.trim().toUpperCase();
    if (!sym || wl.tickers.includes(sym)) return;
    await updateWatchlist(id, { tickers: [...wl.tickers, sym] });
  }

  /** Convenience: remove a ticker from a watchlist. */
  async function removeTicker(id: string, ticker: string): Promise<void> {
    const wl = watchlists.find((w) => w.id === id);
    if (!wl) return;
    await updateWatchlist(id, { tickers: wl.tickers.filter((t) => t !== ticker) });
  }

  return {
    watchlists,
    error,
    isLoading,
    mutate,
    createWatchlist,
    updateWatchlist,
    deleteWatchlist,
    addTicker,
    removeTicker,
  };
}
