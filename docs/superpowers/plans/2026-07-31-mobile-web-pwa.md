# Mobile Web + PWA Implementation Plan

**Goal:** Make Finava genuinely good on a phone — installable, touch-native, no horizontal scroll, nothing unreachable — without a second codebase and without a design-system rewrite.

**Strategy:** Responsive web first, PWA shell second. No React Native, no Capacitor. The backend needs zero changes; the work is entirely in the view layer, and most of it is smaller than it looks.

**Scope discipline:** This plan deliberately does *not* make every screen work at 390px. See "Tiering" — that's the single biggest lever for keeping this to ~2 weeks of part-time solo work instead of two months.

---

## Diagnosis

What the codebase actually looks like, measured rather than assumed:

**Already done for you:**
- The API is client-agnostic. `src/lib/requireAuth.ts:23` verifies a `Bearer` token from the `Authorization` header — no cookies, no session middleware. All ~60 routes under `src/app/api/` are plain JSON. **Zero backend work in this plan.**
- `src/components/layout/AppShell.tsx` is already mobile-aware: hamburger top bar at `md:hidden`, off-canvas drawer, body-scroll lock.
- `src/app/globals.css` already has 13 `max-width` media queries (560 / 640 / 760 / 860 / 900 / 920 / 1080 / 1100px) and a `--page-gutter` that drops 22px → 16px. Someone started this work; it's partially there.

**The actual blocker — and it is one specific thing:**

1,530 inline `style={{ }}` objects across `src/`. Inline styles cannot be reached by media queries. That is why screens break on a phone: not missing CSS, but layout the existing CSS is structurally unable to touch.

The good news is that only ~160 of those carry layout-critical properties (`width` / `minWidth` / `maxWidth` / `gridTemplateColumns`), and they cluster hard:

| File | layout-critical inline styles |
|---|---|
| `src/components/stock/StockTabs.tsx` | 24 |
| `src/components/watchlist/WatchlistSplitRail.tsx` | 16 |
| `src/components/research/TuneMode.tsx` | 15 |
| `src/components/stock/FinavaTab.tsx` | 12 |
| `src/components/research/ScreenMode.tsx` | 12 |
| `src/components/research/ThemesMode.tsx` | 11 |
| `src/components/research/Leaderboard.tsx` | 11 |
| `src/components/research/BoardLeaderboard.tsx` | 9 |
| `src/components/research/CompareMode.tsx` | 7 |
| everything else | ≤6 each |

And of those ~160, only the **container-level** ones actually block reflow. A `style={{ width: 15, height: 15 }}` on a swatch is fine on a phone forever. The canonical offender is one line:

```
src/components/watchlist/WatchlistSplitRail.tsx:562
gridTemplateColumns: "minmax(0,1fr) 268px"
```

A fixed 268px sidebar inside a 390px viewport. That single declaration is more of the mobile problem than the other 1,529 inline styles combined.

**Missing entirely:** `public/` has no manifest, no icons, no `apple-touch-icon`. There is no PWA today.

---

## The rule that keeps this small

> Extract **only** inline styles that must change at a breakpoint. Leave cosmetic inline styles alone.

Do not "clean up" 1,530 inline styles. That is a month of regression risk for zero mobile benefit. The real target is roughly **30–40 container-level declarations across ~10 files.** Everything else stays exactly as it is.

---

## Tiering — confirm this before starting

Not every screen deserves a phone layout. Proposed split:

**Tier 1 — full mobile treatment** (daily-use, auth, and public surfaces)
- `/chat` — the core product
- `/stock/[ticker]` — highest-intent screen, most likely opened from a link on a phone
- `/share/[id]` — **public shared conversations; these get opened on phones by people who don't have accounts.** Arguably the highest-leverage screen in the whole plan and the easiest to overlook
- `/portfolio`
- `/watchlist`
- `/dna`
- `/settings`
- `/login`, `/` (landing)

**Tier 2 — readable, not fully interactive**
- `/research` — BOARD and leaderboard views get a proper stacked mobile layout. TUNE / COMPARE / SCREEN are dense multi-column factor tools; give them a simplified view or an honest "best on desktop" affordance rather than a cramped one.

