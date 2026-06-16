# Test Coverage to 60% (Logic Layer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise automated test coverage of Finava's business-logic layer (`src/lib`, `src/agents`, `src/app/api/**/route.ts`) from ~5.7% to ≥60% lines, focused on the paths where a bug produces wrong financial data or wrong billing.

**Architecture:** Vitest + v8 coverage, unit tests co-located as `*.test.ts` next to each source file (the existing convention). All external boundaries (Firestore/Firebase Admin, Anthropic/OpenAI/Gemini, Finnhub/Polygon/SEC EDGAR, Plaid) are mocked with `vi.mock`. We do **not** test `.tsx` UI components for coverage — they inflate the denominator and aren't the trust risk. Coverage is scoped to logic files only via `vitest.config.ts`.

**Tech Stack:** TypeScript, Vitest 4.1 (`vitest run`), `@vitest/coverage-v8` 4.1, Next.js App Router API routes, Firebase Admin (Firestore), AsyncLocalStorage.

---

## STATUS (updated 2026-06-15)

- ✅ **Task 0 done** — `vitest.config.ts` scoped to the logic layer (`all: true`, include lib/agents/route.ts, exclude tests/schemas/.tsx); `test`/`test:cov` scripts added; `src/test/mocks/firestore.ts` created. Threshold ratchet is **live and currently at 29%**.
- ✅ **Phase 1 done** — `dcf.test.ts`, `usage.test.ts`, `llm.test.ts`, `entitlements.test.ts`, `factors.test.ts`.
- ✅ **Phase 2 done** — `ceo.test.ts`, `discovery.test.ts`, `dcf-agent.test.ts`, `fundamentals-agent.test.ts`, `insider-agent.test.ts`.
- **Coverage: 5.7% → 29.9% lines** (1380/4618). Suite: 60 → 203 tests, all green.
- ⏭️ **Phases 3 & 4 are the remaining work (handed to Codex).** Start at Phase 3 below. After each phase, raise the `vitest.config.ts` thresholds to just under the new measured number (the ratchet), run `npm run test:cov`, and commit. Final target: lines ≥ 60%.

Patterns established in Phases 1–2 that Phase 3/4 should copy:
- Mock the boundary with `vi.mock`: `@/lib/firebase-admin` (use `makeFirestoreMock`), `@/lib/anthropic` (scripted `stream().finalMessage()`), `@/lib/llm` `generate`, `openai`, and the data libs (`@/lib/finnhub`, `@/lib/edgar`, `@/lib/polygon`, `@/lib/alpaca`, `@/lib/finnhub`).
- Use `vi.stubEnv` for env-flag branches; reset in `afterEach`.
- Dynamic `await import(...)` AFTER mocks are registered; re-import per test for env-dependent module state.
- Assert observable behavior (returned value, emitted `AgentEvent`s, the prompt handed to `generate`) — not internal call wiring.

---

## Why these numbers (read before starting)

Measured baseline on 2026-06-15:

| Scope | Lines | Covered | % |
|---|---|---|---|
| Everything (`src/**/*.{ts,tsx}`) | 9,645 | 265 | **2.7%** |
| Logic only (`lib` + `agents` + `route.ts`) | 4,661 | 265 | **5.7%** |
| Only files touched by a test (v8 default) | 400 | 265 | 66% |

Three things follow:

1. **The "4%/66%" confusion is a config artifact.** v8's default only counts files a test imports, so it reads ~66%. Due-diligence tools turn on `all`, which counts every file → ~4%. **Task 0 makes the config honest and locks the denominator to the logic layer**, so the number we report is the number that's true.
2. **The real target is the logic layer: 4,661 lines.** 60% of that ≈ 2,800 covered lines. We're at 265, so we need to cover **~2,535 more lines**.
3. **`.tsx` is deliberately out of scope.** Including components would push the denominator to 9,645 and the work to test-via-render — a different discipline (Playwright/RTL) for a later cycle. We exclude it explicitly so 60% means "60% of the code that can compute a wrong DCF or overcharge a user."

