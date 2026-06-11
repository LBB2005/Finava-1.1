"use client";
import { useElapsedSeconds } from "@/hooks/useElapsedSeconds";
import { formatDuration } from "@/lib/formatDuration";

/**
 * The "Quiet" response timer (design A): a live tabular-mono count-up while the
 * assistant is thinking, and a frozen "Analyzed in Ns" receipt under the
 * finished message. Both share `formatDuration` so they read identically.
 */

/** Live count-up digits (e.g. "8s"), ticking once a second. Renders nothing
 *  until a stream has started. Caller supplies any surrounding label/separator. */
export function LiveElapsed({
  startedAt,
  className,
  style,
}: {
  startedAt: number | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  const seconds = useElapsedSeconds(startedAt);
  if (startedAt == null) return null;
  return (
    <span
      className={className}
      style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", ...style }}
    >
      {formatDuration(seconds * 1000)}
    </span>
  );
}

/** Frozen receipt: hairline clock + "Analyzed in Ns" in muted tertiary text. */
export function ResponseReceipt({ durationMs }: { durationMs?: number }) {
  if (typeof durationMs !== "number") return null;
  return (
    <span
      className="fade-in"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        color: "var(--color-muted)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 7 12 12 15.5 14" />
      </svg>
      Analyzed in {formatDuration(durationMs)}
    </span>
  );
}
