"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import useSWR from "swr";
import { useAuth } from "@/context/AuthContext";
import { authFetch, authFetcher } from "@/lib/authFetch";
import {
  applyAppearance,
  DEFAULT_APPEARANCE,
  readLocalAppearance,
  sanitizeAppearance,
  withDefaults,
  writeLocalAppearance,
  type AppearancePrefs,
} from "@/lib/appearance";

interface AppearanceCtx {
  prefs: AppearancePrefs;
  set: <K extends keyof AppearancePrefs>(key: K, value: AppearancePrefs[K]) => void;
  reset: () => void;
}

const Ctx = createContext<AppearanceCtx | null>(null);

/**
 * Holds appearance state, applies it to <html>, and syncs it with the user's
 * account. localStorage is the instant cache (set before paint by the inline
 * script in layout.tsx); the account doc is the cross-device source of truth.
 */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Start from defaults (matches SSR), then hydrate from localStorage in an
  // effect to avoid a hydration mismatch.
  const [prefs, setPrefs] = useState<AppearancePrefs>(DEFAULT_APPEARANCE);

  // Hydrate from the local cache on mount and apply it. Reading localStorage in
  // an effect (not render) is the hydration-safe way to avoid an SSR mismatch.
  useEffect(() => {
    const local = readLocalAppearance();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(local);
    applyAppearance(local);
  }, []);

  // Re-apply whenever prefs change (covers programmatic updates).
  useEffect(() => {
    applyAppearance(prefs);
  }, [prefs]);

  // When theme follows the system, re-apply as the OS preference flips.
  useEffect(() => {
    if (prefs.theme !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyAppearance(prefs);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [prefs]);

  // Pull the account's stored appearance (only when signed in). Dedupes with the
  // other /api/user consumers via SWR's shared cache.
  const { data } = useSWR<{ appearance?: unknown }>(
    user ? "/api/user" : null,
    authFetcher
  );

  // Reconcile server <-> local once per sign-in: server wins if it has prefs,
  // otherwise push the local cache up so it starts syncing.
  const reconciledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!user || !data) return;
    if (reconciledFor.current === user.uid) return;
    reconciledFor.current = user.uid;

    const serverPrefs = sanitizeAppearance(data.appearance);
    if (Object.keys(serverPrefs).length > 0) {
      const merged = withDefaults(serverPrefs);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrefs(merged);
      applyAppearance(merged);
      writeLocalAppearance(merged);
    } else {
      // First-time signed-in user with no stored appearance — seed from local.
      void authFetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appearance: readLocalAppearance() }),
      });
    }
  }, [user, data]);

  // Reset the reconcile guard on sign-out so the next sign-in re-syncs.
  useEffect(() => {
    if (!user) reconciledFor.current = null;
  }, [user]);

  const persist = useCallback(
    (next: AppearancePrefs) => {
      setPrefs(next);
      applyAppearance(next);
      writeLocalAppearance(next);
      if (user) {
        void authFetch("/api/user", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appearance: next }),
        });
      }
    },
    [user]
  );

  // Latest committed prefs, kept in a ref so multiple changes within one tick
  // merge against each other instead of all clobbering the same stale closure.
  // Synced from committed state for programmatic changes (hydrate/reconcile).
  const prefsRef = useRef(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  const set = useCallback<AppearanceCtx["set"]>(
    (key, value) => {
      const next = { ...prefsRef.current, [key]: value };
      prefsRef.current = next;
      persist(next);
    },
    [persist]
  );

  const reset = useCallback(() => {
    prefsRef.current = DEFAULT_APPEARANCE;
    persist(DEFAULT_APPEARANCE);
  }, [persist]);

  return <Ctx.Provider value={{ prefs, set, reset }}>{children}</Ctx.Provider>;
}

export function useAppearance(): AppearanceCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppearance must be used within AppearanceProvider");
  return ctx;
}
