"use client";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { authFetcher } from "@/lib/authFetch";
import { useChatStore } from "@/stores/chatStore";
import PageHeader from "@/components/layout/PageHeader";
import IdentityCard from "@/components/dna/IdentityCard";
import TraitRecord from "@/components/dna/TraitRecord";
import Tendencies from "@/components/dna/Tendencies";
import ConvictionLedger from "@/components/dna/ConvictionLedger";
import DnaEmptyState from "@/components/dna/DnaEmptyState";
import type { InvestorDNA } from "@/types/dna";

interface DnaResponse {
  dna: InvestorDNA | null;
  hasHoldings: boolean;
  allowed: boolean;
  uncovered?: string[];
}

export default function DnaPage() {
  const router = useRouter();
  const { setPendingMessage, reset } = useChatStore();
  const { data, isLoading, mutate } = useSWR<DnaResponse>("/api/dna", authFetcher);

  const dna = data?.dna ?? null;
  const subtitle = dna
    ? `${dna.archetype.toUpperCase()} · ${dna.knownness}% KNOWN`
    : "WHAT FINAVA KNOWS ABOUT HOW YOU INVEST";

  function askFinava() {
    reset();
    setPendingMessage("Walk me through my Investor DNA — where's my edge, and what's my biggest blind spot?");
    router.push("/chat");
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <PageHeader
        title="Investor DNA"
        subtitle={subtitle}
        actions={<button className="tbtn on" onClick={askFinava}>ASK FINAVA</button>}
      />

      <div className="flex-1 overflow-y-auto" style={{ scrollbarGutter: "stable both-edges", paddingBottom: "var(--content-pad-bottom)" }}>
        <div style={{
          maxWidth: 920, margin: "0 auto",
          padding: "26px var(--page-gutter) 8px",
          display: "flex", flexDirection: "column", gap: 18,
        }}>
          {isLoading ? (
            <DnaSkeleton />
          ) : !dna ? (
            <DnaEmptyState
              hasHoldings={!!data?.hasHoldings}
              allowed={data?.allowed ?? true}
              uncovered={data?.uncovered ?? []}
              onLinked={() => mutate()}
            />
          ) : (
            <>
              <IdentityCard dna={dna} />
              {dna.coverage.uncovered.length > 0 && (
                <p style={{ fontSize: 12, color: "var(--color-muted)", margin: "-4px 2px 0" }}>
                  Reading {dna.coverage.analyzed} of {dna.coverage.total} holdings · not yet covered:{" "}
                  {dna.coverage.uncovered.slice(0, 8).join(", ")}
                  {dna.coverage.uncovered.length > 8 ? "…" : ""}
                </p>
              )}
              <TraitRecord traits={dna.traitRecord} />
              <Tendencies tendencies={dna.tendencies} />
              <ConvictionLedger />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DnaSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="skeleton" style={{ height: 180, borderRadius: "var(--radius-xl)", border: "1px solid var(--color-border)" }} />
      <div className="skeleton" style={{ height: 230, borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)" }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton" style={{ height: 92, borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)" }} />
        ))}
      </div>
    </div>
  );
}
