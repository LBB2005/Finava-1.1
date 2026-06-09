"use client";

/**
 * A small circular usage gauge that fills clockwise with the weekly allowance %.
 * Uses the design-system accent (light track + solid accent arc), shifting to the
 * bear color when over the limit. Lives next to the account chevron in the sidebar.
 */
export type UsageTone = "accent" | "over";

export default function UsageRing({
  pct,
  size = 18,
  stroke = 2.5,
  tone = "accent",
}: {
  pct: number;
  size?: number;
  stroke?: number;
  tone?: UsageTone;
}) {
  const center = size / 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct || 0));
  const offset = c * (1 - clamped / 100);
  const color = tone === "over" ? "var(--color-bear)" : "var(--color-accent)";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ display: "block" }}>
      <circle cx={center} cy={center} r={r} fill="none" stroke="var(--color-accent-medium)" strokeWidth={stroke} />
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
        style={{ transition: "stroke-dashoffset 600ms ease, stroke 300ms ease" }}
      />
    </svg>
  );
}
