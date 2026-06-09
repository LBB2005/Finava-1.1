"use client";
import useSWR from "swr";
import type { Holding } from "@/types/portfolio";
import { authFetch, authFetcher } from "@/lib/authFetch";
import { useAuth } from "@/context/AuthContext";
import { usePlaidStatus } from "@/hooks/usePlaidStatus";
import { DEV_HOLDINGS, DEV_CASH } from "@/lib/devPortfolio";

export function usePortfolio() {
  // Under the dev auth bypass the "dev-bypass" sentinel still authenticates
  // server-side (requireAuth maps it to uid "dev-user" outside production), so
  // we CAN read the real Firestore book. We fetch it and fall back to the seeded
  // mock only when that book is empty — this keeps the default design-time DX
  // (mock shows) while letting Plaid-synced holdings appear once imported.
  const { devBypass } = useAuth();
  const { plaidConnected, plaidInstitutions, mutatePlaidStatus } = usePlaidStatus();

  const { data, error, isLoading, mutate } = useSWR<Holding[]>(
    "/api/portfolio",
    authFetcher,
    { revalidateOnFocus: false }
  );

  const { data: settingsData, mutate: mutateSettings } = useSWR<{ cashBalance: number }>(
    "/api/portfolio/settings",
    authFetcher,
    { revalidateOnFocus: false }
  );

  async function setCashBalance(cashBalance: number) {
    await authFetch("/api/portfolio/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cashBalance }),
    });
    await mutateSettings();
  }

  async function addHolding(holding: Omit<Holding, "id" | "createdAt" | "updatedAt">) {
    const res = await authFetch("/api/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(holding),
    });
    if (!res.ok) throw new Error("Failed to add holding");
    await mutate();
  }

  async function removeHolding(id: string) {
    const res = await authFetch(`/api/portfolio/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to remove holding");
    await mutate();
  }

  async function uploadCsv(file: File): Promise<{ imported: number; failed: number }> {
    const form = new FormData();
    form.append("file", file);
    const res = await authFetch("/api/portfolio/csv", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Upload failed");
    await mutate();
    return data;
  }

  /** Revalidate holdings, cash, and connection status — e.g. after a Plaid sync. */
  async function refresh() {
    await Promise.all([mutate(), mutateSettings(), mutatePlaidStatus()]);
  }

  /** Re-pull the linked brokerage(s) and rebuild the book. */
  async function syncPlaid() {
    const res = await authFetch("/api/plaid/sync", { method: "POST" });
    if (!res.ok) throw new Error("Failed to sync");
    await refresh();
  }

  /** Disconnect Plaid — keeps holdings but converts them to editable manual entries. */
  async function disconnectPlaid() {
    const res = await authFetch("/api/plaid/disconnect", { method: "POST" });
    if (!res.ok) throw new Error("Failed to disconnect");
    await refresh();
  }

  const realHoldings = Array.isArray(data) ? data : [];
  const useMockHoldings = devBypass && realHoldings.length === 0;

  return {
    holdings: useMockHoldings ? DEV_HOLDINGS : realHoldings,
    cashBalance: useMockHoldings && settingsData?.cashBalance == null
      ? DEV_CASH
      : (settingsData?.cashBalance ?? 0),
    error,
    isLoading,
    mutate,
    refresh,
    addHolding,
    removeHolding,
    uploadCsv,
    setCashBalance,
    // Plaid
    plaidConnected,
    plaidInstitutions,
    syncPlaid,
    disconnectPlaid,
  };
}