**Tier 3 — desktop-only, handled gracefully**
- `/hedge-fund` — `HFDualPane.tsx` is a Bloomberg-terminal dual-pane with a `.idx-grid`, live order/fill tables, and a bot log. Making it work at 390px is roughly a week on its own, for a screen nobody is going to trade from on a phone. Ship a clean "Open on desktop for the full terminal" card and move on.

Tier 3 is where most of the saved time comes from. If you disagree on `/hedge-fund`, that's the one line item worth re-litigating before Phase 2.

---

## Phase 0 — Ground truth (half day)

- [ ] `npm install` — **`node_modules/` is currently absent**, so nothing has been verified against the real Next version. Confirm `npm run build` and `npm test` are green *before* touching anything, so you have a clean baseline.
- [ ] **Read `node_modules/next/dist/docs/` for `viewport`, `metadata`, and manifest file conventions.** Per `AGENTS.md`, this version of Next has breaking changes from what any of us remember. Specifically verify:
  - whether Next 16.2.6 still injects a default `width=device-width, initial-scale=1` viewport meta (`src/app/layout.tsx` does not export a `viewport` object today — if the default is gone, **every mobile bug in this plan is downstream of that one missing tag** and Phase 1 gets much shorter)
  - the current file convention for `app/manifest.ts` vs `public/manifest.json`
  - the current `themeColor` / `appleWebApp` metadata shape
- [ ] Set up a real device loop: `npm run dev` reachable from your phone on the LAN, or a Vercel preview. Chrome DevTools device mode lies about keyboard behavior, safe areas, and iOS input zoom — all three matter here.
- [ ] Write the smoke checklist: the 9 Tier-1 routes at 390×844 and 430×932, light + dark.

## Phase 1 — Stop the bleeding (1–2 days)

Goal: nothing overflows, nothing is unreachable. Not pretty yet.

- [ ] Fix the viewport meta if Phase 0 showed it's missing.
- [ ] Add a temporary debug guardrail to catch overflow visually:
  ```css
  /* dev only — delete before merge */
  * { outline: 1px solid rgba(255,0,0,.15); }
  ```
  then walk every Tier-1 route at 390px and log each break in this file as a checklist.
- [ ] Verify the existing `@media (max-width: …)` blocks in `globals.css` are actually firing — several may have been written against a viewport meta that isn't there.
- [ ] Add the Tier-3 desktop-only card for `/hedge-fund`.

Ship this. A phone user can now reach everything, even if it's ugly.

## Phase 2 — Layout extraction (3–4 days, the real work)

For each file in the table above, move **container-level** layout out of inline styles and into `globals.css` classes that media queries can reach. The pattern:

```tsx
// before — unreachable by CSS
<div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 268px", gap: 16 }}>

// after
<div className="split-rail">
```
```css
.split-rail { display: grid; grid-template-columns: minmax(0,1fr) 268px; gap: 16px; }
@media (max-width: 760px) { .split-rail { grid-template-columns: 1fr; } }
```

Order by leverage, shipping after each:

- [ ] `WatchlistSplitRail.tsx` — the 268px rail (line 562). Stack it.
- [ ] `stock/[ticker]` — `StockTabs.tsx` (24) + `StockHero` + `FinavaTab`. Seven tabs (`Overview … Money Map`) need horizontal scroll-snap on narrow rather than wrapping into three rows.
- [ ] `portfolio/page.tsx` + `HoldingCard.tsx`
- [ ] `settings/page.tsx` — 1,716 lines but only 4 layout-critical inline styles; the nav rail is the whole job.
- [ ] `chat/` — `MessageList`, `Message`, `ChatInput`. Check code blocks and markdown tables specifically; they're the classic overflow source.
- [ ] `share/[id]` — verify it inherits the chat fixes, since it renders the same message components.
- [ ] `dna/page.tsx` — already `maxWidth: 920, margin: "0 auto"`, so it's close. Mostly gutters.
- [ ] Tier 2: `research/` BOARD + leaderboard only.

