# Watchlists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users create multiple named watchlists of stocks, add/remove/reorder tickers, and view each as a live board, with a dedicated `/watchlist` page and a collapsible sidebar widget.

**Architecture:** Watchlists are stored as user-scoped Firestore docs (`users/{uid}/watchlists/{id}`), mirroring the existing `strategies` pattern. CRUD goes through new `/api/watchlists` route handlers behind `requireAuth()`. The client fetches the list via an SWR hook (`useWatchlists`) and renders live prices by feeding the active list's tickers into the existing `useLiveBoard` hook (`/api/leaderboard`). A shared `WatchlistPicker` powers all three add entry points (stock page, research board, watchlist page).

**Tech Stack:** Next.js 16 App Router (route handlers with `params: Promise<{ id }>`), Firebase Admin Firestore, SWR, Zustand, React, TypeScript. No test framework — verification is `npm run lint` + `npm run build` + browser preview.

---

## Pre-flight (read before writing code)

Per `AGENTS.md`, this is not stock Next.js. Before writing the route handlers, skim the App Router route-handler guide under `node_modules/next/dist/docs/` to confirm the handler signature and dynamic `params` convention. This codebase already uses `{ params }: { params: Promise<{ id: string }> }` with `const { id } = await params;` (see `src/app/api/strategies/[id]/route.ts`) — match that exactly.

**Reference files to imitate:**
- `src/app/api/strategies/route.ts` — GET/POST collection pattern, `requireAuth()`, `serializeDoc`, default-seed batch.
- `src/app/api/strategies/[id]/route.ts` — PATCH/DELETE with async `params`.
- `src/lib/authFetch.ts` — `authFetch` / `authFetcher` for client calls + SWR.
- `src/hooks/useLiveBoard.ts` — live board data by ticker list.
- `src/lib/research.ts` — `LiveRow` type, `UNIVERSE` (used as autocomplete source).
- `src/components/layout/Sidebar.tsx` (nav button block ~line 537) — nav button style.
- `src/components/stock/StockHero.tsx` (lines 34-42, 84, 88-99, 148-152) — existing localStorage watchlist toggle that THIS PLAN REPLACES.
- `src/components/research/BoardRow.tsx` — research leaderboard row (add entry point).

---

## File Structure

**Create:**
- `src/types/watchlist.ts` — `Watchlist` type (shared client/server shape).
- `src/app/api/watchlists/route.ts` — `GET` (list), `POST` (create).
- `src/app/api/watchlists/[id]/route.ts` — `PATCH` (rename / replace tickers), `DELETE`.
- `src/stores/watchlistStore.ts` — Zustand store holding the active watchlist id (shared by page + sidebar widget).
- `src/hooks/useWatchlists.ts` — SWR fetch of the list + CRUD mutation helpers.
- `src/components/watchlist/WatchlistBoard.tsx` — live board over a ticker array (wraps `useLiveBoard`), with per-row remove.
- `src/components/watchlist/WatchlistSwitcher.tsx` — list tabs + create / rename / delete controls.
- `src/components/watchlist/AddTickerInput.tsx` — ticker input with `<datalist>` autocomplete from `UNIVERSE`.
- `src/components/watchlist/WatchlistPicker.tsx` — shared popover: pick a list to add a ticker to, or create a new one.
- `src/components/watchlist/AddToWatchlistButton.tsx` — star button that opens `WatchlistPicker` (used by stock page + board row).
- `src/components/layout/WatchlistSidebarWidget.tsx` — collapsible trimmed board in the sidebar.
- `src/app/watchlist/page.tsx` — the page assembling switcher + board + add input.

**Modify:**
- `src/components/layout/Sidebar.tsx` — add a Watchlist nav button + mount the widget.
- `src/components/stock/StockHero.tsx` — replace the localStorage toggle with `AddToWatchlistButton`.
- `src/components/research/BoardRow.tsx` — add an `AddToWatchlistButton` to each row.

---

## Task 1: Watchlist type

**Files:**
- Create: `src/types/watchlist.ts`

- [ ] **Step 1: Create the type**

```ts
// src/types/watchlist.ts

/** A user-owned named list of tickers. Mirrors the Firestore doc shape
 *  (serialized) returned by /api/watchlists. */
export interface Watchlist {
  id: string;
  name: string;
  tickers: string[]; // uppercase, de-duped, array order = display order
  createdAt: string; // ISO
  updatedAt: string; // ISO
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint`
Expected: no errors referencing `src/types/watchlist.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/types/watchlist.ts
git commit -m "feat(watchlist): add Watchlist type"
```

