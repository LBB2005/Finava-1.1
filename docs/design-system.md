# Finava Design System

**The single source of truth for every page's visual language.** Any new or edited UI must
consume these tokens and components. If a value isn't here, it doesn't ship.

Status: locked 2026-07-28 (visual-unification pass). Winner direction recorded in §12.

---

## 1. Principles

1. **One product.** Stock, Chat, Portfolio, Research, DNA, Hedge Fund, Settings — same shell,
   same card, same button, same table. No page-local dialects.
2. **Restraint reads as trust.** Neutral surfaces, hairline borders, sparing accent. Semantic
   color (bull/bear/warn) is reserved strictly for meaning — never decoration.
3. **Data-dense, never cramped.** Keep the current information density; discipline comes from
   the spacing grid and the type ramp, not from whitespace inflation.
4. **Tokens or nothing.** No Tailwind palette classes (`text-red-600`, `bg-slate-100`), no raw
   hex in components, no ad-hoc `rgba()` shadows, no literal font sizes.
5. **Motion is subtle.** 120–240 ms, ease-out, no bounce. `prefers-reduced-motion` and
   `data-motion="reduced"` always honored.

## 2. Color

All colors are CSS custom properties in `src/app/globals.css`, themed via `[data-theme="dark"]`
and re-accented via `[data-accent=…]`. **Never** bypass them.

| Role | Token |
|---|---|
| Page / raised surface / inset surface | `--color-bg` / `--color-surface` / `--color-surface-2` |
| Sidebar bg + hover | `--color-sidebar`, `--color-sidebar-hover` |
| Ink: primary / secondary / muted | `--color-text`, `--color-text-secondary`, `--color-muted` |
| Hairline / strong border | `--color-border`, `--color-border-strong` |
| Accent family | `--color-accent`, `-hover`, `-light`, `-medium` |
| Text on accent fills | `--color-on-accent` |
| Semantic | `--color-bull`, `--color-bear`, `--color-warn` (+ warn bg/border/text) |
| Chat modes | `--color-deep-research`, `--color-backtest`, `--color-discover` (+ `-light`) |
| Modal scrim | `--color-scrim` (one value app-wide) |
| Chart series | `--chart-1` … `--chart-6` (categorical; theme-aware) |

Rules:
- Tinted fills are built with `color-mix(in oklab, var(--color-X) N%, transparent)` — the same
  recipe everywhere (12% chip fill, 8% hover fill are the house percentages).
- White-on-accent is `var(--color-on-accent)`, never `#fff`.
- Logo boxes use `--color-surface` + border (they must survive dark mode), not `#fff`.
- The hedge-fund `--v-*` palette and per-page palettes are **retired**; HF consumes the
  standard tokens (and therefore gets dark mode for free).

## 3. Typography

Faces (unchanged): **Playfair Display** `--font-serif` (editorial headings + display numerals),
**Hanken Grotesk** `--font-sans` (UI), **Geist Mono** `--font-mono` (tickers, table numerics,
micro-labels). `[data-headings="sans"]` remaps `--font-serif` — never hardcode Playfair.

The ramp (scaled by `[data-text-size]` — any new step must be added to the small/large blocks):

| Token | px | Use |
|---|---|---|
| `--text-micro` | 10 | eyebrows, badges, table `th`, chart axes |
| `--text-meta` | 11.5 | secondary captions, chip labels, meta rows |
| `--text-sm` | 12.5 | table cells, buttons, dense UI copy |
| `--text-body` | 14 | default body, chat prose |
| `--text-title` | 15 | card/section headings |
| `--text-lg` | 17 | KPI values, sub-hero figures |
| `--text-xl` | 19 | page titles (`.page-title`) |
| `--text-display` | 22 | section display, modal titles |
| `--text-stat` | 28 | stat-card numerals |
| `--text-hero` | 46 | page hero numerals (stock price, portfolio value) |

Rules:
- **No literal font sizes in components.** `fontSize: "var(--text-sm)"` or `text-[length:var(--text-sm)]`.
- Off-ramp sizes snap to the nearest step (9/9.5/10.5→micro; 11/12→meta or sm; 13/13.5→sm;
  14.5→body; 16/17→lg; 30/32→stat; 40/54→hero).
- Eyebrow labels use the `.eyebrow-label` utility (micro + 700 + uppercase + 0.1em) — never
  re-typed inline.
- **Every financial numeral is tabular**: `.mono` for table/inline figures, serif display
  numerals inherit `tabular-nums` from `body` (keep it).

## 4. Spacing

4 px base grid, 8 px rhythm for structure. House steps: **4, 8, 12, 16 (gap-4), 20, 24, 32**.
- Card body padding: `14px 16px` (dense) or `16px 18px` (regular). Card header strip: `10px 16px`.
- Table cells: `8px 12px`, header `8px 12px`.
- Page gutters/section spacing come from `--page-gutter` / `--content-pad-*` tokens — never
  hardcode `150px` bottom clearance (`--content-pad-bottom`).
