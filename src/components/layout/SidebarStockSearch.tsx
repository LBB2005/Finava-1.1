"use client";
import { useState, useRef, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SP500 } from "@/lib/sp500";
import { searchStocks, sanitizeSymbol } from "@/lib/stockSearch";
import { useQuotes } from "@/hooks/useQuotes";

const MAX_RESULTS = 7;

export default function SidebarStockSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);

  const results = useMemo(
    () => searchStocks(query, SP500, MAX_RESULTS),
    [query],
  );

  // Live prices for the visible suggestions only (batched + cached by the hook).
  const { quoteMap } = useQuotes(results.map((r) => r.ticker));

  // Close on outside click — same pattern as the sidebar's other menus.
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  function go(symbol: string) {
    const sym = sanitizeSymbol(symbol);
    // Require at least one letter so junk like "...", "-", or "123" doesn't
    // route to a garbage /stock/<sym> URL via the free-form fallback.
    if (!sym || !/[A-Z]/.test(sym)) return;
    setQuery("");
    setOpen(false);
    setHighlight(-1);
    router.push(`/stock/${sym}`);
  }

  function onChange(v: string) {
    setQuery(v);
    setOpen(true);
    setHighlight(-1);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlight >= 0 && results[highlight]) go(results[highlight].ticker);
      else if (query.trim()) go(query); // free-form fallback (non-S&P symbols)
    } else if (e.key === "Escape") {
      if (open) setOpen(false);
      else setQuery("");
      setHighlight(-1);
    }
  }

  const showDropdown = open && results.length > 0;

  return (
    <div ref={rootRef} className="relative px-[14px] pb-[10px] flex-shrink-0">
      <div className="relative">
        <svg
          className="absolute left-[10px] top-1/2 -translate-y-1/2 pointer-events-none"
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="var(--color-muted)" strokeWidth="2" strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => query && setOpen(true)}
          placeholder="Search stocks"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-controls="sidebar-stock-search-list"
          aria-activedescendant={highlight >= 0 ? `ss-opt-${highlight}` : undefined}
          aria-label="Search stocks"
          spellCheck={false}
          autoCapitalize="characters"
          autoComplete="off"
          className="w-full bg-[var(--color-surface)] rounded-[9px] py-[9px] pl-[34px] pr-3 text-[13px] focus:outline-none transition-colors duration-150"
          style={{
            border: "1px solid var(--color-accent-medium)",
            color: "var(--color-text)",
          }}
        />
      </div>

      {showDropdown && (
        <ul
          id="sidebar-stock-search-list"
          role="listbox"
          className="absolute left-[14px] right-[14px] z-50 mt-1 py-1 rounded-[10px] overflow-hidden ss-dropdown"
          style={{
            background: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            boxShadow: "var(--shadow-pop)",
          }}
        >
          {results.map((r, i) => {
            const q = quoteMap.get(r.ticker);
            const pct = q?.changePct;
            const up = (pct ?? 0) >= 0;
            return (
              <li
                key={r.ticker}
                id={`ss-opt-${i}`}
                role="option"
                aria-selected={i === highlight}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => { e.preventDefault(); go(r.ticker); }}
                className="flex items-center gap-2 px-3 py-[7px] cursor-pointer transition-colors duration-100"
                style={i === highlight ? { background: "var(--color-accent-light)" } : undefined}
              >
                <span className="text-[12.5px] font-semibold w-[52px] flex-shrink-0" style={{ color: "var(--color-accent)" }}>
                  {r.ticker}
                </span>
                <span className="text-[11.5px] truncate flex-1" style={{ color: "var(--color-text-secondary)" }}>
                  {r.name}
                </span>
                <span
                  className="text-[11px] font-medium w-[48px] text-right flex-shrink-0 tabular-nums"
                  style={{ color: pct == null ? "var(--color-muted)" : up ? "var(--color-bull)" : "var(--color-bear)" }}
                >
                  {pct == null ? "" : `${up ? "+" : ""}${pct.toFixed(1)}%`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
