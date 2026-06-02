"use client";
import { useState } from "react";
import { useWatchlists } from "@/hooks/useWatchlists";

/** Popover body: choose which lists contain `ticker`, or create a new one. */
export default function WatchlistPicker({ ticker, onClose }: { ticker: string; onClose: () => void }) {
  const { watchlists, isLoading, createWatchlist, addTicker, removeTicker } = useWatchlists();
  const [newName, setNewName] = useState("");

  async function createAndAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const created = await createWatchlist(name);
    await addTicker(created.id, ticker);
    setNewName("");
  }

  return (
    <div
      role="dialog"
      aria-label={`Add ${ticker} to a watchlist`}
      style={{
        position: "absolute", zIndex: 50, top: "100%", right: 0, marginTop: 6, width: 240,
        background: "var(--color-surface)", border: "1px solid var(--color-border)",
        borderRadius: 8, padding: 10, boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text)" }}>
          ADD {ticker}
        </span>
        <button aria-label="Close" onClick={onClose} style={{ color: "var(--color-muted)", fontSize: 13 }}>✕</button>
      </div>

      {isLoading ? (
        <p style={{ fontSize: 12, color: "var(--color-muted)" }}>Loading…</p>
      ) : (
        <div className="flex flex-col" style={{ gap: 4, maxHeight: 180, overflowY: "auto" }}>
          {watchlists.map((w) => {
            const has = w.tickers.includes(ticker);
            return (
              <button
                key={w.id}
                onClick={() => (has ? removeTicker(w.id, ticker) : addTicker(w.id, ticker))}
                className="flex items-center justify-between"
                style={{ fontSize: 12.5, padding: "5px 7px", borderRadius: 5, color: "var(--color-text)", textAlign: "left" }}
              >
                <span>{w.name}</span>
                <span style={{ color: has ? "var(--color-accent)" : "var(--color-muted)" }}>{has ? "✓" : "＋"}</span>
              </button>
            );
          })}
          {watchlists.length === 0 && (
            <p style={{ fontSize: 12, color: "var(--color-muted)" }}>No watchlists yet.</p>
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
        <button type="submit" className="tbtn">＋</button>
      </form>
    </div>
  );
}