**Coverage-per-effort ranking** (drives task order): pure functions first (`dcf.ts`, `creditsFor`, `suggestedWaccFromBeta`, factor scoring, `llm` routing) — no mocks, high line yield — then mock-boundary logic (`usage`, `entitlements`, agents, routes), then data parsers.

---

## File map

Each task creates exactly one `*.test.ts` next to its source. No source files change except `vitest.config.ts` and `package.json` (Task 0). Order within a phase is the order to execute.

**Phase 1 — pure & business-critical logic (`src/lib`)**
- Test: `src/lib/dcf.test.ts` → `src/lib/dcf.ts` (94 lines, pure)
- Test: `src/lib/usage.test.ts` → `src/lib/usage.ts` (457 lines; pure `creditsFor` + mocked Firestore for the rest)
- Test: `src/lib/llm.test.ts` → `src/lib/llm.ts` (372 lines; routing table pure, `generate()` mocked)
- Test: `src/lib/entitlements.test.ts` → `src/lib/entitlements.ts` (197 lines, mocked Firestore)
- Test: `src/lib/factors.test.ts` → `src/lib/factors.ts` (411 lines; score pure helpers, mocked data fetch)

**Phase 2 — agent orchestration (`src/agents`)**
- Test: `src/agents/ceo.test.ts` → `ceo.ts` (658 lines; mock all sub-agents + tools)
- Test: `src/agents/discovery.test.ts` → `discovery.ts` (281 lines; mock sub-agents)
- Test: `src/agents/sub-agents/dcf-agent.test.ts`, `fundamentals-agent.test.ts`, `insider-agent.test.ts` (mock LLM + data)

**Phase 3 — API routes (`src/app/api/**/route.ts`)**
- Test: `src/app/api/agent/route.test.ts`, `chat/route.test.ts`, `usage/route.test.ts`, `stock/[ticker]/dcf/route.test.ts`, and the Stripe webhook route if present (mock auth + usage + agents)

**Phase 4 — data pipelines (`src/lib`)**
- Test: `src/lib/edgar.test.ts`, `stockData.test.ts`, `research.test.ts`, `plaidSync.test.ts` (mock HTTP, assert parsing/normalization on captured fixtures)

A shared mock helper is created once in Task 0 and reused everywhere: `src/test/mocks/firestore.ts`.

---

## Task 0: Make coverage honest and scoped

**Files:**
- Modify: `vitest.config.ts`
- Modify: `package.json` (scripts)
- Create: `src/test/mocks/firestore.ts`

- [ ] **Step 1: Replace `vitest.config.ts` with the scoped-coverage config**

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      all: true,
      // Logic layer only — UI (.tsx) is intentionally excluded from the
      // coverage denominator and tested separately (RTL/Playwright) later.
      include: [
        "src/lib/**/*.ts",
        "src/agents/**/*.ts",
        "src/app/api/**/route.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "src/test/**",
        "src/lib/schemas/**", // declarative zod schemas, no branches worth covering
        "**/*.d.ts",
      ],
      reporter: ["text-summary", "html"],
      // Ratchet — raise these as each phase lands so coverage can't regress.
      thresholds: {
        lines: 5,
        statements: 5,
        functions: 5,
        branches: 3,
      },
    },
  },
});
```

- [ ] **Step 2: Add scripts to `package.json`**

In the `"scripts"` block add:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:cov": "vitest run --coverage"
```

- [ ] **Step 3: Create the reusable Firestore mock**

