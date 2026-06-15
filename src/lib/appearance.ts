/**
 * Appearance preferences — single source of truth for the look-and-feel controls
 * in Settings → Appearance. Pure (no React) so the API route can reuse the
 * validation helpers server-side. The React state/sync lives in
 * components/providers/AppearanceProvider.tsx.
 *
 * Prefs are applied by writing `data-*` attributes onto <html>; globals.css keys
 * off those attributes to override the relevant CSS variables. The default of
 * every control maps to "no attribute", so the base :root tokens are the
 * standard look.
 */

export type Theme = "light" | "dark" | "system";
export type Accent = "navy" | "emerald" | "violet" | "crimson" | "teal";
export type TextSize = "small" | "default" | "large";
export type Density = "comfortable" | "compact";

export interface AppearancePrefs {
  theme: Theme;
  accent: Accent;
  textSize: TextSize;
  density: Density;
  reduceMotion: boolean;
  serifHeadings: boolean;
}

/** The standard look. "Reset to defaults" restores exactly this. */
export const DEFAULT_APPEARANCE: AppearancePrefs = {
  theme: "light",
  accent: "navy",
  textSize: "default",
  density: "comfortable",
  reduceMotion: false,
  serifHeadings: true,
};

/** Allowed enum values per control — used for both UI rendering and server-side
 *  validation so a malformed PATCH can never inject an arbitrary attribute. */
export const APPEARANCE_OPTIONS = {
  theme: ["light", "dark", "system"] as Theme[],
  accent: ["navy", "emerald", "violet", "crimson", "teal"] as Accent[],
  textSize: ["small", "default", "large"] as TextSize[],
  density: ["comfortable", "compact"] as Density[],
} as const;

export const STORAGE_KEY = "finava-appearance";
export const LEGACY_THEME_KEY = "finava-theme";

/** Keep only known keys with allowed values. Safe on untrusted input (client
 *  localStorage, request body). Returns a partial — merge with defaults. */
export function sanitizeAppearance(input: unknown): Partial<AppearancePrefs> {
  const out: Partial<AppearancePrefs> = {};
  if (!input || typeof input !== "object") return out;
  const o = input as Record<string, unknown>;
  if (APPEARANCE_OPTIONS.theme.includes(o.theme as Theme)) out.theme = o.theme as Theme;
  if (APPEARANCE_OPTIONS.accent.includes(o.accent as Accent)) out.accent = o.accent as Accent;
  if (APPEARANCE_OPTIONS.textSize.includes(o.textSize as TextSize)) out.textSize = o.textSize as TextSize;
  if (APPEARANCE_OPTIONS.density.includes(o.density as Density)) out.density = o.density as Density;
  if (typeof o.reduceMotion === "boolean") out.reduceMotion = o.reduceMotion;
  if (typeof o.serifHeadings === "boolean") out.serifHeadings = o.serifHeadings;
  return out;
}

export function withDefaults(p: Partial<AppearancePrefs>): AppearancePrefs {
  return { ...DEFAULT_APPEARANCE, ...p };
}

function prefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** Resolve whether dark tokens should be active for the given theme choice. */
export function isDarkResolved(theme: Theme): boolean {
  return theme === "dark" || (theme === "system" && prefersDark());
}

/** Write all data-* attributes onto <html>. Defaults clear the attribute so the
 *  base :root values apply. No-op on the server. */
export function applyAppearance(p: AppearancePrefs): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const set = (attr: string, on: boolean, value: string) =>
    on ? root.setAttribute(attr, value) : root.removeAttribute(attr);

  set("data-theme", isDarkResolved(p.theme), "dark");
  set("data-accent", p.accent !== "navy", p.accent);
  set("data-text-size", p.textSize !== "default", p.textSize);
  set("data-density", p.density !== "comfortable", p.density);
  set("data-motion", p.reduceMotion, "reduced");
  set("data-headings", !p.serifHeadings, "sans");
}

/** Read cached prefs from localStorage, migrating the legacy theme-only key. */
export function readLocalAppearance(): AppearancePrefs {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return withDefaults(sanitizeAppearance(JSON.parse(raw)));
    const legacy = localStorage.getItem(LEGACY_THEME_KEY);
    if (legacy === "dark" || legacy === "light") return withDefaults({ theme: legacy });
  } catch {
    /* corrupt JSON or storage blocked — fall through to defaults */
  }
  return DEFAULT_APPEARANCE;
}

/** Persist prefs to localStorage and keep the legacy theme key in sync so any
 *  un-migrated reader (or the pre-paint script) still themes correctly. */
export function writeLocalAppearance(p: AppearancePrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    if (p.theme === "dark") localStorage.setItem(LEGACY_THEME_KEY, "dark");
    else if (p.theme === "light") localStorage.setItem(LEGACY_THEME_KEY, "light");
    else localStorage.removeItem(LEGACY_THEME_KEY);
  } catch {
    /* storage blocked (private mode) — prefs simply won't persist */
  }
}
