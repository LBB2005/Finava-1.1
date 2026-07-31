"use client";
import type { ReactNode } from "react";
import ConnectBrokerageButton from "@/components/portfolio/ConnectBrokerageButton";

/**
 * Shown when there's no DNA to render. Distinguishes "turned off" from "no
 * holdings yet" (the funnel — link a brokerage) from "holdings outside coverage".
 */
export default function DnaEmptyState({ hasHoldings, allowed, uncovered = [], onLinked }: {
  hasHoldings: boolean;
  allowed: boolean;
  uncovered?: string[];
  onLinked: () => void;
}) {
  if (!allowed) {
    return (
      <Centered
        title="Investor DNA is turned off"
        body="Turn it back on in Settings → Privacy & data to let Finava learn how you actually invest."
      />
    );
  }
  if (hasHoldings) {
    const list = uncovered.slice(0, 10).join(", ");
    return (
      <Centered
        title="None of these are covered yet"
        body={`Investor DNA reads US stocks, major ADRs, and the most-held ETFs${list ? ` — but not ${list}` : ""}. Bonds, crypto, and very small names fall outside the factor model for now.`}
      />
    );
  }
  return (
    <Centered
      title="Let's build your Investor DNA"
      body="Link a brokerage and Finava reads your real positions to show how you invest — your edge, your tilt, your blind spots. Nothing to fill out."
      cta={<ConnectBrokerageButton className="tbtn on" label="Connect brokerage" onLinked={onLinked} />}
    />
  );
}

function Centered({ title, body, cta }: { title: string; body: string; cta?: ReactNode }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      textAlign: "center", gap: 12, padding: "64px 24px", minHeight: 240,
    }}>
      <h2 className="serif" style={{ fontSize: "var(--text-display)", fontWeight: 800, color: "var(--color-text)", margin: 0 }}>{title}</h2>
      <p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)", maxWidth: 440, lineHeight: 1.6, margin: 0 }}>{body}</p>
      {cta && <div style={{ marginTop: 6 }}>{cta}</div>}
    </div>
  );
}