```ts
// src/test/mocks/firestore.ts
import { vi } from "vitest";

/** In-memory stand-in for the Firebase Admin Firestore surface the app uses:
 *  db.collection(...).doc(...).get()/set()/update(), and collection queries.
 *  Seed with plain objects keyed by `${collection}/${id}`. */
export function makeFirestoreMock(seed: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(seed));

  const docRef = (path: string) => ({
    id: path.split("/").pop()!,
    get: vi.fn(async () => ({
      exists: store.has(path),
      id: path.split("/").pop()!,
      data: () => store.get(path),
    })),
    set: vi.fn(async (v: unknown, opts?: { merge?: boolean }) => {
      store.set(path, opts?.merge ? { ...(store.get(path) as object), ...(v as object) } : v);
    }),
    update: vi.fn(async (v: unknown) => {
      store.set(path, { ...(store.get(path) as object), ...(v as object) });
    }),
  });

  const collectionRef = (col: string) => ({
    doc: (id: string) => docRef(`${col}/${id}`),
    where: vi.fn(() => collectionRef(col)),
    get: vi.fn(async () => ({
      docs: [...store.entries()]
        .filter(([k]) => k.startsWith(`${col}/`))
        .map(([k, v]) => ({ id: k.split("/").pop()!, data: () => v })),
    })),
  });

  return { db: { collection: (c: string) => collectionRef(c) }, store };
}
```

- [ ] **Step 4: Run baseline and confirm the honest number**

