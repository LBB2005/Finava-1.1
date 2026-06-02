"use client";
import { useEffect, useState } from "react";
import { useWatchlists } from "@/hooks/useWatchlists";
import { useWatchlistStore } from "@/stores/watchlistStore";
import WatchlistBoard from "@/components/watchlist/WatchlistBoard";
import AddTickerInput from "@/components/watchlist/AddTickerInput";

function SectionRule({ label }: { label: string }) {
  return (
    <div className="flex items-center" style={{ gap: 8 }}>
      <span className="mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "var(--color-muted)" }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
    </div>
  );
}

export default function WatchlistPage() {
  const { watchlists, isLoading, createWatchlist, updateWatchlist, deleteWatchlist, addTicker, removeTicker } =
    useWatchlists();
  const { activeId, setActiveId } = useWatchlistStore();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [mutateError, setMutateError] = useState<string | null>(null);

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
  const n = active?.tickers.length ?? 0;

  function startRename() {
    if (!active) return;
    setDraft(active.name);
    setRenaming(true);
  }
  function commitRename() {
    if (active && draft.trim()) updateWatchlist(active.id, { name: draft.trim() });
    setRenaming(false);
  }

  async function handleCreate() {
    setMutateError(null);
    try {
      const created = await createWatchlist("New watchlist");
      setActiveId(created.id);
    } catch {
      setMutateError("Failed to create watchlist.");
    }
  }

  async function handleDelete() {
    if (!active) return;
    if (!window.confirm(`Delete "${active.name}"?`)) return;
    setMutateError(null);
    try {
      await deleteWatchlist(active.id);
    } catch {
      setMutateError("Failed to delete watchlist.");
    }
  }

  return (
    <div className="research-root term flex flex-col h-full overflow-hidden">
      {/* Command bar */}
      <div
        className="cmdbar flex items-center flex-shrink-0"
        style={{ padding: "11px 22px", gap: 16, flexWrap: "wrap" }}
      >
        <div className="flex items-baseline" style={{ gap: 10 }}>
          <span
            className="serif"
            style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em", color: "var(--color-text)" }}
          >
            Watchlists
          </span>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--color-muted)", letterSpacing: "0.04em" }}>
            PERSONAL · {n} TICKER{n !== 1 ? "S" : ""}
          </span>
        </div>

        {/* List tabs */}
        <div className="flex items-center" style={{ gap: 4, flexWrap: "wrap" }}>
          {watchlists.map((w) => (
            <button
              key={w.id}
              onClick={() => setActiveId(w.id)}
              className={"tbtn" + (w.id === activeId ? " on" : "")}
            >
              {w.name}
            </button>
          ))}
          <button className="tbtn" onClick={handleCreate}>
            ＋ New
          </button>
        </div>

        {/* Active list controls */}
        {active && (
          <div className="flex items-center" style={{ gap: 6, marginLeft: "auto" }}>
            {renaming ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") setRenaming(false);
                }}
                className="tsel"
                style={{ width: 160 }}
                aria-label="Watchlist name"
              />
            ) : (
              <button className="tbtn" onClick={startRename}>
                Rename
              </button>
            )}
            <button className="tbtn" onClick={handleDelete}>
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Scrolling body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
          {mutateError && (
            <p style={{ fontSize: 12, color: "var(--color-bear)" }}>{mutateError}</p>
          )}

          {isLoading ? (
            <p style={{ fontSize: 12, color: "var(--color-muted)" }}>Loading…</p>
          ) : watchlists.length === 0 ? (
            <div style={{ paddingTop: 32 }}>
              <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12 }}>
                No watchlists yet. Create one to start tracking stocks.
              </p>
              <button className="tbtn on" onClick={handleCreate}>
                ＋ Create watchlist
              </button>
            </div>
          ) : active ? (
            <>
              <SectionRule
                label={`${active.name.toUpperCase()} · ${n} TICKER${n !== 1 ? "S" : ""}`}
              />
              <AddTickerInput onAdd={(t) => addTicker(active.id, t)} />
              <WatchlistBoard tickers={active.tickers} onRemove={(t) => removeTicker(active.id, t)} />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
