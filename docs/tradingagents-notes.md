# Notes on TradingAgents — read, don't import

[TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents) is a
multi-agent LLM trading framework that is structurally close to Finava Live: an
analyst team, a bull/bear researcher debate, then a trader and a risk/portfolio
layer that can veto. It passed `ai-hedge-fund` in August 2026 to become the
most-starred repo in this space.

It is Python on LangGraph. **Nothing here is a dependency proposal.** The value is
that they have been running this shape long enough to hit the failure modes we are
walking toward, and their release notes name each one precisely. This note maps
their fixes onto our code and records which ones we have already solved, which are
real gaps, and which do not apply.

Sources: repo README and the v0.3.1 (5 Jul 2026) and v0.4.0 (31 Aug 2026) release
notes. Quotes below are from those notes.

---

## Scorecard

| Their fix | Finava today | Verdict |
|---|---|---|
| Unparseable rating → `REVIEW` sentinel, never a tradeable Hold | `extractStructured` never throws; failure is a recorded outcome | **Already solved** |
| Checkpoint resume respects graph shape | `runStep` replays on `(runId, step)` with no fingerprint check | **Real gap** |
| Decision-log memory only injects lessons resolved by trade date | `agentMemory` orders by `createdAt` only | **Latent** — safe live, breaks on replay |
| Macro data pinned to as-of vintage | `candidateFacts` fetches "as of now", unpinned | **Real gap** — this is item 2 |
| Sentiment trimmed to the analysis window | Grok X sentiment is current-time | **Real gap** — same shape as above |
| Latest OHLCV bar dropped when close is NaN | — | Not applicable; our analogue was the ADV volume-key bug (`b0bb1c9`) |
| Debate openers fabricating the opponent's argument | No turn-taking debate, but `dissent` is a mandatory non-empty field | **Same pressure, different place** |
| Router returns more targets than any edge maps | We have no graph router | Not applicable |

---

## The four that matter

### 1. Step replay ignores the agent fingerprint

Theirs, v0.3.1:

> Checkpoint resume respects graph shape. The thread id folds in selected
> analysts, debate/risk depth, and asset mode

Ours: [`runStep`](../src/lib/live/harness.ts) keys idempotency on `(runId, step)`
alone. A completed step returns its stored result verbatim:

```ts
const prior = steps[step];
if (prior?.done) return { result: prior.result as T, replayed: true };
```

The comment above it is right about why replay exists — "Re-run failed jobs" is a
button in the Actions UI and it re-runs succeeded steps too. But if a deploy lands
between the original run and the retry, the replayed step returns a result computed
by the **previous** agent version, while every step after it runs on the new one.
The decision that comes out is a chimera of two versions and is stamped with only
the new fingerprint.

This is worse for us than for them, because our whole credibility claim is that
[`promptHash`](../src/lib/live/promptHash.ts) lets a reader verify which code made a
decision. A silently mixed-version decision is exactly the artifact that claim is
supposed to rule out.

We are actually well positioned to fix it: we already compute the fingerprint. The
fix is to store it alongside each step result and refuse the replay when it differs
— fail the run loudly rather than resume across a version boundary. That is a small
change to `runStep` and belongs with item 4 (durability), not item 2.

### 2. Memory has no "when did this become knowable"

Theirs, v0.4.0:

> Decision-log memory records when each outcome became known and only injects
> lessons resolved by the trade date

Ours: [`agentMemory`](../src/lib/agentMemory.ts) stores `createdAt` and recalls with
`orderBy("createdAt", "desc")`. `createdAt` is when the insight was *written*, not
when the outcome it describes *became known*.

Live-forward this is safe — you cannot write memory from the future, so today's
recall can only contain the past. It breaks the moment we replay, backtest, or
re-run a historical day, at which point recall will happily inject an insight
written after the decision being reconstructed. Given that a replayable public
ledger is the point of Finava Live, this is a "fix before it can bite" item rather
than a live bug.

The cheap version: record `knownAt` next to `createdAt` and filter recall by the
run's as-of timestamp. That filter has nowhere to read an as-of from until item 2
exists, so it lands as part of item 2, not before.

### 3. Point-in-time is two problems, not one

Their v0.4.0 splits it in a way I had been treating as a single item:

> FRED macro requests now pin the data vintage to the as-of date, so a backtest no
> longer sees later revisions

> Social sentiment (StockTwits, Reddit) is trimmed to the analysis window instead
> of showing today's chatter

**Vintage pinning** (a revised figure must resolve to the value as published then)
and **window trimming** (a stream must be cut at the as-of instant) are different
mechanics. `candidateFacts` needs the first — Finnhub basic financials get revised.
Our Grok X sentiment needs the second.

Worth noting the honesty precedent already in `candidateFacts`: every field is
nullable and null means "we could not verify this", never zero. As-of stamping
should extend that vocabulary rather than replace it — a fact we hold but cannot
date is not the same as one we could not fetch, and both differ from one we
deliberately excluded as post-dating the decision.

---

### 4. The mandatory-dissent trap

Theirs, v0.4.0:

> Debate openers no longer fabricate the opponent's argument when none has been made

We have no turn-taking bull/bear debate, so this looked inapplicable. It is not — we
apply the same pressure in a different place.
[`buildDecisionContract`](../src/lib/live/decisionContract.ts) requires:

> `"dissent"`: string — the strongest argument AGAINST this decision. Required even
> when the crew agreed; if nobody dissented, state the best bear case that was
> raised and why it was set aside. **Never empty, never 'none'.**

The intent is right, and the escape hatch is thoughtful: if nobody dissented, report
a bear case that *was* raised and set aside. But "never empty, never 'none'" removes
the model's ability to report the truthful outcome when genuinely nothing was
raised. A required non-empty field that a run cannot satisfy honestly is an
instruction to invent — the exact failure they shipped a fix for.

This matters more for us than the generic version, because `dissent` is published in
the ledger as evidence the crew considered the other side. A fabricated dissent is
not a cosmetic flaw; it is a false entry in the artifact whose entire purpose is
being checkable.

The fix is a schema decision, not a prompt tweak: give `dissent` a structured way to
say "none raised" — an enum discriminating *dissent raised and overruled* from *no
dissent raised*, with the free-text argument required only in the first case. Then
"nobody objected" becomes a recordable, scoreable fact rather than a gap the model
papers over. It also becomes a signal worth tracking: a crew that never dissents is
a crew worth investigating.

Flagged rather than fixed, because it changes a published schema and the right
answer depends on what you want `dissent` to mean.

---

## What this changes about the plan

- **Item 2 (as-of stamping) grows a second half.** Vintage pinning and window
  trimming are separate mechanics on different providers. The `agentMemory`
  `knownAt` filter joins it, since it needs the as-of timestamp to filter against.
- **Item 4 (durability) gains a specific first task** that is smaller and more
  valuable than the framing I gave it: make `runStep` refuse a cross-version
  replay. Worth doing regardless of whether we adopt a durable-workflow runtime.
- **The `dissent` schema needs a decision from you** before it can be fixed. It is
  the only item here that changes a published schema, so it is not mine to pick.

## What we should not copy

Their checkpoints are per-ticker SQLite files under `~/.tradingagents/cache`, and
decisions append to a local markdown file. That is right for a CLI tool on one
machine and wrong for us — our equivalents are the hash-chained Firestore ledger
and the published GitHub log, which are the artifacts that make the track record
checkable by someone who does not trust us. Their storage is a convenience; ours
is the product.
