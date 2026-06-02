"use client";
import { useEffect, useRef, useState } from "react";
import { useWatchlists } from "@/hooks/useWatchlists";
import WatchlistPicker from "./WatchlistPicker";

export default function AddToWatchlistButton({
  ticker,
  variant = "button",
}: {
  ticker: string;
  variant?: "button" | "icon";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { watchlists } = useWatchlists();
  const inAny = watchlists.some((w) => w.tickers.includes(ticker));

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      {variant === "icon" ? (
        <button
          aria-label={`Add ${ticker} to watchlist`}
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen((o) => !o); }}
          style={{ color: inAny ? "var(--color-accent)" : "var(--color-muted)", fontSize: 13, padding: 4 }}
        >
          {inAny ? "★" : "☆"}
        </button>
      ) : (
        <button className={"tbtn" + (inAny ? " on" : "")} onClick={() => setOpen((o) => !o)}>
          {inAny ? "★ WATCHING" : "☆ WATCH"}
        </button>
      )}
      {open && <WatchlistPicker ticker={ticker} onClose={() => setOpen(false)} />}
    </div>
  );
}
