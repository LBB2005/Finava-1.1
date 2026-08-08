"use client";
// Cached-first bridge for the Finava verdict: fetches the per-user cached run
// (GET /api/stock/[ticker]/verdict) and seeds finavaStore with it, so the
// intelligence rail, Overview Read, and Finava tab all render the last
// completed analysis with zero LLM spend. 404 = never run → callers show the
// Generate state.

import { useEffect } from "react";
import useSWR from "swr";
import { authFetcher } from "@/lib/authFetch";
import { hydrateFinava } from "@/lib/finavaStore";
import type { FinavaSignal, FinavaVerdict } from "@/lib/finava";

export interface CachedVerdictResponse {
  verdict: FinavaVerdict;
  signals: FinavaSignal[];
  updatedAt: string;
}

export function useVerdictCache(ticker: string | null) {
  const sym = ticker ? ticker.toUpperCase() : null;
  const { data, error, isLoading } = useSWR<CachedVerdictResponse>(
    sym ? `/api/stock/${encodeURIComponent(sym)}/verdict` : null,
    authFetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false, dedupingInterval: 60_000 }
  );

  useEffect(() => {
    if (sym && data?.verdict) {
      hydrateFinava(sym, { signals: data.signals ?? [], verdict: data.verdict }, data.updatedAt);
    }
  }, [sym, data]);

  return {
    cached: data ?? null,
    /** True once we know there is no cached run (404 or fetch failure). */
    neverRun: !!error,
    resolving: isLoading,
  };
}

/** "2d ago" style age for the verdict cells. */
export function verdictAge(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Age > 30 days renders in warn color to nudge a refresh (spec §1). */
export function verdictIsStale(iso: string | null): boolean {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() > 30 * 24 * 60 * 60 * 1000;
}