- Odd literals (7, 9, 11, 13, 26 px) are drift — snap on touch.

## 5. Radius

One language (Precision scale): `--radius-xs 3` (chips, badges, mini-tags) · `--radius-sm 5`
(buttons, inputs, inner tiles) · `--radius-md 8` (cards, panels, tables) · `--radius-lg 10`
(popovers, floating panels, menus) · `--radius-xl 12` (modals, composer) · `999px` (pills,
avatars, dots).

- The `.research-root` and `.hf-shell` radius overrides are **removed** — one scale app-wide.
- Never write a literal radius that duplicates a token value.

## 6. Elevation

Three layers, nothing else:
1. **Resting card** — `1px solid var(--color-border)` on `--color-bg`/`--color-surface`.
   No shadow. This is the default for all in-flow cards, tables, panels.
2. **Feature card** — border + `var(--shadow-card)` (heroes, primary summary cards only).
3. **Floating layer** — border + `var(--shadow-pop)` (popovers, menus, dropdowns, modals,
   toasts). Modals sit on `--color-scrim` + `backdrop-blur(4px)`.

Special material: **`.frost-card`** (translucent + blur) is reserved for chrome that floats
over content — the composer and the live crew panel. Use the class; never re-inline the recipe.

## 7. Interactive states

- **Focus**: the global `:focus-visible` accent ring (2px, offset 2). Only opt out when a
  component provides its own visible cue (composer).
- **Hover**: rows/list items tint with `--color-surface` or `--color-accent-light` (choose by
  intent: navigation = accent-light, inspection = surface). Buttons darken one step. 120–150 ms.
- **Active nav/tab**: `--color-accent-light` fill + `--color-accent` ink (sidebar, tabs, lens
  pills all share this grammar).
- **Disabled**: `opacity: .5` + `cursor: not-allowed`.

## 8. Components (the single inventory)

| Component | Canonical form |
|---|---|
| Page top bar | `PageHeader` (`.page-header`) — every top-level page, no exceptions |
| Card | `.card` (+ `.card-head` header strip) — border, `--radius-md`, optional surface head |
| Primary button | `.btn.btn-primary` — accent fill, on-accent ink, `--radius-sm`, `--text-sm` 600 |
| Secondary button | `.btn` — border, bg, hover surface-2 |
| Ghost / danger | `.btn.btn-ghost`, `.btn.btn-danger` (bear ink + 8% bear hover fill) |
| Compact control | `.tbtn` — mono 11px 28px control for toggles/filters/segments (now unscoped, app-wide); `.tbtn.on` = accent fill |
| Segmented tabs | `.seg` pill track (`.b-lenses-pill` grammar): surface track, white/bg active chip + shadow-card |
| Ticker chip | `.tk-chip` — mono, accent-light fill, `--radius-xs` (one shape everywhere) |
| Badge / status pill | `.pill` — 12% semantic fill + semantic ink, radius 999 |
| Grade pill | `.grade.grade-a…f` (unchanged, tokenized) |
| Data table | `.data-table` — micro mono uppercase `th` on surface, hairline rows, `.num` right-aligned mono cells, hover accent-light |
| Input | `.input` — bg, border, `--radius-sm`; focus = accent border + 3px accent-light ring |
| Modal | `Modal` / `.modal-card` — `--radius-xl`, `--shadow-pop`, `--color-scrim` overlay |
| Popover / menu | `--radius-lg`, `--shadow-pop`, border — one recipe (composer menus, header menus, dropdowns) |
| Tooltip | `ui/Tooltip` (unchanged) |
| Toast | `feedback/Toast` (already token-correct — the reference citizen) |
| Skeleton | `.skeleton` shimmer — the only loading texture (no ad-hoc `animate-pulse`) |
| Spinner | `ui/Spinner` / `.spin` — one implementation |
| Empty state | `.empty-note` pattern: centered, `--text-sm` muted copy + optional micro action |
| Sparkline | `ui/Sparkline` — one component (w/h props), bull/bear stroke 1.5 |
| Icon | `ui/Icon` — 24-box, `stroke=currentColor`, **strokeWidth 2**, round caps/joins |

## 9. Iconography

- One drawn set via `ui/Icon` (24-box, stroke 2). Decorative one-off strokes (1.6 empty-state
  art, 2.5 check confirmation) are allowed only inside that component's registry.
- **No emoji as UI** (🥇🖼📄🔍 → drawn icons). Unicode glyphs are allowed only as *data
  ornaments* with an established finance meaning: `▲/▼` price direction and `·` separators.
  Arrows (`→ ↗ ↻`), close `×` in buttons, and `●` status dots migrate to drawn SVG/CSS dots.

## 10. Charts

