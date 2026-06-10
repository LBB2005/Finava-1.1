# Scoped Corner-Chat Popover + Research-Style Stock Bar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the docked `ChatSidePanel` with a minimal top-right chat icon that opens a launcher popover scoped to the current page's chats, and restyle the stock page top bar to the Research command-bar look.

**Architecture:** Conversations gain a `context` string (`research` / `watchlist` / `portfolio` / `stock:<TICKER>` / `null`). A shared `ChatContextButton` reads the SWR-cached conversation list, filters by context client-side, and opens chats via a shared `useOpenConversation` hook. New chats are tagged via a `pendingContext` field on the chat store, consumed when the conversation is created. The global Recent list is unchanged.

**Tech Stack:** Next.js (App Router), React, Zustand, SWR, Firestore (admin SDK), Vitest, TypeScript.

**Design spec:** `docs/superpowers/specs/2026-06-09-scoped-chat-popover-design.md`

---

## File Structure

**Create:**
- `src/lib/chatContext.ts` — context derivation + labels (pure, tested)
- `src/lib/chatContext.test.ts` — unit tests
- `src/hooks/useOpenConversation.ts` — shared "load conversation into store + open /chat"
- `src/components/chat/ChatContextButton.tsx` — the icon + launcher popover

**Modify:**
- `src/stores/chatStore.ts` — add `pendingContext`
- `src/app/api/conversations/route.ts` — POST stores `context`
- `src/components/chat/ChatContainer.tsx` — `ensureConversation` tags with `pendingContext`
- `src/components/layout/ConversationList.tsx` — `Conversation` type gains `context`; delegate load to the hook; drop unused `onSelect`
- `src/components/chat/GlobalComposer.tsx` — set `pendingContext`; remove panel-width insets
- `src/app/research/page.tsx` — mount button, remove rail + shell
- `src/app/stock/[ticker]/page.tsx` — restyle tab bar + mount button
- `src/app/watchlist/page.tsx` — remove rail + shell
- `src/components/watchlist/WatchlistSplitRail.tsx` — mount button in header
- `src/app/portfolio/page.tsx` — mount button, remove rail + shell

**Delete:**
- `src/components/chat/ChatSidePanel.tsx`
- `src/stores/chatPanelStore.ts`

---

## Task 1: `chatContext` helper (TDD)

**Files:**
- Create: `src/lib/chatContext.ts`
- Test: `src/lib/chatContext.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/chatContext.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { contextFromPath, contextLabel } from "./chatContext";

describe("contextFromPath", () => {
  it("maps page routes", () => {
    expect(contextFromPath("/research")).toBe("research");
    expect(contextFromPath("/watchlist")).toBe("watchlist");
    expect(contextFromPath("/portfolio")).toBe("portfolio");
  });
  it("maps a stock route to stock:<TICKER> uppercased", () => {
    expect(contextFromPath("/stock/aapl")).toBe("stock:AAPL");
    expect(contextFromPath("/stock/AAPL", "AAPL")).toBe("stock:AAPL");
  });
  it("returns null for unrelated routes", () => {
    expect(contextFromPath("/chat")).toBeNull();
    expect(contextFromPath("/settings")).toBeNull();
    expect(contextFromPath("/stock/")).toBeNull();
  });
});

describe("contextLabel", () => {
  it("uppercases page contexts", () => {
    expect(contextLabel("research")).toBe("RESEARCH");
    expect(contextLabel("portfolio")).toBe("PORTFOLIO");
  });
  it("strips the stock: prefix", () => {
    expect(contextLabel("stock:AAPL")).toBe("AAPL");
  });
  it("labels null as ALL", () => {
    expect(contextLabel(null)).toBe("ALL");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/chatContext.test.ts`
Expected: FAIL — cannot resolve `./chatContext`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/chatContext.ts`:

```ts
/** Which page a chat belongs to. `stock:<TICKER>` for a specific stock,
 *  or `null` for chats with no page context (legacy, or started on /chat). */
export type ChatContext = string | null;

/** Derive the chat context from the current route. Stock pages carry the
 *  ticker (pass it explicitly where available, else it's read from the path). */