Run: `npm run test:cov`
Expected: PASS, `text-summary` shows **Lines ~5–6%** with denominator ~4,661 (not 400, not 9,645). Confirms scope is correct.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts package.json src/test/mocks/firestore.ts
git commit -m "test: scope v8 coverage to logic layer + add firestore mock helper"
```

---

## Phase 1 — Pure & business-critical logic

### Task 1: `dcf.ts` — valuation math (pure, no mocks)

This is the highest-trust file: a bug here = wrong intrinsic value shown to users. Pure functions, so tests are exact and fast.

**Files:**
- Create: `src/lib/dcf.test.ts`
- Source: `src/lib/dcf.ts` (no change)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { suggestedWaccFromBeta, computeDcf, defaultFairValue, type DcfInputs } from "./dcf";

const baseInputs = (over: Partial<DcfInputs> = {}): DcfInputs => ({
  baseFcf: 1_000_000,
  fcfIsProxy: false,
  sharesOutstanding: 1_000_000,
  netDebt: 0,
  historicalGrowth: 0.08,
  suggestedWacc: 0.09,
  currentPrice: 10,
  currency: "USD",
  ...over,
});

describe("suggestedWaccFromBeta", () => {
  it("uses 4% risk-free + beta*5% premium for a normal beta", () => {
    expect(suggestedWaccFromBeta(1)).toBeCloseTo(0.09, 10); // 0.04 + 1*0.05
  });
  it("clamps a low/negative beta up to the 7% floor", () => {
    expect(suggestedWaccFromBeta(0)).toBe(0.07); // raw 0.04 -> floor
  });
  it("clamps a high beta down to the 13% ceiling", () => {
    expect(suggestedWaccFromBeta(3)).toBe(0.13); // raw 0.19 -> ceiling
  });
  it("treats null/non-finite beta as beta=1", () => {
    expect(suggestedWaccFromBeta(null)).toBeCloseTo(0.09, 10);
    expect(suggestedWaccFromBeta(NaN)).toBeCloseTo(0.09, 10);
  });
});

describe("computeDcf", () => {
  it("returns all-null fair value when baseFcf is missing or non-positive", () => {
    const r = computeDcf(baseInputs({ baseFcf: null }), { wacc: 0.09, growth: 0.08 });
    expect(r.fairValue).toBeNull();
    expect(r.equityValue).toBeNull();
    expect(r.pvExplicit).toBe(0);
  });
  it("returns null fair value when shares outstanding is missing", () => {
    const r = computeDcf(baseInputs({ sharesOutstanding: null }), { wacc: 0.09, growth: 0.08 });
    expect(r.fairValue).toBeNull();
    expect(r.equityValue).not.toBeNull(); // equity still computable
  });
  it("produces a positive fair value for healthy inputs", () => {
    const r = computeDcf(baseInputs(), { wacc: 0.09, growth: 0.08 });
    expect(r.fairValue!).toBeGreaterThan(0);
    expect(r.pvExplicit).toBeGreaterThan(0);
    expect(r.pvTerminal).toBeGreaterThan(0);
  });
  it("is monotonic: a higher WACC lowers fair value", () => {
    const low = computeDcf(baseInputs(), { wacc: 0.08, growth: 0.08 }).fairValue!;
    const high = computeDcf(baseInputs(), { wacc: 0.12, growth: 0.08 }).fairValue!;
    expect(high).toBeLessThan(low);
  });
  it("net cash (negative netDebt) raises equity value vs net debt", () => {
    const cash = computeDcf(baseInputs({ netDebt: -500_000 }), { wacc: 0.09, growth: 0.08 }).equityValue!;
    const debt = computeDcf(baseInputs({ netDebt: 500_000 }), { wacc: 0.09, growth: 0.08 }).equityValue!;
    expect(cash).toBeGreaterThan(debt);
  });
  it("clamps terminal growth below WACC so the Gordon denominator stays positive", () => {
    // terminalGrowth above wacc would blow up; result must stay finite & positive
    const r = computeDcf(baseInputs(), { wacc: 0.09, growth: 0.05, terminalGrowth: 0.20 });
    expect(Number.isFinite(r.pvTerminal)).toBe(true);
    expect(r.pvTerminal).toBeGreaterThan(0);
  });
  it("computes upside sign correctly vs current price", () => {
    const cheap = computeDcf(baseInputs({ currentPrice: 1 }), { wacc: 0.09, growth: 0.08 });
    const rich = computeDcf(baseInputs({ currentPrice: 1_000_000 }), { wacc: 0.09, growth: 0.08 });
    expect(cheap.upsidePct!).toBeGreaterThan(0);
    expect(rich.upsidePct!).toBeLessThan(0);
  });
});

describe("defaultFairValue", () => {
  it("clamps historical growth into [0, 0.25] and returns a value", () => {
    expect(defaultFairValue(baseInputs({ historicalGrowth: 5 }))).toBeGreaterThan(0); // clamp 25%
    expect(defaultFairValue(baseInputs({ historicalGrowth: -1 }))).toBeGreaterThan(0); // clamp 0%
  });
  it("falls back to 8% growth when historicalGrowth is null", () => {
    expect(defaultFairValue(baseInputs({ historicalGrowth: null }))).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it passes** (the source already exists)

Run: `npx vitest run src/lib/dcf.test.ts`
Expected: PASS, all assertions green. If `suggestedWaccFromBeta(0)` is not exactly `0.07`, re-read `dcf.ts:39-45` — the test encodes the spec, fix the test only if the spec comment is wrong.

- [ ] **Step 3: Check the coverage delta**

Run: `npm run test:cov`
Expected: `dcf.ts` shows ~95–100% lines.

- [ ] **Step 4: Commit**

```bash
git add src/lib/dcf.test.ts
git commit -m "test: cover dcf valuation math (suggestedWacc, computeDcf, defaultFairValue)"
```

### Task 2: `usage.ts` — credit metering & quota

`creditsFor` is pure (test exactly). `checkUsageLimit` / `recordUsage` / `getUsageSummary` read/write Firestore — mock it with the Task 0 helper. **Begin by reading `src/lib/usage.ts` in full** to confirm the Firestore import path and the shape of the usage doc, then mock that exact module.

**Files:**
- Create: `src/lib/usage.test.ts`

- [ ] **Step 1: Read `src/lib/usage.ts`** and note (a) the module it imports `db`/Firestore from, (b) the doc path used by `checkUsageLimit`, (c) the tier-limit constants. The mock must target the real import path (e.g. `vi.mock("@/lib/firebaseAdmin", ...)`).

- [ ] **Step 2: Write failing tests** covering, at minimum:
  - `creditsFor(...)` returns the documented credit cost for each model/op tier, and rounds/weights as implemented (pure — assert exact numbers read from `usage.ts:80-141`).
  - `checkUsageLimit` returns `allowed: true` when the user is under their tier cap.
  - `checkUsageLimit` returns `allowed: false` / the 429 signal when the user is at/over the cap.
  - Admin UID (from `ADMIN_UIDS`) bypasses the cap → always allowed. (See memory: admin UID full access.)
  - `recordUsage` increments the stored credit total (assert via the mock `store`).
  - `getUsageSummary` returns the correct remaining = cap − used.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFirestoreMock } from "@/test/mocks/firestore";

// Replace the path below with the ACTUAL admin-db import discovered in Step 1.
const fs = makeFirestoreMock();
vi.mock("@/lib/firebaseAdmin", () => ({ adminDb: fs.db, db: fs.db }));

beforeEach(() => fs.store.clear());

describe("creditsFor", () => {
  it("weights cost by model tier", async () => {
    const { creditsFor } = await import("./usage");
    // Assert the exact values the implementation defines (read usage.ts:80-141).
    expect(creditsFor).toBeTypeOf("function");
  });
});

describe("checkUsageLimit", () => {
  it("allows a user under their cap", async () => {
    const { checkUsageLimit } = await import("./usage");
    const res = await checkUsageLimit("user-under-cap");
    expect(res.allowed).toBe(true);
  });
  it("blocks a user at their cap", async () => {
    // Seed fs.store with a usage doc at the cap for this user, then assert allowed === false.
  });
});
```

