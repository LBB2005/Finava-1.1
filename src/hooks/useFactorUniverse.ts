"use client";
import useSWR from "swr";
import type { Stock } from "@/lib/research";

interface FactorResponse {
  stocks: Stock[];
  asOf: string;
  coverage: { total: number; fundamentals: number; analyst: number; momentum: number; priced: number };
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

/**
 * The full S&P 500 scored on all six Lucra factors from real data (Polygon
 * fundamentals, Alpaca momentum, Finnhub analyst). Computed server-side and
 * memoised there; we refresh every 5 minutes so analyst coverage fills in as
 * the upstream cache warms. The Tune lens re-ranks this universe client-side
 * on every weight change, so slider tweaks are instant — only the underlying
 * scores come from the network.
 */
export function useFactorUniverse() {
  const { data, error, isLoading } = useSWR<FactorResponse>(
    "/api/research/factors",
    fetcher,
    {
      refreshInterval: 5 * 60 * 1000,
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
      keepPreviousData: true,
    }
  );

  return {
    universe: data?.stocks ?? null,
    coverage: data?.coverage ?? null,
    error,
    isLoading,
    loaded: !!data,
  };
}
