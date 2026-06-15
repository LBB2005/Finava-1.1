# Appearance Settings — Design

**Date:** 2026-06-15
**Status:** Approved for implementation
**Scope:** Split a dedicated, in-depth **Appearance** section out of the General settings section. Nav otherwise unchanged.

## Goal

Today all appearance lives in `GeneralSection` as a single light/dark toggle. Give users a dedicated Appearance section with six controls, applied app-wide, synced to their account, and resettable to defaults.

## Controls

| Control | Values | Default | Mechanism |
|---|---|---|---|
| Theme | Light / Dark / System | **Light** | `data-theme="dark"` on `<html>`; System follows `matchMedia('(prefers-color-scheme: dark)')`, live |
| Accent color | Navy / Emerald / Violet / Crimson / Teal | **Navy** | `data-accent` → CSS swaps `--color-accent` + `-hover/-light/-medium` (defined for light & dark) |
| Text size | Small / Default / Large | **Default** | `data-text-size` scales the `--text-*` ramp |
| Interface density | Comfortable / Compact | **Comfortable** | `data-density="compact"` tightens shared spacing/gutter tokens |
| Reduce motion | on / off | **off** | `data-motion="reduced"` near-zeroes transition/animation durations app-wide; OS `prefers-reduced-motion` is the baseline |
| Editorial headings | on / off | **on** | off → `data-headings="sans"` points `--font-serif` at the sans stack |

Default look = **Light · Navy · Default · Comfortable · motion on · serif headings on**. This preserves current behavior for existing users (theme stays Light unless they pick System/Dark).

## Architecture

### `src/lib/appearance.ts` (new) — single source of truth
- `AppearancePrefs` type + `DEFAULT_APPEARANCE`.
- Allowed-value enums per key (also used server-side for validation).
- `applyAppearance(prefs)` — writes the `data-*` attributes onto `document.documentElement`, resolving `theme: "system"` via `matchMedia`.
- `readLocal()` / `writeLocal(prefs)` — localStorage (`finava-appearance`) cache; migrates legacy `finava-theme`.
- `useAppearance()` hook — returns `{ prefs, set(key, value), reset() }`. On change: update state → `applyAppearance` → `writeLocal` → if logged in, `PATCH /api/user { appearance }`. Subscribes to `matchMedia` change when theme is System.

### Sync model
- **Server (truth):** `userSettings.appearance` object in Firestore.
- **localStorage (cache):** instant apply + logged-out support.
- **Load reconciliation:**
  1. Inline script in `layout.tsx` reads `finava-appearance` and applies all attributes **before paint** (no FOUC). Resolves System.
  2. After `GET /api/user` resolves: if logged in and `appearance` exists on the server → apply it and overwrite the local cache (server wins → cross-device sync). If logged in and no server `appearance` yet → push the current local prefs up once (first-time migration).
  3. Logged out → localStorage only.

### CSS (`globals.css`)
- `[data-accent="emerald|violet|crimson|teal"]` blocks overriding accent tokens, mirrored under `[data-theme="dark"]`.
- `[data-text-size="small|large"]` overriding the `--text-*` ramp.
- `[data-density="compact"]` overriding spacing/gutter tokens.
- `[data-motion="reduced"] *` zeroing transitions/animations; plus `@media (prefers-reduced-motion: reduce)` baseline.
- `[data-headings="sans"]` remapping `--font-serif`.

### API (`src/app/api/user/route.ts`)
- `GET` returns `appearance` from `userSettings` (or omitted/undefined when unset).
- `PATCH` accepts `appearance`, **whitelisting** each key to its allowed enum values before merge-writing. Unknown keys/values are dropped (these become CSS attributes — no arbitrary input).

### UI (`src/app/settings/page.tsx`)
- New nav item **Appearance** in the Workspace group (icon: `sun`/palette).
- New `AppearanceSection` rendering the six `Row`s using existing `Toggle`/segmented-control primitives, plus a **Reset to defaults** action.
- `GeneralSection` keeps Language, Start screen, and the dev-preview toggle (its appearance Row is removed).

### Sidebar (`src/components/layout/Sidebar.tsx`)
- Replace its duplicated theme read/write with the shared `appearance` module so its light/dark toggle stays in sync with the new section.

## Known limitation
**Density** is a good first pass: spacing is partly hardcoded in components, so compact mode is wired through shared tokens + major surfaces, not pixel-perfect on every screen. The other five are fully wired.

## Verification
Observable in the running app — verify via preview: toggle each control, confirm the `data-*` attribute changes and the visual effect, confirm reset restores defaults, confirm a reload preserves the choice (cache) and that the sidebar toggle and section stay in sync.
