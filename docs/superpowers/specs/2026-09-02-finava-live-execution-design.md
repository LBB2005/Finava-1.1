# Finava Live — Publish, then Trade

Date: 2026-09-02
Status: approved, ready for planning

## In one paragraph

Finava Live can currently form a view and refuse a bad one, but it cannot act on
either. This spec covers the step that turns an approved decision into a real
paper order at Alpaca, and the publication step that must precede it: each
morning the day's decisions are committed to a public GitHub repository, and the
executor refuses to trade anything that is not in that commit. Publication is not
a report on what happened; it is a precondition of it happening.

## Where this starts

Phase 0 shipped the thinking half. As of today the system:

- screens a 537-name universe, researches 20 candidates across 4 waves, ranks
  them, debates the top names with a 12-agent crew, and applies 13 deterministic
  mandate rules with no model in the loop;
- writes an append-only, hash-chained ledger of decisions, snapshots and events;
- reads the book state — equity, positions, drawdown — from the Alpaca **paper
  account**, which is funded at exactly the $10,000 the mandate declares;
- has never placed an order, because no code path does. `alpacaTrading.ts` is
  reads-only by design and says so at the top of the file.

Two facts discovered while writing this spec, both load-bearing:

1. **`reconcile` sources the book from the broker**, not the ledger. Therefore
   shadow mode can never produce a book that moves — there is nothing at the
   broker to read back. Simulating movement would mean building a parallel
   synthetic book. Going to real paper orders is *less* work than faking them,
   and every downstream consumer already expects broker-shaped data.
2. **The export payload embeds `generatedAt: new Date().toISOString()`**, so its
   `contentHash` changes on every call and can never be re-verified against a
   published file. This is a correctness bug in the integrity claim and is fixed
   as Part 1 below.

## Scope

Four parts, in build order.

### Part 1 — Make the export deterministic

`GET /api/live/run/[runId]/export` returns `files` and a `contentHash` over the
canonical JSON. The hash is the value the executor checks a commit against, so it
must be stable for a given run.

- Freeze `generatedAt` on first export: record it in `liveRuns/{runId}` and reuse
  it on every subsequent call. Chosen over excluding the field from the hash so
  that a verifier can hash the published file **exactly as published** — no "hash
  everything except this one key" footnote in the verification instructions.
- Add a regression test: two exports of the same run return byte-identical
  payloads and the same `contentHash`.

### Part 2 — The publisher

Publication is performed by the **runner** (the local driver today, GitHub
Actions later), never by the server. The server holds no repository write
credential; its only interest in GitHub is read-only verification.

- The runner GETs the export, writes `days/<runId>/day.json` and
  `days/<runId>/transcripts.json` into the public log repository, commits, and
  pushes.
- The runner then POSTs the resulting commit SHA to a new route,
  `POST /api/live/publish`, which records it on the run as
  `publication: { commit, contentHash, publishedAt }`. This route records a
  publication; it never performs one.
- New configuration: `LIVE_LOG_REPO` (`owner/name`) on both server and runner;
  a repository-scoped write token on the runner only.
- The repository must exist and be public before the first paper order. Its
  README carries the mandate, the scoring registration, and the disclaimer that
  every exported day already includes.

### Part 3 — The execute step

New route `POST /api/live/execute`, the last harness step of the day.

**Preconditions.** `decide` complete; the run not budget-exhausted; entries not
frozen. In `paper` mode additionally: publication recorded, and the market open
per Alpaca's clock. In `shadow` mode the clock is ignored, because a dry run must
be reviewable at any hour.

**Verification.** The executor fetches `days/<runId>/day.json` from the public
repository at the recorded commit, hashes the bytes, and compares against the
`contentHash` it recomputes from the ledger. Any mismatch, or an unreachable
commit, refuses the whole step in `paper` mode. In `shadow` mode the mismatch is
recorded as a `liveEvent` and the step continues, since nothing will be sent.