---

## Task 2: Collection route — GET (list) + POST (create)

**Files:**
- Create: `src/app/api/watchlists/route.ts`

Mirrors `src/app/api/strategies/route.ts` but with no default seed (new users get an empty list — they hit the empty state).

- [ ] **Step 1: Write the route**

```ts
// src/app/api/watchlists/route.ts
import { NextResponse } from "next/server";
import { db, serializeDoc } from "@/lib/firebase-admin";
import { requireAuth } from "@/lib/requireAuth";
import type { Watchlist } from "@/types/watchlist";

function watchlistsCol(uid: string) {
  return db.collection("users").doc(uid).collection("watchlists");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toWatchlist(row: any): Watchlist {
  return {
    id: row.id,
    name: row.name,
    tickers: Array.isArray(row.tickers) ? row.tickers : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Uppercase, trim, drop blanks, de-dupe — preserving first-seen order. */
export function normalizeTickers(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of input) {
    if (typeof t !== "string") continue;
    const sym = t.trim().toUpperCase();
    if (!sym || seen.has(sym)) continue;
    seen.add(sym);
    out.push(sym);
  }
  return out;
}

export async function GET() {
  const { userId, error } = await requireAuth();
  if (error) return error;
  try {
    const snap = await watchlistsCol(userId).orderBy("createdAt", "asc").get();
    return NextResponse.json(
      snap.docs.map((doc) => toWatchlist(serializeDoc(doc.id, doc.data())))
    );
  } catch (err) {
    console.error("[watchlists GET]", err);
    return NextResponse.json({ error: "Failed to fetch watchlists" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  try {
    const body = await req.json();
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "New watchlist";
    const now = new Date().toISOString();
    const docRef = await watchlistsCol(userId).add({
      userId,
      name,
      tickers: normalizeTickers(body.tickers),
      createdAt: now,
      updatedAt: now,
    });
    const snap = await docRef.get();
    return NextResponse.json(toWatchlist(serializeDoc(snap.id, snap.data()!)));
  } catch (err) {
    console.error("[watchlists POST]", err);
    return NextResponse.json({ error: "Failed to create watchlist" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: PASS. The route `/api/watchlists` appears in the build's route list.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/watchlists/route.ts
git commit -m "feat(watchlist): add GET/POST collection route"
```

---

## Task 3: Item route — PATCH (rename / set tickers) + DELETE

**Files:**
- Create: `src/app/api/watchlists/[id]/route.ts`

Mirrors `src/app/api/strategies/[id]/route.ts`. PATCH replaces the whole `tickers` array (client owns ordering) and/or renames.

- [ ] **Step 1: Write the route**

```ts
// src/app/api/watchlists/[id]/route.ts
import { NextResponse } from "next/server";
import { db, serializeDoc } from "@/lib/firebase-admin";
import { requireAuth } from "@/lib/requireAuth";
import { normalizeTickers } from "../route";
import type { Watchlist } from "@/types/watchlist";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toWatchlist(row: any): Watchlist {
  return {
    id: row.id,
    name: row.name,
    tickers: Array.isArray(row.tickers) ? row.tickers : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function docFor(uid: string, id: string) {
  return db.collection("users").doc(uid).collection("watchlists").doc(id);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  try {
    const { id } = await params;
    const body = await req.json();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (body.tickers !== undefined) data.tickers = normalizeTickers(body.tickers);

    const docRef = docFor(userId, id);
    const existing = await docRef.get();
    if (!existing.exists) {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }
    await docRef.update(data);
    const snap = await docRef.get();
    return NextResponse.json(toWatchlist(serializeDoc(snap.id, snap.data()!)));
  } catch (err) {
    console.error("[watchlist PATCH]", err);
    return NextResponse.json({ error: "Failed to update watchlist" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  try {
    const { id } = await params;
    const docRef = docFor(userId, id);
    const existing = await docRef.get();
    if (!existing.exists) {
      return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    }
    await docRef.delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[watchlist DELETE]", err);
    return NextResponse.json({ error: "Failed to delete watchlist" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: PASS. Route `/api/watchlists/[id]` appears in the build output.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/watchlists/[id]/route.ts
git commit -m "feat(watchlist): add PATCH/DELETE item route"
```

