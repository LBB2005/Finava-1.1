"use client";
import useSWR from "swr";
import { authFetcher } from "@/lib/authFetch";

export interface PlaidInstitution {
  itemId: string;
  name: string | null;
  lastSyncedAt: string | null;
}

interface PlaidStatus {
  connected: boolean;
  institutions: PlaidInstitution[];
}

/**
 * Whether the user has a brokerage linked via Plaid. SWR dedupes by key, so
 * calling this in several components issues a single request.
 */
export function usePlaidStatus() {
  const { data, mutate, isLoading } = useSWR<PlaidStatus>("/api/plaid/status", authFetcher, {
    revalidateOnFocus: false,
  });
  return {
    plaidConnected: data?.connected ?? false,
    plaidInstitutions: data?.institutions ?? [],
    plaidStatusLoading: isLoading,
    mutatePlaidStatus: mutate,
  };
}
