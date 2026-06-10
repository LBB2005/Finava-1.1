# Scoped Corner-Chat Popover + Research-Style Stock Bar

**Date:** 2026-06-09
**Status:** Approved design — ready for implementation plan

## Summary

Replace the persistent right-hand `ChatSidePanel` with a minimal top-right
**corner chat icon** that opens a small floating **launcher popover**. The
popover shows only the chats scoped to the current page's context
(Research / Watchlist / Portfolio / a specific stock) and a "new chat" button.
Selecting a chat or starting a new one opens the existing full `/chat` view.

Separately, restyle the **stock page top tab bar** to match the Research
command-bar (pill lenses + mast + price + the same corner chat icon).

This redesigns the in-progress (uncommitted) "Chat Side Panel" feature — the
docked rail is removed in favor of the corner popover.

## Goals

- A single, minimal chat affordance per page: a corner icon, not a docked rail.
- Chats are **scoped by where they were started** and the popover shows only
  that context's chats. Every chat still appears in the global **Recent chats**
  list on `/chat` — scoping filters the popover only, it never hides anything.
- The stock page top bar adopts the Research pill-lens command-bar look.
- Keep the existing bottom `GlobalComposer`; it gains context awareness.

## Non-Goals

- No per-tab scoping inside a stock (one bucket per ticker — confirmed).
- No backfill of `context` onto existing conversations. Legacy chats stay
  `null` and surface only in global Recent.
- No change to the chat engine, agents, streaming, or `/chat` layout itself
  (beyond honoring a primed context when creating a new conversation).

## Interaction Model (locked)

1. Chat icon sits top-right of each page's top bar.
2. Click → floating launcher popover anchored under the icon. Dismiss via
   click-outside or Esc. Subtle fade/scale motion (refined, not flashy).
3. Popover contents (launcher only — no inline thread):
   - Eyebrow: `CHATS · <CONTEXT LABEL>`
   - `+` new-chat button
   - Scoped list: this context's conversations (title + relative time)
   - Row click → load that conversation + navigate to `/chat`
   - `+` → navigate to `/chat` with this context primed for the next new chat
   - Empty: "No {context} chats yet."
4. A chat created on Portfolio (from the popover `+` **or** the bottom
   `GlobalComposer`) is tagged `portfolio`, so the Portfolio popover shows it.
   Same for Watchlist, Research, and each stock.
5. All chats — scoped or not — always appear in global Recent chats on `/chat`.

## Context Model

A conversation's context is one of:

- `"research"` — started on `/research`
- `"watchlist"` — started on `/watchlist`
- `"portfolio"` — started on `/portfolio`
- `"stock:<TICKER>"` — started on `/stock/<TICKER>` (e.g. `"stock:AAPL"`)
- `null` — no context (legacy chats, or chats started directly on `/chat`)

### Storage

- Firestore: `users/{uid}/conversations/{id}` gains a `context: string | null`
  field.
- `POST /api/conversations` (`src/app/api/conversations/route.ts`) reads
  `context` from the body and stores it (default `null`).
- `GET /api/conversations` is **unchanged** — still returns all conversations
  (so Recent chats is complete). `serializeDoc` already passes through stored
  fields, so `context` flows to the client automatically.

### Client filtering

The popover does **not** hit the network separately. It reads the same
SWR-cached `/api/conversations` list that `ConversationList` uses and filters
client-side by the current page's context. This keeps the popover in sync with
Recent chats and avoids a second fetch.

`Conversation` type (`ConversationList.tsx`) gains `context?: string | null`.

## Components & Files

### New

- **`src/lib/chatContext.ts`**
  - `type ChatContext = string | null`
  - `contextFromPath(pathname: string, ticker?: string): ChatContext` —
    `/research` → `"research"`, `/watchlist` → `"watchlist"`,
    `/portfolio` → `"portfolio"`, `/stock/<T>` → `"stock:<T>"`, else `null`.
  - `contextLabel(ctx: ChatContext): string` — display label for the eyebrow,
    e.g. `"research"` → `"RESEARCH"`, `"stock:AAPL"` → `"AAPL"`.

- **`src/components/chat/ChatContextButton.tsx`**
  - The icon button + launcher popover. Takes an explicit `context: ChatContext`
    prop (callers derive it via `contextFromPath`, passing the ticker on the
    stock page). Explicit prop keeps the component pure/testable rather than
    reading the route itself.
  - Reads the SWR conversation list, filters by `context`, renders the scoped
    list. Row select reuses the load-and-navigate flow (see Integration).
  - Local open/close state (only one popover exists per page). Click-outside +
    Esc to dismiss.

### Modified