---

## Task 4: Active-watchlist store

**Files:**
- Create: `src/stores/watchlistStore.ts`

A tiny Zustand store so the page and sidebar widget agree on which watchlist is active. Mirrors the existing `src/stores/chatStore.ts` style.

- [ ] **Step 1: Write the store**

```ts
// src/stores/watchlistStore.ts
import { create } from "zustand";

interface WatchlistUiState {
  activeId: string | null;
  setActiveId: (id: string | null) => void;
}

export const useWatchlistStore = create<WatchlistUiState>((set) => ({
  activeId: null,
  setActiveId: (id) => set({ activeId: id }),
}));
```

- [ ] **Step 2: Verify lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/stores/watchlistStore.ts
git commit -m "feat(watchlist): add active-watchlist UI store"
```

---

## Task 5: Data hook (`useWatchlists`)

**Files:**
- Create: `src/hooks/useWatchlists.ts`

SWR list fetch + CRUD mutation helpers that revalidate. Uses `authFetcher` / `authFetch` (the rest of the app's authed-call convention).

- [ ] **Step 1: Write the hook**

```ts
// src/hooks/useWatchlists.ts
"use client";
import useSWR from "swr";
import { authFetch, authFetcher } from "@/lib/authFetch";
import type { Watchlist } from "@/types/watchlist";

const KEY = "/api/watchlists";

