"use client";
import Link from "next/link";
import useSWR from "swr";
import { authFetcher } from "@/lib/authFetch";
import type { LensTone } from "@/types/dna";

interface LensResponse {
  line: string | null;
  tone?: LensTone;
  href?: string;
}

/**
 * The Lens — one quiet, personalized whisper on a stock page, drawn from the
 * user's Investor DNA. Renders nothing when there's nothing personal to say
 * (no DNA, ticker unscored, or the feature is off), so it never adds noise.
 */
export default function InvestorLens({ ticker }: { ticker: string }) {
  const { data } = useSWR<LensResponse>(
    ticker ? `/api/dna/lens?ticker=${encodeURIComponent(ticker)}` : null,
    authFetcher,
    { revalidateOnFocus: false }
  );

  if (!data?.line) return null;

  const tone: LensTone = data.tone ?? "neutral";
  const toneColor =
    tone === "edge" ? "var(--color-bull)" : tone === "caution" ? "var(--color-bear)" : "var(--color-accent)";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "9px var(--page-gutter)",
      borderBottom: "1px solid var(--color-border)",
      background: `color-mix(in oklab, ${toneColor} 7%, var(--color-bg))`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: 99, flexShrink: 0, background: toneColor,
        boxShadow: `0 0 0 3px color-mix(in oklab, ${toneColor} 22%, transparent)`,
      }} />
      <span style={{ fontSize: 13, color: "var(--color-text)", lineHeight: 1.4 }}>{data.line}</span>
      <Link
        href={data.href ?? "/dna"}
        style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: "var(--color-accent)", whiteSpace: "nowrap" }}
      >
        Your DNA →
      </Link>
    </div>
  );
}
