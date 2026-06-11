# Chat Header ⋯ Menu — Design

**Date:** 2026-06-10
**Status:** Approved (grouped variant chosen in visual companion)

## Summary

Add a three-dot (⋯) menu to the right corner of the chat header with six actions,
grouped by separators:

1. **Share, Export** — sharing group
2. **Digest, Save as Playbook** — AI actions, tinted Finava blue (`--color-accent`)
3. **Rename, Archive** — housekeeping; Archive rendered in red (`--color-bear`)

Menu styling matches Finava tokens: white surface, `--color-border` hairline,
12px radius, soft shadow, 13.5px items with 16px stroke icons.

## Behaviors

| Item | Behavior |
|---|---|
| Share | `navigator.share` with the transcript as markdown; clipboard fallback + toast |
| Export | Download transcript as `finava-chat-<title>.md` |
| Digest | `POST /api/conversations/[id]/digest` → Claude distils key insights, tickers, decisions → modal with markdown + copy |
| Save as Playbook | Persist user prompts to `users/{uid}/playbooks` in Firestore; playbooks appear in the composer "+" template menu |
| Rename | Modal input → existing `PATCH /api/conversations/[id]` → sidebar list refreshes |
| Archive | `PATCH` with `archived: true`; archived chats excluded from the sidebar list; toast confirm |

All items are disabled when there is no active conversation with messages.

## Components & routes

- **New** `src/components/chat/ChatHeaderMenu.tsx` — trigger + dropdown + rename/digest modals; reads viewed conversation from `chatStore`.
- **New** `src/app/api/conversations/[id]/digest/route.ts` — auth, usage-capped, metered Claude call (Sonnet), returns `{ digest }`.
- **New** `src/app/api/playbooks/route.ts` — `GET` list / `POST` create (validated, capped).
- **New** `src/lib/conversationExport.ts` — pure `buildConversationMarkdown()` shared by Share/Export, unit-tested.
- **Modified** `ChatHeader.tsx` (mount menu), `conversations/[id]/route.ts` PATCH (accept `archived`), `conversations/route.ts` GET (filter archived), `ChatInput.tsx` (playbooks section in "+" popover).

## Error handling

- Digest/network failures → error toast, modal stays closed.
- Share cancellation (AbortError) is silent.
- Archive/rename are optimistic with SWR revalidate on failure.

## Testing

- Unit: `conversationExport.test.ts` (vitest).
- Manual: preview-verify each menu item end-to-end via dev server.