One house style, defined in `src/lib/chartTheme.ts` + tokens:
- **Series palette**: `--chart-1…6` (chart-1 = accent). Bull/bear lines use semantic tokens.
- **Axes/labels**: `--text-micro` mono, `fill: var(--color-muted)`, no axis lines
  (`tickLine/axisLine false` in Recharts; hairline baseline only where needed).
- **Gridlines**: `stroke: var(--color-border)`, dashed `3 4` — the single dash rhythm for
  gridlines and reference/estimated lines app-wide.
- **Tooltip**: one shared component — bg card, hairline border, `--shadow-pop`, micro mono
  label + sm value. Recharts charts use `ChartTooltip`; SVG charts mirror it.
- **Area fills**: accent (or semantic) gradient 0.28 → 0.02 opacity.
- Sparklines: `ui/Sparkline` only.

## 11. Required states

Every async surface ships all three: **skeleton** (`.skeleton`, shaped like the content),
**empty** (`.empty-note` with helpful copy), **error** (inline message + retry, or toast for
mutations). No bare “Loading…” text, no silently-empty panels.

## 12. Direction (Phase-3 winner)

Three candidate directions were mocked in `design-mockups/direction-{1,2,3}.html` varying only
elevation language, spacing rhythm, radius, and accent intensity:
1. **Precision / Institutional** — hairline borders, tighter rhythm, smaller radius, restrained accent.
2. **Calm / Editorial** — soft shadow elevation, +1 spacing step, larger radius, more Playfair.
3. **Modern / Crisp** — layered neutral surfaces, medium radius, more confident accent.

**Winner: Direction 1 — Precision / Institutional** (runner-up: Direction 3, Modern / Crisp).
Rationale: hairline-border elevation is how most of the app is already built, so the rollout
converges pages rather than re-skinning them; borders keep dense tables crisp in both themes
(shadows die in dark mode); the tight rhythm preserves density; and maximal restraint is what
makes the deep-blue-on-neutral brand read as institutional trust. One idea grafted from the
runner-up: the accent is used confidently on exactly one primary CTA per page.
Axis values shipped: radius scale §5, `--elev-*` = none / shadow-card / shadow-pop, card
padding `12px 14px` – `16px 18px`, section gap 14–16px, hero wash ≤ 35% accent-light.

---

## Appendix A — Inconsistency audit (2026-07-28, pre-unification)

The drift this system exists to eliminate:

1. **Type ramp bypassed everywhere.** Outside `.eyebrow-label`, `--text-*` had zero adoption;
   ~16 distinct raw sizes in use (9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5,
   15, 16, 17, 19…), plus Tailwind named steps on /login as a third system.
2. **Four visual dialects.** App default (soft, tokenized), `.research-root` terminal (sharp
   3–5px, hardcoded), `.hf-shell`/`.v10` (parallel light-only `--v-*` palette, radii that
   contradict its own override), Portfolio bespoke editorial. DNA alone used radius tokens.
3. **Radius fragmentation.** Tokens 6/10/14/18 vs literals 2,3,4,5,7,8,9,11,12,16 in use.
4. **12+ button recipes**; canonical `ui/Button` used by none, and its danger variant used
   Tailwind reds.
5. **Hardcoded color.** ChartBlock's 10-hex palette; `#10b981/#ef4444` instead of bull/bear;
   palette classes in login/modals/HoldingCard/AgentStep/Markdown code chrome; `#fff` logo
   boxes breaking dark mode; three different modal scrims; `rgba(15,23,42,…)` shadows inlined
   ~8× instead of shadow tokens.
6. **Elevation drift.** Three popover shadow recipes, two modal elevations, frost recipe
   duplicated inline in the composer.
7. **Charts.** Recharts in 3 files (one tokenized, one fully hardcoded, different tooltips);
   4 sparkline implementations; radar geometry triplicated; three dash rhythms.
8. **Icons.** Inline SVG strokes 1.5–3.5 mixed; emoji tiers (🥇👀🎲), attachment emoji
   (🖼📄📎), glyph icons (→ ↗ ↻ × ●) mixed with drawn SVG.
9. **States.** Watchlist loading = bare "Loading…"; Board/Themes lenses missing empty/error;
   StockChart text-only states; ad-hoc `animate-pulse` next to the `.skeleton` primitive.
10. **Tabular numbers** missing in Settings stat cards/usage bars and HoldingCard stats.
11. **Dead code.** 5 unimported research components + their CSS; ~2,400 lines of orphaned
    hedge-fund legacy (HFOverview/Strategies/Bot/Trading/Markov/Subnav + `.hf-*` CSS);
    dead classes (`discover-narrative`, `stream-body`).
12. **Bugs found in passing.** Portfolio empty-state `.tbtn` renders unstyled outside
    `.research-root`; deep-research verdict badge shows navy instead of its mode purple.
