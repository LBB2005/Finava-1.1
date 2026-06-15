# Sidebar Stock Search — Design

**Date:** 2026-06-15
**Status:** Approved, ready for implementation plan

## Goal

Give users a fast, always-available way to look up any stock and jump to its
research page. A prominent search pill lives in the sidebar; typing a ticker or
company name shows an inline dropdown of matching stocks with live price, and
selecting one navigates to `/stock/<TICKER>`.

This replaces the effectively-hidden, autocomplete-less `TickerSearch` as the
primary stock-lookup surface.

## Scope

**In scope**
- One new self-contained component placed in the sidebar.
- Client-side autocomplete over the S&P 500 list.
- Live price / % change on visible suggestions.
- Free-form fallback for non-S&P symbols.
- Keyboard navigation + accessibility.
- Unit tests.

**Out of scope (YAGNI — can follow later)**
- On-page search boxes on Research / Watchlist.
- ⌘K command palette.
- Recent-searches history.
- A dedicated search API endpoint.

## Component

`src/components/layout/SidebarStockSearch.tsx` — `"use client"`, self-contained.

Rendered once in `src/components/layout/Sidebar.tsx`, between the brand row
(around line 804) and the scrollable nav body (around line 831).

### Visual treatment

Prominent pill (full-width, gold-bordered search field) matching the chosen
mockup. Search icon on the left, placeholder "Search stocks". Inline dropdown
renders directly below the pill within the sidebar.

Motion is subtle/refined per user preference: a quick fade + small slide on the
dropdown, no bounce or flashy animation.

## Data & matching

- **Suggestion source:** the existing static `SP500` array from
  `src/lib/sp500.ts` (`{ ticker, name, sector }`, ~500 entries). No new API.
- **Filtering:** client-side, on each keystroke (list is small).
  - Rank: exact ticker match → ticker prefix match → company-name substring
    match.
  - Case-insensitive.
  - Cap at ~7 results.
- **Live price:** the existing `useQuotes(tickers)` hook, passed the tickers of
  the currently-visible suggestions. Renders `+1.2%` / `-0.4%` colored with
  `--color-bull` / `--color-bear`. Suggestions render immediately; price fills
  in when quotes resolve (no blocking, no layout shift — reserve the space).

## Interaction

- **Typing:** updates the query; dropdown opens when there is ≥1 char and ≥1
  match (or always shows the free-form hint row, see below).
- **Selection → navigation:** clicking a suggestion or pressing Enter on a
  highlighted one calls `router.push('/stock/<TICKER>')`, then clears the input
  and closes the dropdown.
- **Free-form fallback:** if the query matches no S&P 500 name but is a plausible
  symbol, pressing Enter routes to `/stock/<SANITIZED>` using the same sanitize
  rule as the current `TickerSearch`: `value.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "")`.
  This preserves the ability to reach small-caps / ETFs not in the S&P 500.
- **Keyboard:**
  - ↓ / ↑ move the highlighted suggestion.
  - Enter selects the highlighted suggestion, or does the free-form route if
    none is highlighted.
  - Esc closes the dropdown; a second Esc (or Esc on an empty dropdown) clears
    the input.
- **Click-outside** closes the dropdown (mousedown listener, same pattern as the
  existing sidebar menus / `UserWidget`).

## Accessibility

- WAI-ARIA combobox pattern: input has `role="combobox"`,
  `aria-expanded`, `aria-controls`, `aria-activedescendant`; the dropdown is a
  `role="listbox"` with `role="option"` rows.
- `aria-label="Search stocks"` on the input.
- Highlighted option reflected via `aria-activedescendant`.

## Existing code

- `TickerSearch` (`src/components/stock/TickerSearch.tsx`) is left in place — it
  is small and may be reused on other surfaces. The new component does not import
  it; the sanitize logic is simple enough to duplicate (or extract to a tiny
  shared helper if preferred during implementation).

## Testing

The repo's vitest runs in the **node** environment and only includes
`src/**/*.test.ts` — there is no jsdom / Testing Library, and the codebase
convention is to unit-test **pure logic**, not render React components. So the
matching/sanitize logic is extracted into a pure module and tested there; the
thin component is verified in-browser via the preview.

- **Pure module:** `src/lib/stockSearch.ts`
  - `searchStocks(query, universe, limit)` → ranked `Constituent[]`.
  - `sanitizeSymbol(raw)` → uppercased, stripped free-form symbol.
- **Test:** `src/lib/stockSearch.test.ts`
  1. Ticker prefix match (e.g. "AAP" → AAPL ranked first).
  2. Company-name substring match (e.g. "apple" → AAPL).
  3. Empty / whitespace query returns `[]`.
  4. Results capped at `limit`.
  5. `sanitizeSymbol("  brk.b ")` → `"BRK.B"`; strips invalid chars.
- **Component:** `SidebarStockSearch.tsx` imports `searchStocks` /
  `sanitizeSymbol`; its keyboard/dropdown/navigation behaviour is verified
  manually in the browser preview (consistent with the rest of the app, which
  has no component tests).

## Success criteria

- From any page, a user can type a name or ticker in the sidebar, see live-priced
  suggestions, and reach the correct stock page by click or keyboard.
- Non-S&P symbols still reachable via Enter.
- No new network endpoints; no per-keystroke fetches beyond the batched,
  cached quotes the app already issues.
