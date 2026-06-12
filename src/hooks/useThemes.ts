"use client";
import useSWR from "swr";
import { authFetcher } from "@/lib/authFetch";
import type { Theme } from "@/lib/researchAI";

interface ThemesResponse {
  themes: Theme[];
  asOf: string;
}

/** AI-generated S&P 500 themes. Server-cached (6h) and editorial, so we don't
 *  poll — fetch once and keep it for the session. The route is authenticated,
 *  so send the Firebase token via authFetcher. */
export function useThemes() {
  const { data, error, isLoading, mutate } = useSWR<ThemesResponse>("/api/research/themes", authFetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    dedupingInterval: 60 * 60 * 1000,
  });
  return {
    themes: data?.themes ?? null,
    asOf: data?.asOf ?? null,
    error,
    isLoading,
    retry: () => mutate(),
  };
}