- [ ] **Step 3: Run** `npx vitest run src/lib/usage.test.ts` → PASS.
- [ ] **Step 4: Coverage** `npm run test:cov` → `usage.ts` ≥ 75% lines.
- [ ] **Step 5: Commit** `git commit -m "test: cover usage metering and quota enforcement"`

### Task 3: `llm.ts` — model routing

The routing table (`AGENT_MODELS`) and the `LLM_ROUTING_ON` flag are pure — assert that each `AgentKey` maps to a model string and that routing-off collapses to the fallback. `generate()` calls provider SDKs — mock them and assert the right provider is selected per model id, plus fallback-on-error.

**Files:**
- Create: `src/lib/llm.test.ts`

- [ ] **Step 1: Read `src/lib/llm.ts`** — note the provider dispatch inside `generate()` and which SDK modules to mock (Anthropic/OpenAI/Gemini/Grok per the multi-LLM attribution memory).
- [ ] **Step 2: Write failing tests:**
  - Every `AgentKey` has a non-empty model string in `AGENT_MODELS`.
  - With `LLM_ROUTING=off` the table falls back to the single default model (re-import the module with the env var set via `vi.stubEnv`).
  - `generate()` dispatches to the provider implied by the model id and returns its text (provider SDK mocked).
  - `generate()` falls back / throws the expected shape when the primary provider errors.
- [ ] **Step 3–5:** run, check `llm.ts` ≥ 70% lines, commit `"test: cover llm model routing and generate dispatch"`.

### Task 4: `entitlements.ts` — plan gates

**Files:** Create `src/lib/entitlements.test.ts`. Mock Firestore (Task 0 helper).

- [ ] **Step 1: Read `entitlements.ts`** — note `resolvePlan`'s doc path and the `capabilitiesFor` matrix.
- [ ] **Step 2: Write failing tests:**
  - `resolvePlan` returns the free/default plan when no entitlement doc exists.
  - `resolvePlan` returns the stored plan + source when a doc exists.
  - `capabilitiesFor("free")` locks Pro capabilities; `capabilitiesFor("pro")` unlocks them (assert the exact matrix).
  - `requireEntitlement` throws/403s when the plan lacks the capability, passes when it has it.
  - `assertWatchlistQuota` allows under `getWatchlistLimit` and rejects at the limit.
