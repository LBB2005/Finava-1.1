"use client";
// The one SWR contract for GET /api/stock/[ticker]/dcf. The rail and the DCF
// chapter share this key — a single hook guarantees they also share one
// fetcher/shape (two different fetchers on the same key poison each other's
// SWR cache). Returns the unwrapped DcfInputs; 404 = insufficient data.

import useSWR from "swr";
import type { DcfInputs } from "@/lib/dcf";

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`);
    return body.inputs as DcfInputs;
  });

export function useDcfInputs(ticker: string | null) {
  return useSWR<DcfInputs>(
    ticker ? `/api/stock/${encodeURIComponent(ticker.toUpperCase())}/dcf` : null,
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false, dedupingInterval: 300_000 }
  );
}
