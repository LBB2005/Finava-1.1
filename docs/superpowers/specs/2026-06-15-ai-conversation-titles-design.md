# AI-Generated Conversation Titles — Design

**Date:** 2026-06-15
**Status:** Approved, ready for implementation plan

## Problem

Conversations in the sidebar have no real auto-naming. The displayed title is just
the user's first message truncated to 42 characters mid-sentence
(`getTitle()` in `src/components/layout/ConversationList.tsx:31`). The DB `title`
field is only ever populated when the user manually renames a chat (the PATCH
route in `src/app/api/conversations/[id]/route.ts`). The result looks unpolished —
a chat opened with "hey can you tell me whether AAPL is a good buy right now and…"
shows up as exactly that fragment.

We want clean, human-readable titles (e.g. "Apple Stock Buy Analysis"), generated
automatically, the way ChatGPT/Claude do it.

## Decisions (locked)

- **Generation method:** AI-generated label (not heuristic text cleanup).
- **Trigger timing:** After the first assistant reply, so the model can title
  using both the question and the answer.
- **Billing:** Free — the title call is NOT metered against the user's credits.
- **Backfill:** Lazily, on open. Existing untitled chats get a title generated
  when the user next opens them. No bulk migration job.
- **Manual rename always wins:** generation is skipped whenever a `title` already
  exists.

## Architecture

Four pieces, with a single shared helper so both trigger paths run identical logic.

### 1. Titling agent in the LLM layer (`src/lib/llm.ts`)

- Add a new `AgentKey`: `titleConversation`, routed to **Gemini Flash-Lite**
  (`GEMINI_FLASH_LITE`) when routing is on, falling back to Haiku when routing is
  off (add it to the `HAIKU_AGENTS` set so the fallback map resolves it to Haiku).
- Add an optional `meter?: boolean` field to `GenerateOptions`, defaulting to
  `true`. In `generate()`, only call `recordUsage(...)` when `meter !== false`.
  The title call passes `meter: false`. This is the entire "free" mechanism — no
  changes to `src/lib/usage.ts`.
- Classify `titleConversation` as a non-reasoning, short-output call: add it to
  `TIER_A` (or apply an equivalent inline cap) so `reasoning` is dropped and
  `maxTokens` is clamped low. A `maxTokens` of ~30 is plenty for a 3–6 word title.

### 2. Shared helper (`src/lib/conversationTitle.ts`, new file)

`export async function generateConversationTitle(userId: string, convId: string): Promise<void>`

Behavior (idempotent and self-guarding):

1. Load the conversation doc. If it doesn't exist, or `title` is already a
   non-empty string, return immediately (no-op).
2. Load the conversation's messages. If there isn't at least one `user` message
   AND at least one `assistant` message, return (the exchange isn't complete yet).
3. Build the prompt from the **first user message** and the **first assistant
   reply**. Truncate each to a sane length (e.g. first ~500 chars of the user
   message, first ~500 chars of the assistant reply) to keep input small.
4. Call `generate({ agent: "titleConversation", meter: false, system, prompt, maxTokens })`.
   System prompt enforces the style:
   > "Write a concise 3–6 word title for this conversation in Title Case. No
   > quotation marks, no trailing punctuation, no preamble — output only the title."
5. Sanitize the result: trim; strip wrapping quotes/backticks; collapse internal
   whitespace; strip trailing punctuation; clamp to a hard max (~60 chars). If the
   sanitized result is empty, return without writing (the raw-prompt fallback
   stays in place).
6. Write `{ title }` to the conversation doc.

The helper throws on no internal errors that should bubble — callers invoke it
fire-and-forget and swallow/log failures, so a titling failure never breaks a
chat. (A failed title just means the raw-prompt fallback keeps showing until the
next trigger.)

### 3. Trigger A — new chats, after first reply

In the messages POST route (`src/app/api/conversations/[id]/messages/route.ts`),
after the assistant message is persisted and `updatedAt` is bumped:

- If the persisted message's `role === "assistant"`, fire
  `void generateConversationTitle(userId, id)` **fire-and-forget** — do not await
  it before returning the 201 response, so it never adds latency to the message
  write.
- The helper's own guards (title-already-set, exchange-incomplete) ensure it
  effectively only does work on the first assistant message of a conversation;
  later assistant messages are cheap no-ops (one doc read).

### 4. Trigger B — backfill on open

- New endpoint: `POST /api/conversations/[id]/title`. It verifies the
  conversation belongs to `userId`, then calls `generateConversationTitle(userId, id)`
  and returns `{ ok: true }` (or the resulting title). Idempotent thanks to the
  helper's guards.
- The open-conversation path (`src/hooks/useOpenConversation.ts`, used by
  `ConversationList` / sidebar) already fetches the full conversation in the
  background after opening. In that same background block, once the full
  conversation lands, if `full.title` is empty AND the full transcript has at
  least one `user` and one `assistant` message, fire
  `POST /api/conversations/[id]/title` (fire-and-forget), then revalidate the
  `/api/conversations` SWR cache (via the imported `mutate`) so the new title
  appears. Using the full fetched conversation (not the list preview) ensures the
  title/exchange check is based on accurate data.

### 5. Sidebar — no changes needed

`ConversationList` already polls `/api/conversations` every 30s and revalidates
on focus. `getTitle()` is unchanged: `conv.title` wins; the raw-prompt slice
stays as the fallback shown while a title is still being generated. Manual rename
is untouched and always wins because the helper bails when a title exists.

## Data flow

```
New chat:
  user sends → assistant streams → ChatEngine saveMessage(assistant)
    → POST /conversations/:id/messages persists, returns 201
    → (fire-and-forget) generateConversationTitle(userId, id)
        → reads first user msg + first assistant reply
        → generate(titleConversation, meter:false) → sanitize → write title
    → sidebar SWR refresh shows clean title

Old untitled chat:
  user opens chat → useOpenConversation sees no title + has exchange
    → POST /conversations/:id/title → generateConversationTitle(...)
    → mutate('/api/conversations') → clean title appears
```

## Error handling

- Title generation is always fire-and-forget; failures are caught and logged,
  never surfaced to the user and never block a message write or a chat open.
- On failure or empty result, no `title` is written, so the raw-prompt fallback
  continues to display and the next trigger can retry.
- The helper is fully idempotent; concurrent triggers (e.g. messages-route fire
  and a near-simultaneous open) at worst do a redundant generation — acceptable,
  and the title write is last-writer-wins on an identical-style result.

## Testing

- Unit-test the **sanitizer** in isolation: quotes/backticks stripped, trailing
  punctuation removed, whitespace collapsed, length clamped, empty-in → empty-out.
- Unit-test `generateConversationTitle` guards with a mocked `generate` and mocked
  Firestore: no-op when title exists, no-op when exchange incomplete, writes a
  sanitized title on the happy path, no write on empty/failed generation.
- Verify `meter: false` skips `recordUsage` (mock `recordUsage`, assert not
  called for the title agent; assert it IS called for a normal agent).

## Out of scope (YAGNI)

- No bulk backfill migration of all existing chats.
- No re-titling when a conversation's topic drifts later.
- No user-facing setting to toggle auto-titling on/off.
- No streaming/optimistic title in the UI beyond the existing SWR refresh.
