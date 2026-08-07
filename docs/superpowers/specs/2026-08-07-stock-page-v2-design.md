# Stock Page v2 — Differentiator-First Redesign

**Status:** Design approved section-by-section via visual brainstorm (mockups in
`.superpowers/brainstorm/*/content/`, gitignored). Ready for implementation planning.
**Goal:** Surface Finava's four differentiators — Finava Score, AI verdict, interactive
DCF, Investor Lens — the moment a user lands on `/stock/[ticker]`, without losing any
existing depth. Everything obeys `docs/design-system.md`.

---

## 1. Intelligence Rail (desktop ≥900px)

The chart card becomes a two-pane flex: chart `flex:1`, rail fixed **248px**, hairline
divider, one shared card border. Range toggles stay under the chart. Rail height tracks
the chart; the Lens cell absorbs remaining height.

**Visual voice: "Icon ledger."** Four flat rows divided by hairlines. Each row: a 26px
`--radius-sm` icon tile (`--color-accent-light` bg, `--color-accent` drawn icon, stroke 2)
+ eyebrow label (`.eyebrow-label`) + value + right-aligned affordance. No shadows, no fills.

| Row | Value | Affordance | Data source |
|---|---|---|---|
| Finava Score | serif `--text-display` numeral + grade letter (grade tier colors) | `→` (Finava tab) | deterministic factor engine (existing; same as Research board) |
| AI Verdict | stance `.pill` (bull/bear/warn) + `78% · 2d ago` micro mono | `↻` refresh | new verdict cache (§2) |
| Fair value · DCF | serif `$237` + `+19%` colored by sign | `→` (Finava tab, DCF chapter) | deterministic DCF at default assumptions (§5) |
| Your Lens | 2–3 lines `--text-meta`, key figures bolded, 3-line clamp | — | existing InvestorLens output |

**States** (every cell always renders):
- Score: skeleton → value; unscored ticker → `—` + "Not yet scored".
- Verdict: **cached** (pill + age; age > 30d renders in `--color-warn`) · **never-run**
  ("No verdict yet" + small `.btn` **Generate** that deep-links to the Finava tab AND
  auto-starts a run — one click) · **refreshing** (pill dims via `model-badge-breathe`,
  age says "refreshing…", old verdict stays until replaced) · **refresh error** (keep
  cached value, toast the error).
- Fair value: skeleton → value; insufficient fundamentals → `—` + "Insufficient data"
  (never fabricate — Data Accuracy Rule). Upside recomputed client-side vs live quote.
- Lens: personalized · no-holdings prompt ("Add holdings… Connect →" → /portfolio) ·
  lens-off fallback line. Never empty.
- The old InvestorLens whisper strip above the tabs is **removed** (the Lens cell replaces it).

Interactions: Score/Fair-value cells fully clickable (hover `--color-accent-light` tint,
focus ring); ↻ disabled while a run is streaming for this ticker. Credits are metered
exactly as today — the rail adds no new run paths.

## 2. Verdict persistence (only backend change)

- On completion of a Finava Analysis run, the existing streaming route additionally writes
  `users/{uid}/verdicts/{ticker}`: `{ stance, confidence, take, catalysts[], risks[],
  score, updatedAt }` (per-user, matching agent-memory tenant isolation).
- New **`GET /api/stock/[ticker]/verdict`** (requireAuth) returns the doc or 404.
  Consumed by the rail (§1) and the Overview Read (§3). SWR on the client.
- No changes to run triggering, streaming, entitlements, or metering.

## 3. Overview tab — "Bull/Bear ledger"

Two-column grid (`1.55fr / 1fr`, hairline divider), then two full-width financial blocks.

**Left column:**
1. *The Finava Read* — cached `take` as a serif pull-quote (`--text-title`+, line-height
   1.55). No cached verdict → quiet "Generate Finava's read" affordance (same one-click
   behavior as the rail).
2. Catalyst/risk chips — from cached `catalysts[]`/`risks[]`: green chips
   (12% bull mix + 25% border), red chips (bear equivalents), `--radius-xs`, values
   embedded in the copy where available.
3. *Score pillars* — the six factor-engine pillars as label + track + `--color-accent`
   fill + mono value (weak pillar fills `--color-warn`). Deterministic, always renders.

**Right column:**
1. *Financial trajectory* — Revenue / EPS / Gross margin, each label + latest value +
   YoY% + an 8-quarter mini bar chart (7 bars `--color-accent-medium`, latest
   `--color-accent`). Skeletons while loading; missing series → "Unavailable".
2. *Latest news* — existing news feed, `SOURCE · AGE` mono eyebrow + headline rows.

**Full-width below:**
1. *Quarterly ledger table* — 8 quarters × {Revenue, YoY growth, EPS diluted, Gross
   margin, FCF}. `.dt`-style table: micro mono uppercase `th` on surface, right-aligned
   mono cells, growth column in semantic color.
