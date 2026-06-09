"use client";
import useSWR from "swr";
import type { Quote } from "@/types/portfolio";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

export function useQuotes(tickers: string[]) {
  const key =
    tickers.length > 0 ? `/api/quotes?tickers=${tickers.join(",")}` : null;

  const { data, error, isLoading } = useSWR<Quote[]>(key, fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
  });

  const quoteMap = new Map<string, Quote>();
  (data ?? []).forEach((q) => quoteMap.set(q.ticker, q));

  return { quoteMap, error, isLoading };
}
