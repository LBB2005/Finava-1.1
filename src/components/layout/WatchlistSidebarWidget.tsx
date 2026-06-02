"use client";
import { useEffect, useState } from "react";
import { useWatchlists } from "@/hooks/useWatchlists";
import { useWatchlistStore } from "@/stores/watchlistStore";
import WatchlistBoard from "@/components/watchlist/WatchlistBoard";

const COLLAPSE_KEY = "lucra:watchlist-widget-collapsed";

export default function WatchlistSidebarWidget() {
  const { watchlists } = useWatchlists();
  const { activeId } = useWatchlistStore();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
  }

  if (watchlists.length === 0) return null;
  const active = watchlists.find((w) => w.id === activeId) ?? watchlists[0];

  return (
    <div style={{ margin: "0 14px 10px", border: "1px solid var(--color-border)", borderRadius: 7, overflow: "hidden" }}>
      <button
        onClick={toggle}
        aria-expanded={!collapsed}
        className="flex items-center justify-between"
        style={{ width: "100%", padding: "7px 10px", background: "var(--color-surface)", color: "var(--color-text-secondary)", fontSize: 11.5, fontWeight: 600 }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{active.name}</span>
        <span style={{ color: "var(--color-muted)" }}>{collapsed ? "▸" : "▾"}</span>
      </button>
      {!collapsed && <WatchlistBoard tickers={active.tickers} compact />}
    </div>
  );
}
