"use client";
import { useEffect } from "react";
import { useWatchlists } from "@/hooks/useWatchlists";
import { useWatchlistStore } from "@/stores/watchlistStore";
import WatchlistSwitcher from "@/components/watchlist/WatchlistSwitcher";
import WatchlistBoard from "@/components/watchlist/WatchlistBoard";
import AddTickerInput from "@/components/watchlist/AddTickerInput";

export default function WatchlistPage() {
  const { watchlists, isLoading, createWatchlist, updateWatchlist, deleteWatchlist, addTicker, removeTicker } = useWatchlists();
  const { activeId, setActiveId } = useWatchlistStore();

  // Keep an active selection valid as the list loads/changes.
  useEffect(() => {
    if (watchlists.length === 0) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    if (!activeId || !watchlists.some((w) => w.id === activeId)) {
      setActiveId(watchlists[0].id);
    }
  }, [watchlists, activeId, setActiveId]);

  const active = watchlists.find((w) => w.id === activeId) ?? null;

  async function handleCreate(name: string) {
    const created = await createWatchlist(name);
    setActiveId(created.id);
  }
  async function handleDelete(id: string) {
    await deleteWatchlist(id);
  }

  return (
    <div className="research-root term flex flex-col h-full overflow-y-auto" style={{ background: "var(--color-bg)" }}>
      <div style={{ padding: "22px 36px" }}>
        <h1 className="serif" style={{ fontSize: 22, fontWeight: 800, margin: "0 0 16px", color: "var(--color-text)" }}>
          Watchlists
        </h1>

        {isLoading ? (
          <p style={{ fontSize: 12, color: "var(--color-muted)" }}>Loading…</p>
        ) : watchlists.length === 0 ? (
          <div style={{ padding: "32px 0" }}>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12 }}>
              No watchlists yet. Create one to start tracking stocks.
            </p>
            <button className="tbtn on" onClick={() => handleCreate("My watchlist")}>＋ Create watchlist</button>
          </div>
        ) : (
          <>
            <WatchlistSwitcher
              watchlists={watchlists}
              activeId={activeId}
              onSelect={setActiveId}
              onCreate={handleCreate}
              onRename={(id, name) => updateWatchlist(id, { name })}
              onDelete={handleDelete}
            />

            {active && (
              <div style={{ marginTop: 18 }}>
                <div style={{ marginBottom: 12 }}>
                  <AddTickerInput onAdd={(t) => addTicker(active.id, t)} />
                </div>
                <WatchlistBoard tickers={active.tickers} onRemove={(t) => removeTicker(active.id, t)} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