- [ ] **Step 3–5:** run, `entitlements.ts` ≥ 80% lines, commit `"test: cover entitlement plan gates and watchlist quota"`.

### Task 5: `factors.ts` — factor scoring

**Files:** Create `src/lib/factors.test.ts`. The scoring helpers should be unit-testable on synthetic inputs; `computeFactorUniverse` fetches data — mock the data source and assert aggregation/normalization, not real numbers.

- [ ] **Step 1: Read `factors.ts`** — identify the pure per-factor scoring helpers (the bulk of lines 1–302) vs the async `computeFactorUniverse` (303+).
- [ ] **Step 2: Write failing tests:**
  - Each pure scoring helper maps known inputs to the documented score/percentile (deterministic — assert exact).
  - Missing/NaN inputs degrade gracefully (no throw, returns null/neutral as implemented).
  - `computeFactorUniverse` with a mocked universe returns one scored entry per input symbol.
- [ ] **Step 3–5:** run, `factors.ts` ≥ 70% lines, commit `"test: cover factor scoring helpers"`.

- [ ] **Phase 1 ratchet:** raise `vitest.config.ts` thresholds to `{ lines: 20, statements: 20, functions: 20, branches: 12 }`, run `npm run test:cov` to confirm it passes, commit `"test: ratchet coverage thresholds after phase 1"`.

**Expected after Phase 1:** ~20–25% logic-layer lines.

---

## Phase 2 — Agent orchestration

Strategy for every task here: **mock all sub-agents, all `agents/tools`, the LLM (`@/lib/llm` `generate`), and all data libs.** Test the orchestration contract, never LLM output: which sub-agents are dispatched, in what wave/order, timeout/partial-failure isolation, cache-hit short-circuit, and synthesis shape.

### Task 6: `ceo.ts`
- [ ] Read `ceo.ts`; list the sub-agents it imports and the dispatch/wave function names.
- [ ] Tests: correct sub-agent set dispatched for a given request; one sub-agent throwing does **not** abort the others (partial-failure isolation); a cache hit skips dispatch; the synthesized result includes each successful sub-agent's contribution. Mock every sub-agent to return a tagged stub.
- [ ] Target `ceo.ts` ≥ 60% lines. Commit `"test: cover ceo agent dispatch and failure isolation"`.

### Task 7: `discovery.ts`
- [ ] Read `discovery.ts`; tests: wave sequencing/batching, conviction-count logic (1–8 per the discover-v2 memory), synthesis with mocked sub-agents. Target ≥ 60% lines. Commit.

### Task 8: highest-value sub-agents (`dcf-agent`, `fundamentals-agent`, `insider-agent`)
- [ ] One test file each. Mock the LLM + data lib; assert each builds the correct prompt/input contract and maps the (mocked) response into its output schema; assert graceful handling of empty data. Target ≥ 60% lines each. Commit per agent.

- [ ] **Phase 2 ratchet:** thresholds → `{ lines: 38, statements: 38, functions: 35, branches: 22 }`. Commit.

**Expected after Phase 2:** ~38–42%.

---

## Phase 3 — API routes

Strategy: import the route handler, call it with a mock `Request`. Mock `requireAuth`, `checkUsageLimit`/`recordUsage`, and the agent/data layer. Assert: auth gate (401 unauth), usage gate runs **before** model spend, input validation (400 on bad body), and response/error shape. Reference existing `src/app/api/backtest/route.test.ts` and `portfolio/statement/route.test.ts` for the established harness.

