"use client";
import { SWRConfig } from "swr";

/**
 * App-wide SWR defaults. The big lever here is read reduction: most data hooks
 * are backed by authed API routes that read Firestore on every call, so an
 * unthrottled "revalidate on every mount + every window focus" pattern quietly
 * burns through Firestore quota.
 *
 * Defaults below cascade to every useSWR call that doesn't set its own option:
 *   - revalidateOnFocus: false  → no refetch storm when the tab regains focus
 *   - dedupingInterval: 30s     → navigating away and back reuses cache instead
 *                                 of re-hitting the API
 *   - keepPreviousData          → smoother UI while a key changes
 *
 * Per-hook options still win (e.g. a hook that genuinely wants focus revalidation
 * can opt back in), so this is a safe global floor, not a hard override.
 */
export default function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        dedupingInterval: 30_000,
        keepPreviousData: true,
      }}
    >
      {children}
    </SWRConfig>
  );
}
