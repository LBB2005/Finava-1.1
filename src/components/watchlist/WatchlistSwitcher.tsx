"use client";
import { useState } from "react";
import type { Watchlist } from "@/types/watchlist";

export default function WatchlistSwitcher({
  watchlists,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  watchlists: Watchlist[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const active = watchlists.find((w) => w.id === activeId) ?? null;

  function startRename() {
    if (!active) return;
    setDraft(active.name);
    setEditing(true);
  }
  function commitRename() {
    if (active && draft.trim()) onRename(active.id, draft.trim());
    setEditing(false);
  }

  return (
    <div className="flex items-center" style={{ gap: 8, flexWrap: "wrap" }}>
      {watchlists.map((w) => (
        <button
          key={w.id}
          onClick={() => onSelect(w.id)}
          className={"tbtn" + (w.id === activeId ? " on" : "")}
        >
          {w.name}
        </button>
      ))}

      <button className="tbtn" onClick={() => onCreate("New watchlist")}>＋ New</button>

      {active && (
        <span className="flex items-center" style={{ gap: 6, marginLeft: 8 }}>
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setEditing(false);
              }}
              className="tsel"
              style={{ width: 160 }}
              aria-label="Watchlist name"
            />
          ) : (
            <button className="tbtn" onClick={startRename} aria-label="Rename watchlist">Rename</button>
          )}
          <button
            className="tbtn"
            aria-label="Delete watchlist"
            onClick={() => {
              if (window.confirm(`Delete "${active.name}"?`)) onDelete(active.id);
            }}
          >
            Delete
          </button>
        </span>
      )}
    </div>
  );
}