export function useWatchlists() {
  const { data, error, isLoading, mutate } = useSWR<Watchlist[]>(KEY, authFetcher, {
    revalidateOnFocus: false,
  });
  const watchlists = data ?? [];

  async function createWatchlist(name: string): Promise<Watchlist> {
    const res = await authFetch(KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error("Failed to create watchlist");
    const created: Watchlist = await res.json();
    await mutate();
    return created;
  }

  async function updateWatchlist(
    id: string,
    patch: { name?: string; tickers?: string[] }
  ): Promise<Watchlist> {
    const res = await authFetch(`${KEY}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error("Failed to update watchlist");
    const updated: Watchlist = await res.json();
    await mutate();
    return updated;
  }

  async function deleteWatchlist(id: string): Promise<void> {
    const res = await authFetch(`${KEY}/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete watchlist");
    await mutate();
  }

  /** Convenience: add a ticker to a watchlist (no-op if already present). */
  async function addTicker(id: string, ticker: string): Promise<void> {
    const wl = watchlists.find((w) => w.id === id);
    if (!wl) return;
    const sym = ticker.trim().toUpperCase();
    if (!sym || wl.tickers.includes(sym)) return;
    await updateWatchlist(id, { tickers: [...wl.tickers, sym] });
  }

  /** Convenience: remove a ticker from a watchlist. */
  async function removeTicker(id: string, ticker: string): Promise<void> {
    const wl = watchlists.find((w) => w.id === id);
    if (!wl) return;
    await updateWatchlist(id, { tickers: wl.tickers.filter((t) => t !== ticker) });
  }

  return {
    watchlists,
    error,
    isLoading,
    mutate,
    createWatchlist,
    updateWatchlist,
    deleteWatchlist,
    addTicker,
    removeTicker,
  };
}
```

- [ ] **Step 2: Verify lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useWatchlists.ts
git commit -m "feat(watchlist): add useWatchlists data hook"
```

---

## Task 6: Watchlist board component

**Files:**
- Create: `src/components/watchlist/WatchlistBoard.tsx`

Renders live rows for a ticker array using `useLiveBoard`. Full variant (page) shows price / day % / mkt cap; compact variant (sidebar) shows ticker + price + %. Each row links to `/stock/[ticker]`; full variant has a remove (✕).

- [ ] **Step 1: Write the component**

```tsx
// src/components/watchlist/WatchlistBoard.tsx
"use client";
import Link from "next/link";
import { useLiveBoard } from "@/hooks/useLiveBoard";

function pct(n: number | null): string {
  if (n === null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function price(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function WatchlistBoard({
  tickers,
  compact = false,
  onRemove,
}: {
  tickers: string[];
  compact?: boolean;
  onRemove?: (ticker: string) => void;
}) {
  const { liveMap, isLoading } = useLiveBoard(tickers);

  if (tickers.length === 0) {
    return (
      <p style={{ fontSize: 12, color: "var(--color-muted)", padding: compact ? "8px 14px" : "20px 14px" }}>
        No stocks yet — add one to start tracking.
      </p>
    );
  }

  return (
    <div style={{ border: compact ? "none" : "1px solid var(--color-border)", borderRadius: 4, overflow: "hidden", background: "var(--color-bg)" }}>
      <table className="lad-table board-table" style={{ minWidth: compact ? undefined : 520, width: "100%" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Ticker</th>
            <th className="num">Last</th>
            <th className="num">Chg</th>
            {!compact && <th className="num">Mkt Cap</th>}
            {!compact && onRemove && <th style={{ width: 32 }} />}
          </tr>
        </thead>
        <tbody>
          {tickers.map((t) => {
            const row = liveMap.get(t);
            const chg = row?.changePct ?? null;
            const up = (chg ?? 0) >= 0;
            return (
              <tr key={t}>
                <td style={{ textAlign: "left" }}>
                  <Link href={`/stock/${t}`} style={{ color: "var(--color-text)", fontWeight: 600 }}>{t}</Link>
                </td>
                <td className="num">{isLoading && !row ? "…" : price(row?.price ?? null)}</td>
                <td className="num" style={{ color: chg === null ? "var(--color-muted)" : up ? "var(--color-bull)" : "var(--color-bear)" }}>
                  {pct(chg)}
                </td>
                {!compact && (
                  <td className="num">
                    {row?.marketCap == null ? "—" : `$${(row.marketCap / 1e9).toFixed(1)}B`}
                  </td>
                )}
                {!compact && onRemove && (
                  <td>
                    <button
                      aria-label={`Remove ${t}`}
                      onClick={() => onRemove(t)}
                      style={{ color: "var(--color-muted)", fontSize: 13, lineHeight: 1, padding: 4 }}
                    >
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Verify lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/watchlist/WatchlistBoard.tsx
git commit -m "feat(watchlist): add WatchlistBoard (full + compact)"
```

---

## Task 7: Add-ticker input (autocomplete)

**Files:**
- Create: `src/components/watchlist/AddTickerInput.tsx`

Native `<datalist>` autocomplete seeded from `UNIVERSE`; accepts any free-typed uppercase symbol too.

- [ ] **Step 1: Write the component**

```tsx
// src/components/watchlist/AddTickerInput.tsx
"use client";
import { useState } from "react";
import { UNIVERSE } from "@/lib/research";

export default function AddTickerInput({ onAdd }: { onAdd: (ticker: string) => void }) {
  const [value, setValue] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const sym = value.trim().toUpperCase();
    if (!sym) return;
    onAdd(sym);
    setValue("");
  }

  return (
    <form onSubmit={submit} className="flex items-center" style={{ gap: 8 }}>
      <input
        list="watchlist-ticker-options"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add ticker (e.g. NVDA)"
        className="tsel"
        style={{ width: 200, textTransform: "uppercase" }}
        aria-label="Add ticker"
      />
      <datalist id="watchlist-ticker-options">
        {UNIVERSE.map((s) => (
          <option key={s.ticker} value={s.ticker}>{s.name}</option>
        ))}
      </datalist>
      <button type="submit" className="tbtn">＋ Add</button>
    </form>
  );
}
```

- [ ] **Step 2: Verify lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/watchlist/AddTickerInput.tsx
git commit -m "feat(watchlist): add ticker input with autocomplete"
```

---

## Task 8: Watchlist switcher

**Files:**
- Create: `src/components/watchlist/WatchlistSwitcher.tsx`

Tabs of the user's lists + "＋ New", with inline rename and delete (with `confirm`) on the active list. Drives `useWatchlistStore`.

- [ ] **Step 1: Write the component**

```tsx
// src/components/watchlist/WatchlistSwitcher.tsx
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
              if (confirm(`Delete "${active.name}"?`)) onDelete(active.id);
            }}
          >
            Delete
          </button>
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/watchlist/WatchlistSwitcher.tsx
git commit -m "feat(watchlist): add WatchlistSwitcher"
```

---

## Task 9: Watchlist page

**Files:**
- Create: `src/app/watchlist/page.tsx`

Assembles switcher + add-input + board. Owns the "ensure an active id" logic and wires mutations from `useWatchlists`.

- [ ] **Step 1: Write the page**

```tsx
// src/app/watchlist/page.tsx
"use client";
import { useEffect } from "react";
import { useWatchlists } from "@/hooks/useWatchlists";
import { useWatchlistStore } from "@/stores/watchlistStore";
import WatchlistSwitcher from "@/components/watchlist/WatchlistSwitcher";
import WatchlistBoard from "@/components/watchlist/WatchlistBoard";
import AddTickerInput from "@/components/watchlist/AddTickerInput";