## Phase 3 — Touch & input quality (2 days)

This is what separates "responsive" from "actually good."

- [ ] **16px minimum font-size on all inputs.** iOS Safari auto-zooms on focus for anything smaller and never zooms back out. Single highest-impact fix on the list.
- [ ] 44×44px minimum tap targets. Audit the `.tbtn` / `.mono` icon buttons — several are 20×20 (e.g. `WatchlistSplitRail.tsx:308`).
- [ ] **Safe-area insets for the floating composer.** `--content-pad-bottom: 150px` exists to clear `GlobalComposer`; on an iPhone that needs `env(safe-area-inset-bottom)` added or the composer sits under the home indicator.
- [ ] Keyboard handling for the chat input — the composer must stay above the on-screen keyboard. Test on a real device; this is the one that always looks fine in DevTools and is broken on the phone.
- [ ] `.b-table` → card list at ≤560px. Financial tables never work at 390px.
- [ ] Confirm `-webkit-overflow-scrolling` / momentum scroll in the drawer and any `overflow: auto` panes.

## Phase 4 — PWA shell (1 day)

- [ ] Manifest (file convention per Phase 0): name, short_name, `display: "standalone"`, `start_url: "/"`, background + theme color.
- [ ] Icons into `public/`: 192, 512, 512-maskable, `apple-touch-icon` (180). Your existing brand mark; no new design work.
- [ ] `theme-color` that matches the `data-theme` dark/light attribute already set by the inline script in `layout.tsx:44`.
- [ ] Verify "Add to Home Screen" on a real iPhone and a real Android.

- [ ] **Explicitly skip the service worker for now.** Offline caching on a live-market app is close to worthless — stale quotes are worse than no quotes — and a misconfigured SW serving stale JS is one of the nastiest bugs to debug solo. You get the installable icon, the standalone chrome, and the splash screen without one. Revisit only if you later want push notifications for `/api/briefing`.

## Phase 5 — Lock it in (half day)

- [ ] Add a regression guard so this doesn't rot:
  ```css
  html, body { overflow-x: hidden; max-width: 100vw; }
  ```
  ...as a backstop only, *after* fixing real overflows — it hides bugs if you lean on it.
- [ ] Add the mobile smoke checklist to your PR routine.
- [ ] Record the tiering decision in `AGENTS.md` so future work knows `/hedge-fund` is intentionally desktop-only.

---

## Estimate

| Phase | Effort |
|---|---|
| 0 — Ground truth | 0.5 day |
| 1 — Stop the bleeding | 1–2 days |
| 2 — Layout extraction | 3–4 days |
| 3 — Touch & input | 2 days |
| 4 — PWA shell | 1 day |
| 5 — Lock it in | 0.5 day |
| **Total** | **~8–10 working days** |

Part-time solo, that's about two to three weeks. Every phase ships independently — there is no point where you're half-migrated and stuck.

---

## Deliberately not in this plan

- **React Native / Expo.** Keeps 100% of `src/app/api/`, `src/agents/`, `src/lib/` but rewrites 100% of `src/components/` — 22.9k lines of TSX on recharts, gsap/motion, react-markdown, and the Firebase web SDK, none of which are drop-ins. Two UIs to maintain forever. Not a solo-dev move at this stage.
- **Capacitor.** Cheap *after* this plan is done (it's the same responsive work in a native shell), and pointless before it. Reconsider once Phases 0–4 have shipped.
- **App Store distribution.** Worth knowing before you ever go native: a research subscription almost certainly triggers Apple's in-app-purchase requirement, which is 15–30% off the top and needs IAP receipts reconciled against your existing Stripe entitlements in `src/app/api/stripe/`. That's a business decision, not an engineering one, and a PWA sidesteps it entirely.
- **Streaming on native.** `ChatEngine.tsx` uses `getReader()` on a fetch body; React Native's fetch doesn't support response streaming. Irrelevant for PWA, blocking for RN. Noted for whenever that conversation happens.