- **`src/app/api/conversations/route.ts`** — `POST` stores `context`.
- **`src/stores/chatStore.ts`** — add `pendingContext: ChatContext` +
  `setPendingContext`. Cleared on `reset`/after consumption. Consumed at
  conversation-creation time so the new doc is tagged.
- **`src/components/chat/GlobalComposer.tsx`** — set `pendingContext` from the
  current route on send; **remove** the panel-width right-inset logic
  (`md:right-[300px]` / `md:right-[44px]`) so the composer spans the full
  content width. Keep the bottom composer and watchlist prefixing.
- **`src/components/layout/ConversationList.tsx`** — `Conversation` type gains
  `context`. (Recent list rendering is otherwise unchanged.)
- **`src/app/research/page.tsx`** — remove `ChatSidePanel`; add
  `ChatContextButton` into the `b-bar-right` cluster; unwrap the
  `flex h-full overflow-hidden` shell that existed only to host the rail.
- **`src/app/stock/[ticker]/page.tsx`** + **`src/components/stock/StockTabs.tsx`**
  (or a new small `StockTabBar`) — rebuild the sticky tab bar in the `b-bar`
  pill-lens style: mast (ticker / company · exchange), pill lenses for the 6
  tabs, right cluster with live price/change + `ChatContextButton`
  (`context="stock:<TICKER>"`).
- **`src/app/watchlist/page.tsx`** + **`src/components/watchlist/WatchlistSplitRail.tsx`**
  — remove `ChatSidePanel`; add `ChatContextButton` into the rail's header;
  drop the `flex` shell that hosted the rail.
- **`src/app/portfolio/page.tsx`** — remove `ChatSidePanel`; add
  `ChatContextButton` top-right of the page header; drop the rail shell.

### Removed

- **`src/components/chat/ChatSidePanel.tsx`**
- **`src/stores/chatPanelStore.ts`** (and all `CHAT_PANEL_WIDTH` / `_RAIL`
  imports — currently `GlobalComposer` and the deleted panel).

## Integration: opening a conversation from the popover

`ConversationList.loadConversation(conv)` already: maps messages into the chat
store, sets `conversationId`, reconciles streaming state, then navigates to
`/chat` (or calls `onSelect`). The popover reuses this exact behavior so a
selected chat opens identically to the sidebar. Extract the load-and-navigate
logic into a small shared helper (e.g. `src/lib/openConversation.ts` or a
`useOpenConversation` hook) consumed by both `ConversationList` and
`ChatContextButton`, to avoid duplicating the store-reconciliation logic.

## New-chat context priming

1. Popover `+` (or `GlobalComposer` send) sets `chatStore.pendingContext` to the
   current context and routes to `/chat`.
2. When the next conversation is created via `POST /api/conversations`, the
   caller includes `context: pendingContext`.
3. `pendingContext` is cleared once consumed (and on `reset`).

This keeps a single source of truth for "what context should the next new chat
get," regardless of which entry point started it.

## Stock Top Bar (approved mockup)

Replace the plain `.tbtn` sticky tab row with a `b-bar`-style bar:

- **Mast (left):** ticker (serif) over `COMPANY · EXCHANGE` (mono eyebrow).
- **Pill lenses (center):** Overview / Financials / Analysts / News / DCF /
  Finava, using the Research `b-lenses-pill` / `b-lens` vocabulary.
- **Right cluster:** live price + % change, a thin divider, then
  `ChatContextButton`.
- Stays sticky (`position: sticky; top: 0`).

The bar reuses existing Research bar CSS classes where possible so the two pages
stay visually consistent.

## Visual / Motion

- Popover: subtle fade + slight scale-in, fast (per `[[motion-preference]]` —
  refined, not flashy). Honor `prefers-reduced-motion`.
- Corner icon: same speech-bubble glyph already used by the rail's collapsed
  state, sized minimally to match each bar.

## Testing

- `contextFromPath` / `contextLabel`: unit tests in
  `src/lib/chatContext.test.ts` (vitest is already configured) covering each
  route shape, ticker casing, and the `null` fallback.
- Manual verification via the dev preview:
  - Icon renders top-right on Research / Watchlist / Portfolio / Stock.
  - Popover opens/closes (click, click-outside, Esc).
  - A new chat started on Portfolio appears in the Portfolio popover and in
    Recent; not in the Research popover.
  - A new chat started on `/stock/AAPL` appears under AAPL's popover only.
  - Bottom composer still works and tags context.
  - Stock bar pills switch tabs; price + icon render.
  - Old rail is gone; no layout gap where it sat.

## Rollout / Risks

- Removing `chatPanelStore` touches `GlobalComposer` — verify no other importers
  remain.
- `WatchlistSplitRail` and `GlobalComposer` are uncommitted in-progress files;
  this design modifies them in place rather than reverting.
- Legacy chats (`context: null`) intentionally never appear in scoped popovers.
