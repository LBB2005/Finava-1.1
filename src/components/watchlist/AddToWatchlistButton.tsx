"use client";
import { useEffect, useRef, useState } from "react";
import { useWatchlists } from "@/hooks/useWatchlists";
import WatchlistPicker from "./WatchlistPicker";

function StarIcon({ filled, size = 13 }: { filled: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

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
          style={{ color: inAny ? "var(--color-accent)" : "var(--color-muted)", padding: 4, display: "inline-flex", alignItems: "center" }}
        >
          <StarIcon filled={inAny} />
        </button>
      ) : (
        <button className={"tbtn" + (inAny ? " on" : "")} onClick={() => setOpen((o) => !o)} style={{ gap: 5 }}>
          <StarIcon filled={inAny} size={10} />
          {inAny ? "WATCHING" : "WATCH"}
        </button>
      )}
      {open && <WatchlistPicker ticker={ticker} onClose={() => setOpen(false)} />}
    </div>
  );
}
