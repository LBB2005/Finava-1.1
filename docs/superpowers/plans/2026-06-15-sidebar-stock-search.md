# Sidebar Stock Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a prominent stock-search pill to the sidebar that autocompletes S&P 500 names/tickers with live prices and navigates to `/stock/<TICKER>` on selection.

**Architecture:** Pure matching/sanitize logic lives in a tested module (`src/lib/stockSearch.ts`). A thin client component (`SidebarStockSearch.tsx`) consumes it, renders the pill + inline dropdown, wires `useQuotes` for live prices, and uses `next/navigation` to route. The component is mounted once in `Sidebar.tsx` between the brand row and the nav body.

**Tech Stack:** Next.js (App Router) + React client components, TypeScript, Tailwind utility classes + CSS variables, SWR via existing `useQuotes`, vitest (node env) for the pure module.

---

## File Structure

- Create: `src/lib/stockSearch.ts` — pure `searchStocks()` + `sanitizeSymbol()`.
- Create: `src/lib/stockSearch.test.ts` — vitest unit tests for the pure module.
- Create: `src/components/layout/SidebarStockSearch.tsx` — the pill + dropdown component.
- Modify: `src/components/layout/Sidebar.tsx` — import + render the component once.

Data sources (existing, do not modify):
- `src/lib/sp500.ts` → `SP500: Constituent[]` where `Constituent = { ticker, name, sector }`.
- `src/hooks/useQuotes.ts` → `useQuotes(tickers: string[])` returns `{ quoteMap: Map<string, Quote> }`; `Quote = { ticker, price, change, changePct, ... }`.

---

## Task 1: Pure search/sanitize module

**Files:**
- Create: `src/lib/stockSearch.ts`
- Test: `src/lib/stockSearch.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/stockSearch.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { searchStocks, sanitizeSymbol } from "@/lib/stockSearch";
import type { Constituent } from "@/lib/sp500";

const UNIVERSE: Constituent[] = [
  { ticker: "AAPL", name: "Apple Inc.", sector: "Information Technology" },
  { ticker: "AAP", name: "Advance Auto Parts", sector: "Consumer Discretionary" },
  { ticker: "MSFT", name: "Microsoft", sector: "Information Technology" },
  { ticker: "BRK.B", name: "Berkshire Hathaway", sector: "Financials" },
  { ticker: "GOOGL", name: "Alphabet", sector: "Communication Services" },
];

describe("searchStocks", () => {
  it("ranks an exact/prefix ticker match first", () => {
    const out = searchStocks("AAP", UNIVERSE, 7);
    expect(out[0].ticker).toBe("AAP"); // exact ticker beats AAPL prefix
    expect(out.map((s) => s.ticker)).toContain("AAPL");
  });

  it("matches on company name substring, case-insensitively", () => {
    const out = searchStocks("apple", UNIVERSE, 7);
    expect(out[0].ticker).toBe("AAPL");
  });

  it("returns [] for empty or whitespace query", () => {
    expect(searchStocks("", UNIVERSE, 7)).toEqual([]);
    expect(searchStocks("   ", UNIVERSE, 7)).toEqual([]);
  });

  it("caps results at the limit", () => {
    const out = searchStocks("a", UNIVERSE, 2); // many names contain "a"
    expect(out.length).toBeLessThanOrEqual(2);
  });
});

describe("sanitizeSymbol", () => {
  it("uppercases, trims, and keeps dotted symbols", () => {
    expect(sanitizeSymbol("  brk.b ")).toBe("BRK.B");
  });
  it("strips invalid characters", () => {
    expect(sanitizeSymbol("aa$pl!")).toBe("AAPL");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/stockSearch.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/stockSearch"` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/stockSearch.ts`:

```ts
import type { Constituent } from "@/lib/sp500";

/** Uppercase, trim, strip to a valid free-form symbol (A–Z, 0–9, dot, dash). */
export function sanitizeSymbol(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
}

/**
 * Rank a universe against a query.
 * Order: exact ticker → ticker prefix → name substring. Ties keep input order.
 * Returns at most `limit` matches; empty/whitespace query → [].
 */
export function searchStocks(
  query: string,
  universe: Constituent[],
  limit: number,
): Constituent[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];

  const scored: { c: Constituent; rank: number }[] = [];
  for (const c of universe) {
    const ticker = c.ticker.toUpperCase();
    const name = c.name.toUpperCase();
    let rank: number;
    if (ticker === q) rank = 0;
    else if (ticker.startsWith(q)) rank = 1;
    else if (name.includes(q)) rank = 2;
    else continue;
    scored.push({ c, rank });
  }

  scored.sort((a, b) => a.rank - b.rank);
  return scored.slice(0, limit).map((s) => s.c);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/stockSearch.test.ts`
Expected: PASS (6 assertions across 6 `it` blocks).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stockSearch.ts src/lib/stockSearch.test.ts
git commit -m "feat: pure stock search + symbol sanitize helpers"
```

