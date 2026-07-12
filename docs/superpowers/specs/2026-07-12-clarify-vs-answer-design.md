# Clarify-vs-Answer Logic — Design

**Date:** 2026-07-12
**Status:** Approved for planning

## Problem

A user asked *"What are my biggest position risks right now?"* and Finava replied *"To analyze your position risks, I'll need to know your holdings. Could you share your portfolio…"* — even though the app already has the user's portfolio. The chat should just use it.

More broadly: the chat asks clarifying questions when it should answer, and its notion of *when* to ask a follow-up is too eager and lives in the wrong layer.

### Root cause

The Auto-mode router (`/api/classify`) is **not** the culprit — its `needsClarify` is already biased hard toward false and routes portfolio questions to the agent crew.

The failure is **downstream, in the answering models**, and has two parts:

1. **No clarify policy reaches the writers.** The chat route and the CEO agent have no instruction to prefer answering over asking. When their portfolio context is empty they improvise *"please paste your holdings."*
   - Chat route fallback: `"The user has no portfolio holdings yet."` — [`src/app/api/chat/route.ts:41`](../../../src/app/api/chat/route.ts)
   - CEO agent fallback: same string — [`src/agents/ceo.ts:267`](../../../src/agents/ceo.ts)

2. **Loading looks like empty.** `buildPortfolioContext` returns `""` for *both* "still loading" and "genuinely empty" ([`src/components/chat/ChatContainer.tsx:44`](../../../src/components/chat/ChatContainer.tsx)). A message sent before the portfolio SWR resolves ships an empty context, so the router loses its "user has a portfolio" signal and the model falls back to the ask-for-holdings string.

## Goals

- Portfolio-scoped questions ("my positions / holdings / risk") always use the user's holdings and **never** ask the user to paste them.
- When the portfolio is genuinely empty/disconnected, reply with a one-tap nudge to connect a brokerage — not an interrogation.
- Generalize the clarify-vs-answer decision so the chat **defaults to answering** and only asks a follow-up in a few well-defined cases.
- Seamless: the loading race is invisible to the user.

## Non-goals

- No router rewrite (its `needsClarify` logic is already correct).
- No new UI.
- Discover mode is untouched — it deliberately strips the portfolio ([`src/agents/ceo.ts:261`](../../../src/agents/ceo.ts)) because picks must be universe-generic.

## The clarify-vs-answer policy

Default to **answering**. Ask a follow-up **only** when one of these holds:

1. **Ambiguous subject** — the model can't tell *what* the user means (which stock, which list) and page/portfolio/history context can't resolve it.
2. **Required input missing** — a genuinely required input is absent and *any* answer would be materially misleading without it.
3. **High stakes** — a wrong interpretation would matter.

Otherwise:

- If a **non-critical preference** is missing (time horizon, risk tolerance, sector focus), pick a sensible default, **state it in one short clause** ("Assuming a long-term horizon…"), and answer.
- **Never** ask the user to paste, list, or re-supply data the app already holds (portfolio holdings, the viewed stock, watchlist names). Use what's in context; if it's absent, follow the empty-data guidance.
- When you do ask, ask **one** short question.

## Design

### 1. Shared constant: `CLARIFY_POLICY`

New file `src/lib/clarify.ts`, sibling of `src/lib/dataAccuracy.ts`, following the identical "plain string spliced into prompts" pattern.

- `CLARIFY_POLICY` — the prose policy above, under a `## Clarification — Prefer Answering` header. Kept tight (it is spliced into several prompts; length is token cost).

Wired into (mirroring how `DATA_ACCURACY_RULE` is wired):

