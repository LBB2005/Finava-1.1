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

`src/components/layout/SidebarStockSearch.test.tsx` (vitest, already configured):

1. Filtering returns matches by ticker prefix (e.g. "AAP" → AAPL).
2. Filtering returns matches by company name substring (e.g. "apple" → AAPL).
3. ↓ then Enter navigates to the highlighted suggestion's stock page.
4. Enter on a non-S&P free-form symbol routes to `/stock/<SYMBOL>`.
5. Esc clears / closes.

(`router.push` mocked via `next/navigation` mock.)

## Success criteria

- From any page, a user can type a name or ticker in the sidebar, see live-priced
  suggestions, and reach the correct stock page by click or keyboard.
- Non-S&P symbols still reachable via Enter.
- No new network endpoints; no per-keystroke fetches beyond the batched,
  cached quotes the app already issues.