export default function WatchlistPage() {
  const { watchlists, isLoading, createWatchlist, updateWatchlist, deleteWatchlist, addTicker, removeTicker } = useWatchlists();
  const { activeId, setActiveId } = useWatchlistStore();

  // Keep an active selection valid as the list loads/changes.
  useEffect(() => {
    if (watchlists.length === 0) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    if (!activeId || !watchlists.some((w) => w.id === activeId)) {
      setActiveId(watchlists[0].id);
    }
  }, [watchlists, activeId, setActiveId]);

  const active = watchlists.find((w) => w.id === activeId) ?? null;

  async function handleCreate(name: string) {
    const created = await createWatchlist(name);
    setActiveId(created.id);
  }
  async function handleDelete(id: string) {
    await deleteWatchlist(id);
  }

  return (
    <div className="research-root term flex flex-col h-full overflow-y-auto" style={{ background: "var(--color-bg)" }}>
      <div style={{ padding: "22px 36px" }}>
        <h1 className="serif" style={{ fontSize: 22, fontWeight: 800, margin: "0 0 16px", color: "var(--color-text)" }}>
          Watchlists
        </h1>

        {isLoading ? (
          <p style={{ fontSize: 12, color: "var(--color-muted)" }}>Loading…</p>
        ) : watchlists.length === 0 ? (
          <div style={{ padding: "32px 0" }}>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12 }}>
              No watchlists yet. Create one to start tracking stocks.
            </p>
            <button className="tbtn on" onClick={() => handleCreate("My watchlist")}>＋ Create watchlist</button>
          </div>
        ) : (
          <>
            <WatchlistSwitcher
              watchlists={watchlists}
              activeId={activeId}
              onSelect={setActiveId}
              onCreate={handleCreate}
              onRename={(id, name) => updateWatchlist(id, { name })}
              onDelete={handleDelete}
            />

            {active && (
              <div style={{ marginTop: 18 }}>
                <div style={{ marginBottom: 12 }}>
                  <AddTickerInput onAdd={(t) => addTicker(active.id, t)} />
                </div>
                <WatchlistBoard tickers={active.tickers} onRemove={(t) => removeTicker(active.id, t)} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: PASS. `/watchlist` appears in the route list.

- [ ] **Step 3: Verify in preview**

Start the dev server (`preview_start` if not running), navigate to `/watchlist`. Confirm: empty state → create → switcher tab appears → add a ticker (e.g. NVDA) → row appears with live price → remove (✕) clears it → rename works → delete removes the list. Capture a screenshot once a list with a couple tickers renders.

- [ ] **Step 4: Commit**

```bash
git add src/app/watchlist/page.tsx
git commit -m "feat(watchlist): add /watchlist page"
```

---

## Task 10: Shared add-to-watchlist picker + button

**Files:**
- Create: `src/components/watchlist/WatchlistPicker.tsx`
- Create: `src/components/watchlist/AddToWatchlistButton.tsx`

The picker is the shared UI used by the stock page and research board. The button toggles the picker popover.

- [ ] **Step 1: Write the picker**

```tsx
// src/components/watchlist/WatchlistPicker.tsx
"use client";
import { useState } from "react";
import { useWatchlists } from "@/hooks/useWatchlists";

/** Popover body: choose which lists contain `ticker`, or create a new one. */
export default function WatchlistPicker({ ticker, onClose }: { ticker: string; onClose: () => void }) {
  const { watchlists, isLoading, createWatchlist, addTicker, removeTicker } = useWatchlists();
  const [newName, setNewName] = useState("");

  async function createAndAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const created = await createWatchlist(name);
    await addTicker(created.id, ticker);
    setNewName("");
  }

  return (
    <div
      role="dialog"
      aria-label={`Add ${ticker} to a watchlist`}
      style={{
        position: "absolute", zIndex: 50, top: "100%", right: 0, marginTop: 6, width: 240,
        background: "var(--color-surface)", border: "1px solid var(--color-border)",
        borderRadius: 8, padding: 10, boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text)" }}>
          ADD {ticker}
        </span>
        <button aria-label="Close" onClick={onClose} style={{ color: "var(--color-muted)", fontSize: 13 }}>✕</button>
      </div>

      {isLoading ? (
        <p style={{ fontSize: 12, color: "var(--color-muted)" }}>Loading…</p>
      ) : (
        <div className="flex flex-col" style={{ gap: 4, maxHeight: 180, overflowY: "auto" }}>
          {watchlists.map((w) => {
            const has = w.tickers.includes(ticker);
            return (
              <button
                key={w.id}
                onClick={() => (has ? removeTicker(w.id, ticker) : addTicker(w.id, ticker))}
                className="flex items-center justify-between"
                style={{ fontSize: 12.5, padding: "5px 7px", borderRadius: 5, color: "var(--color-text)", textAlign: "left" }}
              >
                <span>{w.name}</span>
                <span style={{ color: has ? "var(--color-accent)" : "var(--color-muted)" }}>{has ? "✓" : "＋"}</span>
              </button>
            );
          })}
          {watchlists.length === 0 && (
            <p style={{ fontSize: 12, color: "var(--color-muted)" }}>No watchlists yet.</p>
          )}
        </div>
      )}

      <form onSubmit={createAndAdd} className="flex items-center" style={{ gap: 6, marginTop: 8 }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New list…"
          className="tsel"
          style={{ flex: 1 }}
          aria-label="New watchlist name"
        />
        <button type="submit" className="tbtn">＋</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Write the button**

```tsx
// src/components/watchlist/AddToWatchlistButton.tsx
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
```

- [ ] **Step 3: Verify lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/watchlist/WatchlistPicker.tsx src/components/watchlist/AddToWatchlistButton.tsx
git commit -m "feat(watchlist): add shared picker + add-to-watchlist button"
```

---

## Task 11: Replace the stock page's localStorage watchlist

**Files:**
- Modify: `src/components/stock/StockHero.tsx`

Remove the localStorage watchlist (constants `WATCHLIST_KEY`, `readWatchlist`, state `watched`, effect, `toggleWatch`, and the `<button>` at ~line 149) and drop in `AddToWatchlistButton`.

- [ ] **Step 1: Add the import**

At the top of `src/components/stock/StockHero.tsx`, alongside the other component imports, add:

```tsx
import AddToWatchlistButton from "@/components/watchlist/AddToWatchlistButton";
```

- [ ] **Step 2: Remove the localStorage helper**

Delete this block (lines ~34-42):

```tsx
const WATCHLIST_KEY = "lucra:watchlist";
function readWatchlist(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(WATCHLIST_KEY) ?? "[]");
  } catch {
    return [];
  }
}
```

- [ ] **Step 3: Remove the `watched` state, effect, and `toggleWatch`**

Delete `const [watched, setWatched] = useState(false);`, the `useEffect` that calls `setWatched(readWatchlist().includes(ticker))`, and the entire `toggleWatch` function (lines ~88-99). If this removes the only use of `useEffect`, also drop `useEffect` from the React import.

- [ ] **Step 4: Replace the WATCH button**

Replace:

```tsx
<button className={"tbtn" + (watched ? " on" : "")} onClick={toggleWatch}>
  {watched ? "★ WATCHING" : "☆ WATCH"}
</button>
```

with:

```tsx
<AddToWatchlistButton ticker={ticker} variant="button" />
```

- [ ] **Step 5: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: PASS, no unused-variable warnings for `watched`/`readWatchlist`/`WATCHLIST_KEY`.

- [ ] **Step 6: Verify in preview**

Navigate to `/stock/NVDA`. Click the WATCH button → picker opens → add to a list → button shows ★ WATCHING. Reload → state persists from Firestore (not localStorage). Screenshot the open picker.

- [ ] **Step 7: Commit**

```bash
git add src/components/stock/StockHero.tsx
git commit -m "feat(watchlist): replace stock-page localStorage watch with Firestore picker"
```

---

## Task 12: Research board entry point

**Files:**
- Modify: `src/components/research/BoardRow.tsx`

Add an icon-variant `AddToWatchlistButton` to each row. (Read the file first — append the control to the ticker cell or a trailing cell without breaking the existing column layout.)

- [ ] **Step 1: Add the import**

At the top of `src/components/research/BoardRow.tsx`:

```tsx
import AddToWatchlistButton from "@/components/watchlist/AddToWatchlistButton";
```

- [ ] **Step 2: Render the icon button in the ticker cell**

In the ticker `<td>`, next to the ticker symbol, add (wrap the symbol + button in a flex container if needed):

```tsx
<AddToWatchlistButton ticker={s.ticker} variant="icon" />
```

Ensure the click doesn't trigger any row-level navigation — the button already calls `stopPropagation`/`preventDefault` in its icon variant.

- [ ] **Step 3: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 4: Verify in preview**

Navigate to `/research`. Confirm a ☆ on each row; clicking opens the picker and adding a ticker reflects on `/watchlist`. Screenshot a row with the picker open.

- [ ] **Step 5: Commit**

```bash
git add src/components/research/BoardRow.tsx
git commit -m "feat(watchlist): add watchlist star to research board rows"
```

---

## Task 13: Sidebar nav item + collapsible widget

**Files:**
- Create: `src/components/layout/WatchlistSidebarWidget.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Write the widget**

Collapsible compact board of the active (or first) watchlist; collapse state persisted in localStorage.

```tsx
// src/components/layout/WatchlistSidebarWidget.tsx
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
```

- [ ] **Step 2: Add the nav button + widget to the Sidebar**

In `src/components/layout/Sidebar.tsx`, add the import at the top:

```tsx
import WatchlistSidebarWidget from "./WatchlistSidebarWidget";
```

Add a `usePathname`-derived flag near the other `isOn…` flags (the component already imports `usePathname`):

```tsx
const isOnWatchlist = pathname === "/watchlist" || pathname.startsWith("/watchlist/");
```

Immediately AFTER the Research nav `</Link>` (closes ~line 564), insert a Watchlist nav button styled to match (copy the Research button's `className`/`style` structure, swapping `isOnResearch` → `isOnWatchlist`, `href="/research"` → `href="/watchlist"`, the label to `Watchlist`, and the icon to a star):

```tsx
{/* Watchlist nav button */}
<Link
  href="/watchlist"
  onClick={onNavigate}
  className="flex items-center gap-[7px] mx-[14px] mb-[6px] px-[10px] py-[7px] text-[12px] font-medium transition-all duration-150 flex-shrink-0"
  style={
    isOnWatchlist
      ? { background: "var(--color-accent)", color: "#fff", border: "1px solid var(--color-accent)", borderRadius: "4px", fontWeight: 600 }
      : { color: "var(--color-text-secondary)", border: "1px solid var(--color-border)", background: "var(--color-surface)", borderRadius: "7px" }
  }
>
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15 8.5 22 9.3 17 14 18.2 21 12 17.6 5.8 21 7 14 2 9.3 9 8.5 12 2" />
  </svg>
  Watchlist
</Link>

{/* Watchlist collapsible widget */}
<WatchlistSidebarWidget />
```

- [ ] **Step 3: Verify build + lint**

Run: `npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 4: Verify in preview**

Confirm the sidebar shows a Watchlist nav button (active styling on `/watchlist`) and, when at least one watchlist exists, a collapsible widget listing its tickers with live prices. Toggle collapse and reload to confirm persistence. Screenshot the sidebar expanded.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/WatchlistSidebarWidget.tsx src/components/layout/Sidebar.tsx
git commit -m "feat(watchlist): add sidebar nav item + collapsible widget"
```

---

## Final verification

- [ ] **Step 1: Full build + lint**

Run: `npm run lint && npm run build`
Expected: PASS, zero TypeScript errors, `/watchlist` + `/api/watchlists` + `/api/watchlists/[id]` all in the route list.

- [ ] **Step 2: End-to-end preview pass**

Walk the full flow in the browser: create two watchlists → add tickers to each via the page input, the stock-page button, and a research-board star → switch between lists → remove a ticker → rename a list → delete a list → confirm the sidebar widget tracks the active list and collapses. Confirm prices are live (30s refresh) and rows link to `/stock/[ticker]`.

**Note on reorder:** the data model and `PATCH` accept an arbitrary ticker order, so drag-to-reorder can be added later as a pure UI layer with no backend change. It is intentionally NOT in v1 (display order = insertion order). This is a deliberate scope cut from the spec's "reorder" mention, consistent with the lean-v1 decision.

- [ ] **Step 3: Confirm the old localStorage watchlist is fully gone**

Grep to be sure no references remain:

Run: `grep -rn "lucra:watchlist\"" src/ ; grep -rn "readWatchlist" src/`
Expected: no matches (the widget's `lucra:watchlist-widget-collapsed` key is unrelated and fine).
