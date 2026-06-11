"use client";
import useSWR from "swr";
import type { Theme } from "@/lib/researchAI";

interface ThemesResponse {
  themes: Theme[];
  asOf: string;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

/** AI-generated S&P 500 themes. Server-cached (6h) and editorial, so we don't
 *  poll — fetch once and keep it for the session. */
export function useThemes() {
  const { data, error, isLoading, mutate } = useSWR<ThemesResponse>("/api/research/themes", fetcher, {
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