export function contextFromPath(pathname: string, ticker?: string): ChatContext {
  if (pathname.startsWith("/research")) return "research";
  if (pathname.startsWith("/watchlist")) return "watchlist";
  if (pathname.startsWith("/portfolio")) return "portfolio";
  if (pathname.startsWith("/stock/")) {
    const t = (ticker ?? pathname.split("/")[2] ?? "").toUpperCase();
    return t ? `stock:${t}` : null;
  }
  return null;
}

/** Uppercase display label for the popover eyebrow. */
export function contextLabel(ctx: ChatContext): string {
  if (!ctx) return "ALL";
  if (ctx.startsWith("stock:")) return ctx.slice(6).toUpperCase();
  return ctx.toUpperCase();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/chatContext.test.ts`
Expected: PASS (both suites green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chatContext.ts src/lib/chatContext.test.ts
git commit -m "feat(chat): add chatContext route helper + tests"
```

---

## Task 2: `pendingContext` on the chat store

**Files:**
- Modify: `src/stores/chatStore.ts`

- [ ] **Step 1: Add the type import**

At the top of `src/stores/chatStore.ts`, alongside the existing type import, add `ChatContext`:

```ts
import type { ChatMessage, ChatMode, AgentStep } from "@/types/chat";
import type { ChatContext } from "@/lib/chatContext";
```

- [ ] **Step 2: Extend the interface**

In `interface ChatState`, add these two members (place them next to `pendingMessage`):

```ts
  /** Context to stamp on the NEXT conversation created (set by the popover
   *  "new chat" and by GlobalComposer). Consumed + cleared at create time. */
  pendingContext: ChatContext;
  setPendingContext: (ctx: ChatContext) => void;
```

- [ ] **Step 3: Add initial value + setter**

In the `create(...)` body, add the initial value near `pendingMessage: "",`:

```ts
  pendingContext: null,
```

and the setter near `setPendingMessage`:

```ts
  setPendingContext: (ctx) => set({ pendingContext: ctx }),
```

- [ ] **Step 4: Clear it on reset**

In the `reset: () => set({ ... })` object, add:

```ts
      pendingContext: null,
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from `chatStore.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/stores/chatStore.ts
git commit -m "feat(chat): add pendingContext to chat store"
```

---

## Task 3: Conversations API stores `context`

**Files:**
- Modify: `src/app/api/conversations/route.ts`

- [ ] **Step 1: Read + store context in POST**

In `src/app/api/conversations/route.ts`, replace the body of `POST` (the `try` block's destructure + `add`) so it reads and persists `context`:

```ts
    const body = await req.json();
    const { title, context } = body;
    const now = new Date().toISOString();
    const docRef = await convsCol(userId).add({
      userId,
      title: title ?? null,
      context: context ?? null,
      createdAt: now,
      updatedAt: now,
    });
```

(Leave the rest of `POST` and all of `GET` unchanged — `GET` still returns every conversation, and `serializeDoc` passes `context` through automatically.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/conversations/route.ts
git commit -m "feat(api): persist context on new conversations"
```

---

## Task 4: `ensureConversation` tags new chats

**Files:**
- Modify: `src/components/chat/ChatContainer.tsx:146-156`

- [ ] **Step 1: Pass pendingContext when creating**

Replace the `ensureConversation` function (currently lines 146-156) with:

```ts
  async function ensureConversation(): Promise<string> {
    if (conversationId) return conversationId;
    const { pendingContext, setPendingContext } = useChatStore.getState();
    const res = await authFetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: null, context: pendingContext }),
    });
    const data = await res.json();
    setConversationId(data.id);
    if (pendingContext) setPendingContext(null);
    return data.id;
  }
```

(`useChatStore` is already imported in this file. No other change.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ChatContainer.tsx
git commit -m "feat(chat): tag newly created conversation with pendingContext"
```

---

## Task 5: `useOpenConversation` hook + ConversationList refactor

**Files:**
- Create: `src/hooks/useOpenConversation.ts`
- Modify: `src/components/layout/ConversationList.tsx`

- [ ] **Step 1: Create the shared hook**

Create `src/hooks/useOpenConversation.ts`:

```ts
"use client";
import { useRouter } from "next/navigation";
import { useChatStore } from "@/stores/chatStore";
import type { ChatMode, AgentStep } from "@/types/chat";
import type { Conversation } from "@/components/layout/ConversationList";

/** Load a stored conversation into the chat store and (by default) open /chat.
 *  Shared by ConversationList and ChatContextButton so the store-reconciliation
 *  logic lives in exactly one place. */
export function useOpenConversation() {
  const router = useRouter();
  const {
    setMessages, setConversationId, setStreaming,
    clearStreamingContent, clearAgentSteps,
  } = useChatStore();

  return function openConversation(conv: Conversation, opts?: { navigate?: boolean }) {
    const { streamingConversationId } = useChatStore.getState();
    setMessages(conv.messages.map((m) => {
      let agentTrace: AgentStep[] | undefined;
      if (m.agentTrace) {
        try { agentTrace = JSON.parse(m.agentTrace); } catch { /* malformed trace — skip */ }
      }
      return {
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        mode: (m.mode as ChatMode) || "agent",
        createdAt: m.createdAt,
        agentTrace,
      };
    }));
    setConversationId(conv.id);

    if (conv.id === streamingConversationId) {
      setStreaming(true);
    } else {
      setStreaming(false);
      if (!streamingConversationId) {
        clearStreamingContent();
        clearAgentSteps();
      }
    }

    if (opts?.navigate !== false) router.push("/chat");
  };
}
```

- [ ] **Step 2: Add `context` to the Conversation type**

In `src/components/layout/ConversationList.tsx`, extend the `Conversation` interface (around line 12) to carry the context field:

```ts
export interface Conversation {
  id: string; title: string | null; createdAt: string; updatedAt: string;
  context?: string | null;
  messages: ConvMessage[];
}
```

- [ ] **Step 3: Import the hook**

Add near the other imports in `ConversationList.tsx`:

```ts
import { useOpenConversation } from "@/hooks/useOpenConversation";
```

- [ ] **Step 4: Drop the `onSelect` prop and use the hook**

Replace the component signature + the `useChatStore` destructure + the whole `loadConversation` function. Change the signature (line 47-51) from the `onSelect` version to:

```ts
export default function ConversationList() {
```

Change the store destructure (line 61) to only what this component still uses directly:

```ts
  const { conversationId, streamingConversationId } = useChatStore();
  const openConversation = useOpenConversation();
```

Replace the entire `loadConversation` function (lines 63-94) with:

```ts
  function loadConversation(conv: Conversation) {
    openConversation(conv);
  }
```

(All `ConvRow` / pin / delete / grouping code stays as-is. `deleteConversation` still calls `useChatStore.getState().reset()` which is unaffected.)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. (If `tsc` flags an unused import in `ConversationList.tsx`, remove only the now-unused names from the `useChatStore` destructure — `setConversationId`, `setMessages`, `setStreaming`, `clearStreamingContent`, `clearAgentSteps` are now in the hook.)

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useOpenConversation.ts src/components/layout/ConversationList.tsx
git commit -m "refactor(chat): extract useOpenConversation; add context to Conversation"
```

---

## Task 6: `ChatContextButton` component

**Files:**
- Create: `src/components/chat/ChatContextButton.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/chat/ChatContextButton.tsx`:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { authFetcher } from "@/lib/authFetch";
import { useChatStore } from "@/stores/chatStore";
import { useOpenConversation } from "@/hooks/useOpenConversation";
import { contextLabel, type ChatContext } from "@/lib/chatContext";
import type { Conversation } from "@/components/layout/ConversationList";

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "now";
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function convTitle(conv: Conversation): string {
  if (conv.title) return conv.title;
  const firstUser = conv.messages.find((m) => m.role === "user");
  if (firstUser) return firstUser.content.slice(0, 40) + (firstUser.content.length > 40 ? "…" : "");
  return "New conversation";
}

/** Minimal corner chat icon + launcher popover, scoped to one page context.
 *  Lists only that context's chats; selecting one (or "new chat") opens /chat. */
export default function ChatContextButton({ context }: { context: ChatContext }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const openConversation = useOpenConversation();
  const { reset, setPendingContext } = useChatStore();

  const { data } = useSWR<Conversation[]>("/api/conversations", authFetcher, {
    refreshInterval: 30_000, revalidateOnFocus: true,
  });
  const scoped = (Array.isArray(data) ? data : []).filter((c) => c.context === context);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function newChat() {
    setPendingContext(context);
    reset();
    setOpen(false);
    router.push("/chat");
  }

  function pick(conv: Conversation) {
    setOpen(false);
    openConversation(conv);
  }

  const label = contextLabel(context);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Chats"
        aria-label="Chats"
        aria-expanded={open}
        className="w-7 h-7 rounded-[7px] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-sidebar-hover)] hover:text-[var(--color-text)] transition-colors duration-100"
        style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>

      {open && (
        <div
          className="fade-in"
          style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 50,
            width: 260, background: "var(--color-surface)", border: "1px solid var(--color-border)",
            borderRadius: 12, boxShadow: "var(--shadow-pop)", overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", padding: "9px 11px", borderBottom: "1px solid var(--color-border)" }}>
            <span className="mono" style={{ flex: 1, fontSize: 9, fontWeight: 700, letterSpacing: "0.13em", color: "var(--color-muted)" }}>
              CHATS · {label}
            </span>
            <button
              onClick={newChat}
              title="New chat"
              aria-label="New chat"
              className="w-[18px] h-[18px] rounded-[5px] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-sidebar-hover)] hover:text-[var(--color-text)] transition-colors duration-100"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>

          <div style={{ maxHeight: 300, overflowY: "auto", padding: "4px 0" }}>
            {scoped.length === 0 ? (
              <p style={{ padding: "14px 12px", fontSize: 11.5, color: "var(--color-muted)", textAlign: "center" }}>
                No {label.toLowerCase()} chats yet.
              </p>
            ) : (
              scoped.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => pick(conv)}
                  className="w-full text-left flex items-center gap-2 hover:bg-[var(--color-sidebar-hover)] transition-colors duration-100"
                  style={{ padding: "8px 11px" }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--color-accent)", flexShrink: 0 }} />
                  <span className="flex-1 truncate" style={{ fontSize: 11.5, color: "var(--color-text)" }}>{convTitle(conv)}</span>
                  <span className="mono" style={{ fontSize: 9, color: "var(--color-muted)", flexShrink: 0 }}>{relTime(conv.updatedAt)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ChatContextButton.tsx
git commit -m "feat(chat): add ChatContextButton launcher popover"
```

---

## Task 7: Mount on Research bar + remove the rail

**Files:**
- Modify: `src/app/research/page.tsx`

- [ ] **Step 1: Swap the import**

Replace the `ChatSidePanel` import line (line 14) with:

```ts
import ChatContextButton from "@/components/chat/ChatContextButton";
```

- [ ] **Step 2: Add the button to the bar's right cluster**

Inside `<div className="b-bar-right">`, after the `<span className="mono b-asof">{asOfLabel}</span>` line, add:

```tsx
          <ChatContextButton context="research" />
```

- [ ] **Step 3: Unwrap the rail shell**

The current return wraps the page in a `flex h-full overflow-hidden` shell to host the rail. Replace the opening:

```tsx
  return (
    <div className="flex h-full overflow-hidden">
    <div className="research-root term vB1 flex-1 min-w-0 flex flex-col h-full overflow-hidden">
```

with a single root:

```tsx
  return (
    <div className="research-root term vB1 flex flex-col h-full overflow-hidden">
```

and at the end of the JSX, replace the closing:

```tsx
    </div>
    <ChatSidePanel />
    </div>
  );
```

with:

```tsx
    </div>
  );
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors; no remaining reference to `ChatSidePanel` in this file.

- [ ] **Step 5: Commit**

```bash
git add src/app/research/page.tsx
git commit -m "feat(research): corner chat popover, remove docked rail"
```

---

## Task 8: Restyle the stock top bar + mount the button

**Files:**
- Modify: `src/app/stock/[ticker]/page.tsx`

- [ ] **Step 1: Import the button**

Add to the imports at the top of `src/app/stock/[ticker]/page.tsx`:

```ts
import ChatContextButton from "@/components/chat/ChatContextButton";
```

- [ ] **Step 2: Compute the day change near livePrice**

Find `const livePrice = quoteMap.get(ticker)?.price ?? bundle.quote?.price ?? null;` (around line 78) and add directly beneath it:

```ts
  const chg = quoteMap.get(ticker)?.changePct ?? null;
```

- [ ] **Step 3: Replace the sticky tab bar**

Replace the entire sticky tab-bar block (the `<div style={{ display: "flex", gap: 6, padding: "12px 36px", ... position: "sticky", top: 0, zIndex: 5 }}>` … `</div>` that maps `TABS` with `.tbtn`, currently lines 91-109) with the research-style bar:

```tsx
      {/* Sticky command bar — research b-bar vocabulary (mast + pill lenses) */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", rowGap: 12,
          padding: "12px 36px",
          borderTop: "1px solid var(--color-border)",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-surface)",
          position: "sticky", top: 0, zIndex: 5,
        }}
      >
        <div className="b-bar-mast">
          <span className="b-bar-title">{ticker}</span>
          <span className="b-bar-eyebrow">
            {(bundle.profile?.name ?? ticker).toUpperCase()}
            {bundle.profile?.exchange ? ` · ${bundle.profile.exchange}` : ""}
          </span>
        </div>

        <div className="b-lenses b-lenses-pill">
          {TABS.map((t) => (
            <button key={t} className={"b-lens" + (tab === t ? " on" : "")} onClick={() => setTab(t)}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="b-bar-right">
          {livePrice != null && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.15 }}>
              <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text)" }}>
                ${livePrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              {chg != null && (
                <span className="mono" style={{ fontSize: 9.5, fontWeight: 600, color: chg >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}>
                  {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
                </span>
              )}
            </div>
          )}
          <span style={{ width: 1, height: 22, background: "var(--color-border)" }} />
          <ChatContextButton context={`stock:${ticker}`} />
        </div>
      </div>
```

(The page root already carries `className="research-root stock-page ..."`, so the `b-bar-mast` / `b-lenses-pill` / `b-lens` / `b-bar-right` styles — which are scoped under `.research-root` in `globals.css` — apply here.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/stock/[ticker]/page.tsx"
git commit -m "feat(stock): research-style command bar + scoped chat popover"
```

---

## Task 9: Watchlist — mount in rail header, remove the rail panel

**Files:**
- Modify: `src/components/watchlist/WatchlistSplitRail.tsx`
- Modify: `src/app/watchlist/page.tsx`

- [ ] **Step 1: Import the button in the rail**

Add to the imports at the top of `src/components/watchlist/WatchlistSplitRail.tsx`:

```ts
import ChatContextButton from "@/components/chat/ChatContextButton";
```

- [ ] **Step 2: Mount it in the header's right controls**

In `WatchlistSplitRail`'s main return, find the "Right controls" container (`<div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>`, around line 527). Add the button as the **first** child of that div:

```tsx
          <ChatContextButton context="watchlist" />
```

- [ ] **Step 3: Strip the rail + shell from the page**

Replace the entire contents of `src/app/watchlist/page.tsx` with:

```tsx
import WatchlistSplitRail from "@/components/watchlist/WatchlistSplitRail";

export default function WatchlistPage() {
  return <WatchlistSplitRail />;
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors; no remaining `ChatSidePanel` reference in either file.

- [ ] **Step 5: Commit**

```bash
git add src/components/watchlist/WatchlistSplitRail.tsx src/app/watchlist/page.tsx
git commit -m "feat(watchlist): corner chat popover, remove docked rail"
```

---

## Task 10: Portfolio — mount in header, remove the rail

**Files:**
- Modify: `src/app/portfolio/page.tsx`

- [ ] **Step 1: Swap the import**

Replace the `ChatSidePanel` import (line 10) with:

```ts
import ChatContextButton from "@/components/chat/ChatContextButton";
```

- [ ] **Step 2: Mount in the topbar right cluster**

In the topbar, find `<div className="flex items-center" style={{ gap: 8, marginLeft: "auto" }}>` (line 441). Add the button as the **first** child of that div:

```tsx
          <ChatContextButton context="portfolio" />
```

- [ ] **Step 3: Unwrap the rail shell**

Replace the opening of the return (lines 424-426):

```tsx
  return (
    <div className="flex h-full overflow-hidden">
    <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden" style={{ background: "var(--color-bg)" }}>
```

with a single root:

```tsx
  return (
    <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden" style={{ background: "var(--color-bg)" }}>
```

Then at the end (lines 814-816), replace:

```tsx
    </div>
    <ChatSidePanel />
    </div>
  );
```

with:

```tsx
    </div>
  );
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors; no remaining `ChatSidePanel` reference.

- [ ] **Step 5: Commit**

```bash
git add src/app/portfolio/page.tsx
git commit -m "feat(portfolio): corner chat popover, remove docked rail"
```

---

## Task 11: GlobalComposer — set context, drop panel insets

**Files:**
- Modify: `src/components/chat/GlobalComposer.tsx`

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `src/components/chat/GlobalComposer.tsx` with:

```tsx
"use client";
import { usePathname, useRouter } from "next/navigation";
import { useChatStore } from "@/stores/chatStore";
import { useWatchlists } from "@/hooks/useWatchlists";
import { useWatchlistStore } from "@/stores/watchlistStore";
import { contextFromPath } from "@/lib/chatContext";
import ChatInput from "./ChatInput";

// One persistent composer for the whole app. Lives in the app shell, outside the
// route-keyed <main>, so it never unmounts as you move between pages. On /chat it
// feeds the live conversation via pendingMessage; elsewhere it primes the page
// context and routes to /chat so the new chat is tagged where it started.
export default function GlobalComposer() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { mode, setMode, isStreaming, setPendingMessage, setPendingContext } = useChatStore();
  const { watchlists } = useWatchlists();
  const { activeId } = useWatchlistStore();

  const isChat = pathname.startsWith("/chat");

  function handleSend(text: string) {
    const val = text.trim();
    if (!val) return;
    let msg = val;
    if (pathname.startsWith("/watchlist")) {
      const active = watchlists.find((w) => w.id === activeId) ?? watchlists[0];
      msg = `Re: my ${active?.name ?? "watchlist"} watchlist — ${val}`;
    }
    setPendingContext(contextFromPath(pathname));
    setPendingMessage(msg);
    if (!isChat) router.push("/chat");
  }

  return (
    <div className="absolute left-0 right-0 z-30 pointer-events-none" style={{ bottom: 6 }}>
      <ChatInput
        floating
        onSend={handleSend}
        disabled={isChat && isStreaming}
        mode={mode}
        onModeChange={setMode}
        autoFocus={false}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors; no remaining `useChatPanelStore` import here.

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/GlobalComposer.tsx
git commit -m "feat(chat): GlobalComposer primes page context, drop panel insets"
```

---

## Task 12: Delete the old rail + final build verification

**Files:**
- Delete: `src/components/chat/ChatSidePanel.tsx`
- Delete: `src/stores/chatPanelStore.ts`

- [ ] **Step 1: Confirm nothing else imports them**

Run: `grep -rn "ChatSidePanel\|chatPanelStore\|CHAT_PANEL_WIDTH\|CHAT_PANEL_RAIL" src --include="*.ts" --include="*.tsx"`
Expected: no matches. (If any remain, fix that file before deleting.)

- [ ] **Step 2: Delete the files**

```bash
git rm src/components/chat/ChatSidePanel.tsx src/stores/chatPanelStore.ts
```

- [ ] **Step 3: Full typecheck + tests + build**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx vitest run`
Expected: all suites pass (including `src/lib/chatContext.test.ts`).

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual verification (dev preview)**

Start the dev server and confirm:
- Corner chat icon renders top-right on Research, Watchlist, Portfolio, and a stock page; no leftover gap where the rail sat.
- Clicking the icon opens the popover; click-outside and Esc both close it.
- On Portfolio, start a new chat from the popover `+` (or the bottom composer) → it appears in the **Portfolio** popover and in Recent on `/chat`, but **not** in the Research popover.
- On `/stock/AAPL`, a new chat appears only under AAPL's popover.
- Stock bar: pill lenses switch tabs; ticker/company mast + price + change render.
- Bottom composer still sends and routes to `/chat`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(chat): remove docked ChatSidePanel + chatPanelStore"
```

---

## Self-Review Notes

- **Spec coverage:** context model (T1–T4), client-side scoped filtering (T6), `ChatContextButton` launcher (T6), shared open flow (T5), per-page mounts (T7–T10), stock bar restyle (T8), GlobalComposer context + inset removal (T11), rail removal (T12). All spec sections map to a task.
- **Type consistency:** `ChatContext` defined in T1 and imported in T2/T6/T11; `Conversation.context` added in T5 and read in T6; `pendingContext`/`setPendingContext` defined T2, consumed T4/T6/T11; `changePct` matches `Quote` (T8).
- **Legacy chats** (`context: null`) intentionally never match a scoped filter — by design, per spec.
