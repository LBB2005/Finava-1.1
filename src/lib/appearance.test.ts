import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APPEARANCE_OPTIONS,
  DEFAULT_APPEARANCE,
  LEGACY_THEME_KEY,
  STORAGE_KEY,
  applyAppearance,
  isDarkResolved,
  readLocalAppearance,
  sanitizeAppearance,
  withDefaults,
  type AppearancePrefs,
  type Theme,
} from "./appearance";

/** Minimal <html> stand-in — the module only ever sets/removes attributes. */
function fakeRoot() {
  const attrs = new Map<string, string>();
  return {
    attrs,
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    removeAttribute: (k: string) => void attrs.delete(k),
  };
}

/** Install a fake DOM + localStorage. `blocked` simulates private-mode storage. */
function installBrowser(opts: { dark?: boolean; blocked?: boolean } = {}) {
  const root = fakeRoot();
  const store = new Map<string, string>();
  const throwIfBlocked = () => {
    if (opts.blocked) throw new Error("storage blocked");
  };

  vi.stubGlobal("document", { documentElement: root });
  vi.stubGlobal("window", {
    matchMedia: (q: string) => ({ matches: Boolean(opts.dark) && q.includes("dark") }),
  });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => {
      throwIfBlocked();
      return store.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      throwIfBlocked();
      store.set(k, v);
    },
    removeItem: (k: string) => {
      throwIfBlocked();
      store.delete(k);
    },
  });

  return { root, store };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sanitizeAppearance", () => {
  it("keeps every valid control value", () => {
    const input: AppearancePrefs = {
      theme: "dark",
      accent: "violet",
      textSize: "large",
      density: "compact",
      reduceMotion: true,
      serifHeadings: false,
    };
    expect(sanitizeAppearance(input)).toEqual(input);
  });

  it("drops out-of-enum values so a malformed PATCH can't inject an attribute", () => {
    expect(
      sanitizeAppearance({
        theme: "neon",
        accent: "url(evil)",
        textSize: "huge",
        density: "cosy",
      }),
    ).toEqual({});
  });

  it("drops non-boolean toggles", () => {
    expect(sanitizeAppearance({ reduceMotion: "true", serifHeadings: 1 })).toEqual({});
  });

  it("drops unknown keys entirely", () => {
    expect(sanitizeAppearance({ theme: "dark", evil: "x" })).toEqual({ theme: "dark" });
  });

  it("returns {} for non-objects and null", () => {
    for (const v of [null, undefined, "dark", 7, true]) {
      expect(sanitizeAppearance(v)).toEqual({});
    }
  });

  it("accepts each documented option value", () => {
    for (const [key, values] of Object.entries(APPEARANCE_OPTIONS)) {
      for (const v of values) {
        expect(sanitizeAppearance({ [key]: v })).toEqual({ [key]: v });
      }
    }
  });
});

describe("withDefaults", () => {
  it("fills every missing key from the standard look", () => {
    expect(withDefaults({})).toEqual(DEFAULT_APPEARANCE);
  });

  it("lets the partial win", () => {
    expect(withDefaults({ accent: "teal" })).toEqual({ ...DEFAULT_APPEARANCE, accent: "teal" });
  });
});

describe("isDarkResolved", () => {
  it("is true for an explicit dark choice regardless of the OS", () => {
    installBrowser({ dark: false });
    expect(isDarkResolved("dark")).toBe(true);
  });

  it("is false for an explicit light choice even when the OS prefers dark", () => {
    installBrowser({ dark: true });
    expect(isDarkResolved("light")).toBe(false);
  });

  it("follows the OS for 'system'", () => {
    installBrowser({ dark: true });
    expect(isDarkResolved("system")).toBe(true);
    vi.unstubAllGlobals();
    installBrowser({ dark: false });
    expect(isDarkResolved("system")).toBe(false);
  });

  it("treats 'system' as light on the server (no window)", () => {
    expect(isDarkResolved("system")).toBe(false);
  });

  it("treats 'system' as light when matchMedia is unavailable", () => {
    vi.stubGlobal("window", {});
    expect(isDarkResolved("system")).toBe(false);
  });
});