---

## Task 2: SidebarStockSearch component

**Files:**
- Create: `src/components/layout/SidebarStockSearch.tsx`

> No unit test (node-env vitest can't render React; see spec). Behaviour is verified in-browser in Task 4.

- [ ] **Step 1: Write the component**

Create `src/components/layout/SidebarStockSearch.tsx`:

```tsx
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
    if (!sym) return;
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
          aria-expanded={showDropdown}
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
```

- [ ] **Step 2: Verify it type-checks / lints**

Run: `npx eslint src/components/layout/SidebarStockSearch.tsx src/lib/stockSearch.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/SidebarStockSearch.tsx
git commit -m "feat: SidebarStockSearch pill + inline autocomplete dropdown"
```

---

## Task 3: Mount the search in the sidebar

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Add the import**

In `src/components/layout/Sidebar.tsx`, with the other component imports near the top (after the `ChatSearchModal` import around line 13), add:

```tsx
import SidebarStockSearch from "./SidebarStockSearch";
```

- [ ] **Step 2: Render it between the brand row and the scrollable body**

In the same file, the brand row `</div>` ends around line 804 and the
`{/* Scrollable body — nav + briefing + recents */}` block begins around line 830.
Insert the component just before the scrollable body div. Find:

```tsx
      {/* Scrollable body — nav + briefing + recents */}
      <div className="flex-1 overflow-y-auto min-h-0">
```

and change it to:

```tsx
      {/* Stock lookup — type a ticker/name → /stock/<TICKER> */}
      <SidebarStockSearch />

      {/* Scrollable body — nav + briefing + recents */}
      <div className="flex-1 overflow-y-auto min-h-0">
```

- [ ] **Step 3: Verify lint**

Run: `npx eslint src/components/layout/Sidebar.tsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat: mount SidebarStockSearch in the sidebar"
```

---

## Task 4: Add the dropdown motion + browser verification

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add a subtle dropdown animation**

The component's dropdown uses class `ss-dropdown`. Append to `src/app/globals.css`:

```css
/* Sidebar stock-search dropdown — subtle fade + small slide (refined, no bounce). */
@keyframes ss-dropdown-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.ss-dropdown {
  animation: ss-dropdown-in 140ms cubic-bezier(0.4, 0, 0.2, 1);
}
@media (prefers-reduced-motion: reduce) {
  .ss-dropdown { animation: none; }
}
```

- [ ] **Step 2: Start the dev server and verify in-browser**

Use the preview tooling (per the environment's verification workflow):
1. `preview_start` (or reuse a running server).
2. Navigate to any in-app page (e.g. `/research`). If auth blocks it, use the dev auth toggle noted in project memory.
3. `preview_fill` the sidebar search with "apple".
4. `preview_snapshot` — confirm a dropdown lists AAPL with the company name, and a `%` appears once quotes load.
5. `preview_click` the AAPL row — confirm the URL is now `/stock/AAPL`.
6. Repeat with a free-form symbol not in the S&P 500 (e.g. type "PLTR", press Enter via `preview_eval` dispatching an Enter key, or just click after it appears) — confirm navigation to `/stock/PLTR` when typed and Enter is pressed even with no dropdown match.
7. `preview_console_logs` — confirm no errors.
8. `preview_screenshot` — capture the open dropdown to share as proof.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "style: subtle motion for sidebar stock-search dropdown"
```

---

## Task 5: Full verification pass

- [ ] **Step 1: Run the test suite**

Run: `npx vitest run`
Expected: all tests pass, including `src/lib/stockSearch.test.ts`.

- [ ] **Step 2: Lint the changed files**

Run: `npx eslint src/lib/stockSearch.ts src/components/layout/SidebarStockSearch.tsx src/components/layout/Sidebar.tsx`
Expected: no errors.

- [ ] **Step 3: Production build sanity check**

Run: `npm run build`
Expected: build completes without type errors.

- [ ] **Step 4: Final commit (if any lint/build fixups were needed)**

```bash
git add -A
git commit -m "chore: sidebar stock search verification fixups"
```

---

## Self-Review Notes

- **Spec coverage:** pill placement (Task 3), client-side S&P 500 matching (Task 1), live price via `useQuotes` (Task 2), free-form fallback (Task 1 `sanitizeSymbol` + Task 2 Enter handler), keyboard nav + a11y combobox roles (Task 2), subtle motion (Task 4), pure-module tests (Task 1). `TickerSearch` intentionally left untouched.
- **Types:** `Constituent` from `sp500.ts`; `Quote.changePct` used for the percent; `searchStocks(query, universe, limit)` and `sanitizeSymbol(raw)` signatures consistent across Tasks 1–2.
- **No new dependencies; no new API endpoints.**
