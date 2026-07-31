"use client";
import { useState } from "react";
import { useWatchlists } from "@/hooks/useWatchlists";
import { useToast } from "@/hooks/useToast";

/** Popover body: choose which lists contain `ticker`, or create a new one. */
export default function WatchlistPicker({ ticker, onClose }: { ticker: string; onClose: () => void }) {
  const { watchlists, isLoading, createWatchlist, addTicker, removeTicker } = useWatchlists();
  const toast = useToast();
  const [newName, setNewName] = useState("");

  async function createAndAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    try {
      const created = await createWatchlist(name);
      await addTicker(created.id, ticker);
      setNewName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create that watchlist.");
    }
  }

  async function toggleTicker(id: string, has: boolean) {
    try {
      await (has ? removeTicker(id, ticker) : addTicker(id, ticker));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Couldn't update the watchlist for ${ticker}.`);
    }
  }

  return (
    <div
      role="dialog"
      aria-label={`Add ${ticker} to a watchlist`}
      className="popover"
      style={{
        position: "absolute", zIndex: 50, top: "100%", right: 0, marginTop: 6, width: 240,
        padding: 10,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <span className="mono" style={{ fontSize: "var(--text-meta)", fontWeight: 700, color: "var(--color-text)" }}>
          ADD {ticker}
        </span>
        <button aria-label="Close" onClick={onClose} style={{ color: "var(--color-muted)", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 2 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col" style={{ gap: 6 }}>
          <span className="skeleton" style={{ height: 14, width: "80%", borderRadius: "var(--radius-xs)" }} />
          <span className="skeleton" style={{ height: 14, width: "60%", borderRadius: "var(--radius-xs)" }} />
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 4, maxHeight: 180, overflowY: "auto" }}>
          {watchlists.map((w) => {
            const has = w.tickers.includes(ticker);
            return (
              <button
                key={w.id}
                onClick={() => toggleTicker(w.id, has)}
                className="flex items-center justify-between"
                style={{ fontSize: "var(--text-sm)", padding: "5px 7px", borderRadius: "var(--radius-sm)", color: "var(--color-text)", textAlign: "left" }}
              >
                <span>{w.name}</span>
                <span style={{ color: has ? "var(--color-accent)" : "var(--color-muted)", display: "inline-flex" }}>
                  {has ? (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  ) : (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  )}
                </span>
              </button>
            );
          })}
          {watchlists.length === 0 && (
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>No watchlists yet.</p>
          )}
        </div>
      )}

      <form onSubmit={createAndAdd} className="flex items-center" style={{ gap: 6, marginTop: 8 }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New list…"
          className="tsel"
          style={{ flex: 1 }}
          aria-label="New watchlist name"
        />
        <button type="submit" className="tbtn" aria-label="Create watchlist">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </form>
    </div>
  );
}
