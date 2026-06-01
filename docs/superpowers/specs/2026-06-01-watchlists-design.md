# Watchlists — Design

**Date:** 2026-06-01
**Status:** Approved, ready for implementation planning

## Summary

Let users track stocks they don't (necessarily) own via named **watchlists**. A user
can have multiple watchlists, name and rename them, create and delete them, and add or
remove individual stocks. Each watchlist renders as a live board (reusing the existing
Research leaderboard engine) with click-through to `/stock/[ticker]`. A dedicated
`/watchlist` page is the home for the feature; a collapsible widget in the sidebar gives
an always-available trimmed view.

This slots into patterns the app already has:
- User-scoped Firestore subcollections behind `requireAuth()` (mirrors `users/{uid}/strategies`).
- The existing `/api/leaderboard` endpoint that turns a ticker list into live rows.
- Stock pages at `/stock/[ticker]` for row click-through.

## Scope (v1)

In scope:
- Multiple named watchlists per user.
- Create / rename / delete a watchlist.
- Add / remove / reorder tickers within a watchlist.
- Live board view (price, day % change, sparkline) reusing the leaderboard data path.
- Dedicated `/watchlist` page + collapsible sidebar widget.
- Three add-to-watchlist entry points: stock page, Research board, and the watchlist page input.

Explicitly out of scope (v1):
- Price alerts / notifications.
- Cross-references to portfolio or other watchlists (considered and dropped).
- Seeded/starter watchlists for new users (empty state instead).

## Data Model

New Firestore subcollection, mirroring the `strategies` pattern:

```
users/{uid}/watchlists/{watchlistId}
  ├─ name: string          // "AI plays"
  ├─ tickers: string[]     // ["NVDA","MSFT","GOOGL"] — array order = display order
  ├─ userId: string        // denormalised owner id (matches strategies convention)
  ├─ createdAt: string     // ISO
  └─ updatedAt: string     // ISO
```

Notes:
- Tickers are stored as a single ordered array on the watchlist doc — no per-ticker
  documents. Reorder = rewrite the array; add/remove = array mutation.
- Tickers are normalised to uppercase and de-duplicated on write.

## API Routes

All routes use `requireAuth()`, scope to `users/{uid}/watchlists`, and serialize via
`serializeDoc` — same shape as `src/app/api/strategies/route.ts`. These routes only touch
Firestore; they never fetch market data.

| Route | Method | Behaviour |
|---|---|---|
| `/api/watchlists` | `GET` | List all of the user's watchlists, ordered by `createdAt`. |
| `/api/watchlists` | `POST` | Create a watchlist. Body `{ name }`; starts with empty `tickers`. |
| `/api/watchlists/[id]` | `PATCH` | Update an existing watchlist. Body `{ name?, tickers? }` — renames and/or replaces the ticker array (covers add, remove, reorder). |
| `/api/watchlists/[id]` | `DELETE` | Delete the whole watchlist. |

`PATCH` is intentionally a whole-array replace for `tickers` (client owns ordering and
sends the full desired list) rather than granular add/remove endpoints — simpler and
matches the array-on-doc model.

Live prices come from the **existing** `/api/leaderboard` endpoint: the page passes the
active watchlist's `tickers` and renders the returned rows. No new market-data code.

## UI

### `/watchlist` page (new top-level route + sidebar nav item)
- **Switcher** — the user's watchlists shown as tabs or a dropdown, plus "＋ New" (inline
  name input). The active watchlist supports inline rename and a delete (with confirm).
- **Live board** — reuses the Research leaderboard board component over the active list's
  tickers (ticker, name, price, day % change, sparkline). Row click → `/stock/[ticker]`.
  Each row has a remove (✕) control.
- **Add ticker** — an input with autocomplete above the board to add a ticker to the
  active watchlist.
- **Empty states** — no watchlists yet → prompt to create one. Watchlist with no tickers
  → prompt to add a stock.

### Sidebar collapsible widget
- New **Watchlist** nav item (links to `/watchlist`), matching the existing nav button
  style in `src/components/layout/Sidebar.tsx`.
- Beneath it, a collapsible section showing the active (or first) watchlist as a trimmed
  board: ticker + price + % change only. Collapse state persists. Rows click through to
  the stock page.

### Add-to-watchlist entry points (all three)
- **Stock page** (`/stock/[ticker]`) — a "★ Add to watchlist" button opening a small
  picker of the user's lists, with "＋ create new" inline.
- **Research board** — a star/＋ control on each leaderboard row opening the same picker.
- **Watchlist page** — the "＋ Add ticker" input described above.

The picker is a **shared component** reused by all three entry points.

## State & Data Fetching

- A small **Zustand** store holds the user's watchlists and the active watchlist id,
  matching how the rest of the app manages client state.
- **SWR** fetches `/api/watchlists` (list) and drives the leaderboard fetch for the active
  list's tickers. Mutations (create/rename/delete/add/remove/reorder) call the API routes
  and revalidate.

## Components (proposed boundaries)

- `WatchlistSwitcher` — list selection, create, rename, delete.
- `WatchlistBoard` — wraps the existing leaderboard board over a ticker array; adds the
  remove (✕) per row. (Reuse, don't fork, the Research board renderer.)
- `AddToWatchlistButton` / `WatchlistPicker` — the shared picker used by all entry points.
- `WatchlistSidebarWidget` — collapsible trimmed board for the sidebar.
- `useWatchlists` (Zustand store + SWR hooks) — data layer.

## Error Handling

- API routes return the same error envelope as `strategies` (`{ error }`, 500 on
  unexpected failure) and 401 via `requireAuth()`.
- The board view is failure-isolated by the existing leaderboard behaviour (a down source
  nulls its column rather than failing the whole board).
- Client mutations optimistically update then revalidate; on error, roll back and surface
  a toast/inline message.

## Testing

- API route tests: create → list → patch (rename, add, remove, reorder) → delete, plus
  auth scoping (a user can't read/write another user's watchlists) and ticker
  normalisation/de-dup on write.
- Component tests: switcher create/rename/delete flows, empty states, add/remove ticker,
  and the shared picker (including "create new" inline).