describe("applyAppearance", () => {
  it("clears every attribute for the default look, so base :root tokens apply", () => {
    const { root } = installBrowser();
    // Pre-dirty the element to prove the defaults actively remove attributes.
    for (const a of ["data-theme", "data-accent", "data-text-size", "data-density", "data-motion", "data-headings"]) {
      root.setAttribute(a, "stale");
    }
    applyAppearance(DEFAULT_APPEARANCE);
    expect([...root.attrs.keys()]).toEqual([]);
  });

  it("writes each non-default control as its data-* attribute", () => {
    const { root } = installBrowser();
    applyAppearance({
      theme: "dark",
      accent: "emerald",
      textSize: "large",
      density: "compact",
      reduceMotion: true,
      serifHeadings: false,
    });
    expect(Object.fromEntries(root.attrs)).toEqual({
      "data-theme": "dark",
      "data-accent": "emerald",
      "data-text-size": "large",
      "data-density": "compact",
      "data-motion": "reduced",
      "data-headings": "sans",
    });
  });

  it("sets data-theme=dark for theme:system when the OS prefers dark", () => {
    const { root } = installBrowser({ dark: true });
    applyAppearance({ ...DEFAULT_APPEARANCE, theme: "system" });
    expect(root.attrs.get("data-theme")).toBe("dark");
  });

  it("is a no-op on the server (no document)", () => {
    expect(() => applyAppearance(DEFAULT_APPEARANCE)).not.toThrow();
  });
});

describe("readLocalAppearance / writeLocalAppearance", () => {
  /** Re-import per test so `writeLocalAppearance` binds to the freshly stubbed globals. */
  async function load() {
    return import("./appearance");
  }

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips prefs through localStorage", async () => {
    installBrowser();
    const { writeLocalAppearance } = await load();
    const prefs: AppearancePrefs = { ...DEFAULT_APPEARANCE, accent: "crimson", textSize: "small" };
    writeLocalAppearance(prefs);
    expect(readLocalAppearance()).toEqual(prefs);
  });

  it("sanitizes what it reads back, so a tampered blob can't inject values", async () => {
    const { store } = installBrowser();
    store.set(STORAGE_KEY, JSON.stringify({ theme: "neon", accent: "teal" }));
    expect(readLocalAppearance()).toEqual({ ...DEFAULT_APPEARANCE, accent: "teal" });
  });

  it("migrates the legacy theme-only key", async () => {
    const { store } = installBrowser();
    store.set(LEGACY_THEME_KEY, "dark");
    expect(readLocalAppearance()).toEqual({ ...DEFAULT_APPEARANCE, theme: "dark" });
  });

  it("ignores a legacy key holding an unknown value", async () => {
    const { store } = installBrowser();
    store.set(LEGACY_THEME_KEY, "sepia");
    expect(readLocalAppearance()).toEqual(DEFAULT_APPEARANCE);
  });

  it("falls back to defaults on corrupt JSON", async () => {
    const { store } = installBrowser();
    store.set(STORAGE_KEY, "{not json");
    expect(readLocalAppearance()).toEqual(DEFAULT_APPEARANCE);
  });

  it("falls back to defaults when storage is blocked (private mode)", async () => {
    installBrowser({ blocked: true });
    expect(readLocalAppearance()).toEqual(DEFAULT_APPEARANCE);
  });

  it("returns defaults on the server (no window)", () => {
    expect(readLocalAppearance()).toEqual(DEFAULT_APPEARANCE);
  });

  it("keeps the legacy theme key in sync for the pre-paint script", async () => {
    const { store } = installBrowser();
    const { writeLocalAppearance } = await load();

    writeLocalAppearance({ ...DEFAULT_APPEARANCE, theme: "dark" });
    expect(store.get(LEGACY_THEME_KEY)).toBe("dark");

    writeLocalAppearance({ ...DEFAULT_APPEARANCE, theme: "light" });
    expect(store.get(LEGACY_THEME_KEY)).toBe("light");

    // "system" has no fixed answer — the legacy key must be cleared, not guessed.
    writeLocalAppearance({ ...DEFAULT_APPEARANCE, theme: "system" as Theme });
    expect(store.has(LEGACY_THEME_KEY)).toBe(false);
  });

  it("swallows a blocked write rather than throwing at the caller", async () => {
    installBrowser({ blocked: true });
    const { writeLocalAppearance } = await load();
    expect(() => writeLocalAppearance(DEFAULT_APPEARANCE)).not.toThrow();
  });

  it("is a no-op on the server (no window)", async () => {
    const { writeLocalAppearance } = await load();
    expect(() => writeLocalAppearance(DEFAULT_APPEARANCE)).not.toThrow();
  });
});