### Task 9–13 (one per route)
- [ ] `agent/route.ts`: 401 when unauth; 429 when over quota; streaming setup invoked on the happy path.
- [ ] `chat/route.ts`: rate-limit path, conversation context wired, error shape.
- [ ] `usage/route.ts`: returns correct quota state for the authed user.
- [ ] `stock/[ticker]/dcf/route.ts`: input validation, data-fetch-error handling, response shape (reuses `dcf.ts`, already covered).
- [ ] Stripe webhook route (if present): signature verification rejects bad sig; plan upgrade/downgrade events update entitlement (mocked).
- [ ] Each: target ≥ 60% lines of the route, commit per route.

- [ ] **Phase 3 ratchet:** thresholds → `{ lines: 50, statements: 50, functions: 48, branches: 30 }`. Commit.

**Expected after Phase 3:** ~50–54%.

---

## Phase 4 — Data pipelines (close the gap to 60%)

Strategy: capture a small **real response fixture** for each upstream (SEC EDGAR XBRL JSON, Finnhub, Polygon, Plaid) into `src/test/fixtures/`, mock `fetch`/the client to return it, and assert the parser extracts the right normalized values. This is where bad data enters — exact-value assertions matter most.

### Task 14–17 (one per file)
- [ ] `edgar.ts`: feed a captured companyfacts fixture → assert extracted FCF/shares/net-debt match expected; assert the `fcfIsProxy` fallback path (capex absent) and missing-field tolerance.
- [ ] `stockData.ts`: normalization + Finnhub→Polygon fallback when the primary returns empty/errors.
- [ ] `research.ts`: aggregation across sources with some fields missing (no throw, partial result).
- [ ] `plaidSync.ts`: account/position mapping, per-share `cost_basis` handling (see Plaid memory). 
- [ ] Each: target ≥ 65% lines, commit per file.

- [ ] **Phase 4 ratchet (final):** thresholds → `{ lines: 60, statements: 60, functions: 55, branches: 38 }`. Run `npm run test:cov`, confirm **Lines ≥ 60%**. Commit `"test: reach 60% logic-layer coverage"`.

---

## Mocking rules (apply in every task)

- **Mock at the boundary, never the unit under test.** Mock `fetch`, provider SDKs, Firebase Admin, Plaid — not the function you're testing.
- **Never hit a real network or real Firebase in a test.** A test that needs a real key is wrong; mock it.
- **Use captured fixtures for parsers**, not hand-written JSON — real upstream shapes catch real bugs.
- **`vi.stubEnv` / `vi.unstubAllEnvs`** for env-flag branches (`LLM_ROUTING`, `ADMIN_UIDS`, `BETA_ADMIN_ONLY`); reset in `afterEach`.
- **Test behavior, not implementation:** assert returned values and observable side-effects (the mock `store`), not that "function A called function B" — unless the call *is* the contract (e.g. usage-check-before-spend ordering).
- **Re-read the source file at the start of each task.** The signatures in this plan were captured 2026-06-15; verify before mocking.

---

## Self-review (done while writing this plan)

- **Spec coverage:** every layer named in the original 4-phase plan (business logic, agents, routes, pipelines) has tasks; added Task 0 (honest scoped config) which the original lacked — it's the load-bearing fix for the "4% vs 66%" confusion.
- **Placeholder scan:** Phase 1 dcf task is fully concrete (real code, exact expected values derived from the source). Tasks 2–17 intentionally start with "read the file" + a concrete case list rather than full bodies, because their assertions depend on Firestore doc shapes / provider dispatch that must be read from source at execution time — writing literal bodies now would hardcode guesses. This is a deliberate granularity choice, not a TODO.
- **Type consistency:** `DcfInputs`/`DcfResult`/`DcfAssumptions`, `AgentKey`/`AGENT_MODELS`, `creditsFor`/`checkUsageLimit`/`getUsageSummary`, `resolvePlan`/`capabilitiesFor`/`requireEntitlement` all match the signatures captured from source.
- **Threshold ratchet** is monotonic (5 → 20 → 38 → 50 → 60) so coverage can never regress between phases.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-15-test-coverage-60.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