2. *Three-statement summary (TTM)* — Income / Balance sheet / Cash flow in three bordered
   columns (5 key lines each, per the approved mock).
Financial data comes from the existing financials pipeline; missing line-items render
`—`, never invented. The Financials tab keeps full statements/history (no overlap
removed in v1 of this redesign; copy in the Financials tab may link back).

About/company description moves to the bottom of the left column (kept, demoted).

## 4. Tab consolidation (7 → 5)

`Overview · Financials · Street & News · Finava · Money Map`
- **Street & News** = existing Analysts tab + News tab merged (analyst targets/ratings
  first, news feed below; internal anchor from rail/notifications if needed).
- **Finava** = existing Finava Analysis + DCF merged (§5).
- No functionality deleted — only relocated. Deep links (`?tab=`) map old names to new.

## 5. Finava tab — "one scroll, two chapters"

**Chapter 1 — Finava's Read (verdict hero, "headline leads, orb docked right"):**
- Left (flex 1): eyebrow `FINAVA'S READ · 5 AGENTS · 2d ago · ↻`, the take as a bold
  serif headline (`--text-stat` scale, key word optionally stance-colored), one-line
  dek in `--text-sm` secondary, then the frost crew ribbon tucked beneath.
- Right (docked): the **score orb** (~92px ring; conic fill colored by stance tier;
  serif numeral center + micro stance label; `CONFIDENCE` micro caption below) — the
  "seal of judgment". **Static at rest.** It breathes (the chat page's
  `breathe`/`glowpulse` pair) **only while an analysis is actively streaming**, and
  settles when done. `prefers-reduced-motion`/`data-motion="reduced"` disable it.
- The **frost crew ribbon** (`.frost-card` recipe, radius-lg) sits under the headline
  column: agent names with status dots (bull = agree, warn = dissent), skeptic dissent
  bolded, right-aligned model badges (existing ModelBadge). While streaming, this
  expands into the existing live per-agent panel; collapsed ribbon when settled.
- Never-run state: chapter shows the orb hollow (track only) + "Run Finava's 5-agent
  analysis" `.btn-primary`; streaming state preserves today's live signal cards.

**Chapter 2 — DCF (below a `Rule`):**
- Fair value as large navy serif (`--text-stat`/34px scale) + upside mono chip; the
  existing assumption sliders and outputs, restyled to tokens; slider defaults are the
  same server defaults used by the rail's Fair-value cell (one shared pure function —
  rail and tab can never disagree).
- Rail deep-links: `FINAVA →` scrolls to chapter 1, `DCF →` to chapter 2.

## 6. Mobile (<900px)

- Rail → **2×2 grid** of the four cells under the full-width chart (icon tiles kept,
  compact padding), before the tab row.
- Overview stacks to one column (Read/chips/pillars → trajectory → news → quarterly
  table → three-statement columns stacked); both tables horizontally scrollable inside
  their own `overflow-x` containers.
- Finava tab hero stacks orb-above-headline centered; crew ribbon wraps.

## 7. Cross-cutting rules

- Tokens only (`docs/design-system.md`); tabular/mono numerals everywhere; one dash
  rhythm; `.skeleton` for loading; `.empty-note` pattern for empties; AA contrast;
  dark mode + all six appearance settings must hold (verify accent swap re-tints icon
  tiles, orb, chips).
- No new dependencies. No changes to business logic beyond §2.
- AI-labeling: verdict/read blocks keep the existing "AI-generated" disclosure treatment.

## 8. Error handling summary

| Failure | Behavior |
|---|---|
| Verdict GET fails | Rail cell + Read show never-run state (generate affordance); no toast on read path |
| Analysis run fails mid-stream | Existing per-agent error handling; cached verdict untouched |
| Factor engine missing ticker | Score `—` "Not yet scored"; pillars section hidden in Overview |
| Financials partial | Render available rows, `—` for gaps; trajectory chart hides missing series |
| Quote unavailable | Fair-value upside hides (value still shown with "vs — " suppressed) |

## 9. Testing

- Unit: verdict-doc write shape + sanitization; GET endpoint auth/404/200; DCF default
  fair-value function (shared rail/tab); financial-table formatting helpers
  (YoY calc, `—` gaps).
- Existing suites must stay green. UI states verified in-browser (light/dark, accents,
  density, reduced motion, <900px), per the app's standard.

## 10. Out of scope (explicit)

- No changes to Research/Portfolio/Watchlist/etc. pages.
- No global-verdict sharing between users; cache is per-user.
- No auto-run of analysis on page load (cost decision: cached-first).
- Financials-tab deep restructuring (dedupe vs Overview) deferred.
- Money Map untouched.
