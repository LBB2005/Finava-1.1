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
      <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text)", lineHeight: 1.4 }}>{data.line}</span>
      <Link
        href={data.href ?? "/dna"}
        style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--text-meta)", fontWeight: 600, color: "var(--color-accent)", whiteSpace: "nowrap" }}
      >
        Your DNA
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </Link>
    </div>
  );
}
