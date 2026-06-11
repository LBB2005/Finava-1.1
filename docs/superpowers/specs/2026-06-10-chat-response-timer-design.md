# Chat response timer ("Analyzed in Ns")

**Date:** 2026-06-10
**Status:** Approved design, ready for implementation plan

## Goal

Show how long a chat response takes — a live clock that counts up while the
assistant is thinking, then freezes into a small "receipt" under the finished
message. Mirrors Claude's "thought for Ns" affordance, styled to Finava's
existing Calm Orb language.

## Chosen visual — "Quiet" (option A)

Uses the site's real motion tokens, no new visual language.

**Live state** (while `isStreaming`, before/while the answer arrives):
- The existing Calm Orb breathing navy dot (`--color-accent`, `breathe` +
  `breathe-glow`).
- The shimmer-sweep label (e.g. `Analyzing`) — existing `.shimmer-text`.
- A faint tabular-mono suffix in tertiary text: `· 8s`, updating each second.
  Tabular numerals so the width never jumps.

**Frozen receipt** (under the completed assistant message):
- Hairline clock icon + `Analyzed in 12s` in `--color-muted` / tertiary, small
  (12px), faded in with the existing `fade-in`.

**Format:** `8s` under a minute, `1m 4s` from 60s up. One shared formatter so
live and frozen render identically.

**Scope per mode:**
- Simple / Discover: live suffix sits next to the `TypingIndicator` label.
- Agent / Deep Research: live elapsed sits in the crew-panel header, beside the
  existing `X/Y` progress meter.
- All modes (incl. Backtest): frozen receipt under any assistant message that
  has a recorded duration. Backtest has no live indicator today, so it gets the
  receipt only.

## Backend

Four touch points; one store field, one message field.

1. **`src/stores/chatStore.ts`** — add `streamStartedAt: number | null` to
   `StreamSlice`. Set to `Date.now()` when `setStreaming(convId, true)` is
   called; it remains readable through completion (next send overwrites it).
   Single source of truth the live timer counts from.

2. **`src/types/chat.ts`** — add `durationMs?: number` to `ChatMessage`.

3. **`src/components/chat/ChatEngine.tsx`** — at each completion point
   (`runSimpleChat` ~L206, `runAgentMode` ~L275, discover, `runBacktest`),
   compute `Date.now() - streamStartedAt`, attach `durationMs` to the
   `addMessage` call, and pass it into `saveMessage`. Skip on error/abort paths
   (no receipt for incomplete runs).

4. **Persistence round-trip:**
   - `saveMessage` gains a `durationMs?: number` arg → POST body.
   - `src/app/api/conversations/[id]/messages/route.ts` writes `durationMs`
     (plain number, no JSON wrapping) onto the message doc.
   - `serializeDoc` already returns it on read — GET path unchanged.
   - `toStoreMessages` in `src/hooks/useOpenConversation.ts` maps
     `durationMs: m.durationMs` so reopened conversations show the receipt.

## Frontend

- **`useElapsed(startedAt)` hook** (new) — returns live whole seconds via a 1s
  interval, cleans up on unmount, returns 0 when `startedAt` is null. One place
  owns the ticking.
- **`formatDuration(ms)`** (new, shared util) — `8s` / `1m 4s`. Used by both the
  live suffix and the frozen receipt.
- **`TypingIndicator`** — optional elapsed suffix appended to the label
  (tertiary, mono). Calm Orb dot/avatar unchanged.
- **Crew panel header** (`MessageList` `AgentActivityPanel`) — live elapsed
  beside the `X/Y` meter.
- **`MessageList`** — frozen receipt row under any assistant message with
  `durationMs`.

## Edge cases

- **Resumed streams** (ChatEngine ~L699): no original start, so the timer
  starts fresh at resume — measures the resumed leg only.
- **Errored / aborted**: no `durationMs` written; receipt only on real
  completion.
- **Reduced motion**: shimmer/breathe already disabled via the existing
  `prefers-reduced-motion` block; the digits still tick (count is information,
  not decoration).

## Out of scope (YAGNI)

- Per-agent timings in the crew panel (single overall timer only).
- Sub-second precision / millisecond display.
- Backfilling durations onto historical messages saved before this ships.