**Order construction.** For each `kind:"entry"` decision:

- `qty = (targetWeightPct / 100 × equity) / lastPrice`, fractional — whole-share
  market-on-open would bias the universe toward low-priced names.
- `type: "market"`, `timeInForce: "day"`, submitted just after the open.
- `clientOrderId` derived deterministically from `decisionId`, ≤48 chars. This is
  the idempotency key: a replayed step re-submits the same id, Alpaca rejects the
  duplicate, and the executor resolves that to the existing order rather than
  double-filling. A POST that fails is never blindly retried — the order is
  looked up first and re-submitted only if genuinely absent.
- `appendOrder` writes the intent to the ledger **before** the broker call, so an
  order that is placed but whose response is lost is still recoverable.

`kind:"exit"` decisions mirror this with `side:"sell"` and the full position
quantity from the morning snapshot. The book holds nothing today, so this path
ships untested against live data and is exercised by unit tests only — noted
honestly rather than claimed as verified.

**Shadow branch.** Records the intent with `shadow:true` and stops. No broker
call, no fill, and — per the finding above — no movement in the book. The dry run
exists to let a human read the sizing before it becomes real, nothing more.

**Fills.** After submission, poll the order to a terminal state within a bounded
window. Write a `FillRecord` carrying `filledQty`, `filledAvgPrice`, the
session's `officialOpen`, and `slippageBps` computed from the two — so slippage
is measured rather than asserted. An order still open at the end of the window
records its status without a price; the next morning's `reconcile` reads the real
position from the broker regardless, so the book cannot drift from reality.

**New in `alpacaTrading.ts`:** `placeOrder` and `cancelOrder`, each calling the
existing `assertPaperHost` guard first.

### Part 4 — The flip

`LIVE_TRADING_ENABLED=true`. One dry run in shadow is reviewed first; the flip is
a deliberate, separate act, not part of the build.

## Not in scope

- The Live view UI (designed 2026-09-02, its own spec).
- Outcome grading — `appendEvaluation` / `appendOutcome` exist and nothing calls
  them. This is the next project after execution and is what makes calibration a
  measurement rather than a claim.
- Unattended daily scheduling via GitHub Actions.
- Editing the mandate from anywhere but code.

## The shape of a day, once this ships

1. Pre-open: session opens, book reconciles from the broker, scout screens,
   waves research, synthesis ranks, crew debates, rules decide.
2. Export → runner commits the day to the public repo → commit SHA recorded.
3. At the open: execute verifies the commit, places fractional market orders,
   records intents and fills with measured slippage.
4. Next morning: reconcile reads the resulting positions back from the broker.

## Error handling

- Every step remains idempotent and resumable; `runStep` already records
  completion, so a re-invocation replays rather than repeats.
- A failed verification refuses the step rather than trading unverified — the
  failure mode of this system must be "does not trade", never "trades unrecorded".
- Budget exhaustion stops the next step, never the current one, preserving the
  honest total.
- Broker errors are recorded as `liveEvents` with the intent already durable.

## Testing

- Pure helpers (position sizing, `clientOrderId` derivation, slippage, hash
  verification) unit-tested exhaustively — these are where a silent arithmetic
  error would be most expensive.
- Route tests in the established style for: missing publication, hash mismatch,
  market closed, duplicate submission, shadow branch, budget exhaustion.
- The coverage ratchet in `vitest.config.ts` gates the merge; CI must stay green.

## Known risks

- **Vercel's 300s function limit.** A synthesis run has been observed near eight
  minutes. Every route declares `maxDuration = 300`. This does not bite locally
  and will bite in production; it belongs to the automation project but is
  recorded here because it constrains where the daily run can execute.
- **Market-hours coupling.** Execution is only meaningful in a narrow window
  after the open. Until scheduling exists, this is a human obligation.
- **First-day exposure.** Day one is the day everyone scrolls back to. The dry
  run before the flip is the mitigation.