- **Chat route** — appended to the system prompt in [`src/app/api/chat/route.ts`](../../../src/app/api/chat/route.ts), alongside `DATA_ACCURACY_RULE`.
- **CEO agent** — appended to the CEO system prompt in [`src/agents/ceo.ts`](../../../src/agents/ceo.ts).
- **Sub-agents** — added to `getSkillsPrompt` in [`src/agents/skills/index.ts`](../../../src/agents/skills/index.ts) next to `DATA_ACCURACY_RULE`, so no sub-agent invents an ask-the-user detour.
- **Classify router** — a one-line condensed echo in the `SYSTEM` string of [`src/app/api/classify/route.ts`](../../../src/app/api/classify/route.ts), reinforcing the three-case trigger (the router already mostly does this; this keeps the policy in one canonical place).

### 2. Seamless portfolio loading (kill the race)

`usePortfolio` already exposes `isLoading` ([`src/hooks/usePortfolio.ts:18`](../../../src/hooks/usePortfolio.ts)).

In the `ChatEngine` send path, before building `portfolioContext`, **await portfolio readiness**: resolve the moment `!isLoading`, with a **2 s cap** as a safety ceiling. Because `usePortfolio` is mounted app-wide in the shell ([`src/components/chat/ChatEngine.tsx:46`](../../../src/components/chat/ChatEngine.tsx)), the fetch is nearly always already resolved by the time a message is sent, so the real-world wait ≈ 0. The optimistic user bubble still renders instantly; only the assistant's reply waits.

- Implementation: a small `awaitPortfolioReady()` helper backed by an `isLoading` ref (kept fresh in `ctxRef`, like `holdings`/`cashBalance` today), polling until `!isLoading` or the 2 s cap.
- After the gate, an empty `portfolioContext` honestly means "empty," not "loading."

Applies to Simple, Agent, and Auto sends. Discover is unaffected (it never uses the portfolio).

### 3. Smart empty-portfolio reply

Extract the fallback string in both answering routes into one pure helper:

```
// src/lib/portfolioPrompt.ts
export function portfolioPromptBlock(portfolioContext: string): string
```

- **Ready** (non-empty context) → `## User's Current Portfolio\n<context>` (unchanged behavior).
- **Empty** (empty context) → an instruction block:
  > The user has no holdings and no brokerage connected. If they ask about *their* portfolio, positions, or risk, tell them to connect a brokerage or add holdings on the Portfolio page — do NOT ask them to paste or list holdings.

Both [`src/app/api/chat/route.ts:41`](../../../src/app/api/chat/route.ts) and [`src/agents/ceo.ts:267`](../../../src/agents/ceo.ts) call this helper instead of their inline ternary. The CEO keeps its existing Discover branch (`portfolioForPrompt = discover ? "" : portfolioContext`) and passes the resolved value in — Discover still yields the plain empty string, unchanged.

## Testing (logic-layer vitest, matching the repo's coverage-scoped setup)

- `portfolioPromptBlock`: empty input → nudge text present, no "paste"/"share your holdings" ask; non-empty input → wraps the context under the portfolio header.
- `CLARIFY_POLICY`: exported, non-empty, contains the three trigger cases (guards against accidental deletion during prompt edits).
- `classify` route: a portfolio-scoped prompt with `portfolioContext` present → `intent: "agent"`, `needsClarify: false` (extend existing classify tests if present).
- `awaitPortfolioReady`: resolves immediately when not loading; resolves at the cap when loading never clears (fake timers).

## Files touched

- **New:** `src/lib/clarify.ts`, `src/lib/portfolioPrompt.ts` (+ their tests).
- **Edited:** `src/app/api/chat/route.ts`, `src/agents/ceo.ts`, `src/agents/skills/index.ts`, `src/app/api/classify/route.ts`, `src/components/chat/ChatEngine.tsx`.

## Risks & mitigations

- **Over-suppressing legitimate clarifications** — the policy keeps three explicit escape hatches (ambiguous subject / required input / high stakes), so genuinely under-specified requests still get one question.
- **2 s gate adding latency** — capped and short-circuits on `!isLoading`; near-zero in practice because the SWR is pre-warmed app-wide.
- **Compliance interaction** — the empty-portfolio nudge and "state an assumption" style must not become personalized advice. The existing COMPLIANCE block stays untouched and still governs; the policy only changes *whether we ask*, not *what verdict we give*.
