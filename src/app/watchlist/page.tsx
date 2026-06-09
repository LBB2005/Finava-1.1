"use client";
import { useEffect, useState } from "react";
import { useWatchlists } from "@/hooks/useWatchlists";
import { useWatchlistStore } from "@/stores/watchlistStore";
import { useToast } from "@/hooks/useToast";
import { useLiveBoard } from "@/hooks/useLiveBoard";
import WatchlistBoard from "@/components/watchlist/WatchlistBoard";
import AddTickerInput from "@/components/watchlist/AddTickerInput";

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)] mb-1.5">{label}</p>
      <p
        className="text-[22px] font-bold leading-none tabular-nums"
        style={{ fontFamily: "var(--font-serif)", letterSpacing: "-0.015em", color: color ?? "var(--color-text)" }}
      >
        {value}
      </p>
    </div>
  );
}

function Summary({ tickers }: { tickers: string[] }) {
  const { liveMap } = useLiveBoard(tickers);
  const changes = tickers
    .map((t) => liveMap.get(t)?.changePct)
    .filter((c): c is number => c != null);
  const gainers = changes.filter((c) => c >= 0).length;
  const decliners = changes.filter((c) => c < 0).length;
  const avg = changes.length ? changes.reduce((s, c) => s + c, 0) / changes.length : null;

  return (
    <div
      className="rounded-[var(--radius-lg)] px-6 py-4"
      style={{
        border: "1px solid var(--color-border)",
        background: "var(--color-bg)",
        boxShadow: "var(--shadow-card)",
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr 1fr",
        gap: 24,
        alignItems: "center",
      }}
    >
      <Kpi label="Tracked" value={`${tickers.length}`} />
      <Kpi label="Gainers" value={`${gainers}`} color={gainers ? "var(--color-bull)" : undefined} />
      <Kpi label="Decliners" value={`${decliners}`} color={decliners ? "var(--color-bear)" : undefined} />
      <Kpi
        label="Avg Day"
        value={avg === null ? "—" : `${avg >= 0 ? "+" : ""}${avg.toFixed(2)}%`}
        color={avg === null ? undefined : avg >= 0 ? "var(--color-bull)" : "var(--color-bear)"}
      />
    </div>
  );
}

export default function WatchlistPage() {
  const { watchlists, isLoading, error, createWatchlist, updateWatchlist, deleteWatchlist, addTicker, removeTicker } =
    useWatchlists();
  const { activeId, setActiveId } = useWatchlistStore();
  const toast = useToast();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [mutateError, setMutateError] = useState<string | null>(null);

  // Surface read-path fetch errors. SWR keeps `error` referentially stable until
  // the next success, so a `[error]` dep only re-fires on a genuinely new error.
  useEffect(() => {
    if (error) toast.error("Couldn't load your watchlists. Check your connection and retry.");
  }, [error, toast]);

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
    } catch (err) {
      setMutateError("Failed to create watchlist.");
      toast.error(err instanceof Error ? err.message : "Failed to create watchlist.");
    }
  }

  async function handleDelete() {
    if (!active) return;
    if (!window.confirm(`Delete "${active.name}"?`)) return;
    setMutateError(null);
    try {
      await deleteWatchlist(active.id);
    } catch (err) {
      setMutateError("Failed to delete watchlist.");
      toast.error(err instanceof Error ? err.message : "Failed to delete watchlist.");
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
        <div className="max-w-[1100px] mx-auto" style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
          {mutateError && (
            <p style={{ fontSize: 12, color: "var(--color-bear)" }}>{mutateError}</p>
          )}

          {isLoading ? (
            <p style={{ fontSize: 12, color: "var(--color-muted)" }}>Loading…</p>
          ) : watchlists.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center text-center rounded-[var(--radius-lg)]"
              style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", padding: "48px 20px", gap: 12 }}
            >
              <p style={{ fontSize: 14, color: "var(--color-text)", fontFamily: "var(--font-serif)", fontWeight: 700 }}>
                No watchlists yet
              </p>
              <p style={{ fontSize: 12.5, color: "var(--color-text-secondary)" }}>
                Create a list to start tracking stocks you care about.
              </p>
              <button className="tbtn on" onClick={handleCreate}>
                ＋ Create watchlist
              </button>
            </div>
          ) : active ? (
            <>
              {n > 0 && <Summary tickers={active.tickers} />}

              {/* Board card */}
              <div
                className="overflow-hidden"
                style={{ borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)" }}
              >
                <div
                  className="flex items-center justify-between flex-wrap gap-3 px-5 py-3"
                  style={{ background: "var(--color-surface)", borderBottom: "1px solid var(--color-border)" }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    {active.name} · {n} stock{n !== 1 ? "s" : ""}
                  </p>
                  <AddTickerInput onAdd={(t) => addTicker(active.id, t)} />
                </div>
                <WatchlistBoard tickers={active.tickers} onRemove={(t) => removeTicker(active.id, t)} />
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
