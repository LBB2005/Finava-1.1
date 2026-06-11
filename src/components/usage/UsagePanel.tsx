"use client";

// Mirror of the GET /api/usage payload (kept local so client code never imports
// the server-only usage module).
export interface UsageSummary {
  plan: string;
  daily: { used: number; limit: number | null; pct: number };
  weekly: { used: number; limit: number | null; pct: number };
  series: { date: string; credits: number }[];
  resets: { daily: string; weekly: string };
}

function Meter({
  label,
  used,
  limit,
  pct,
  over,
}: {
  label: string;
  used: number;
  limit: number | null;
  pct: number;
  over: boolean;
}) {
  const unlimited = limit === null;
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-[11px] font-semibold" style={{ color: "var(--color-text)" }}>
          {label}
        </span>
        <span className="text-[10.5px]" style={{ color: "var(--color-text-secondary)" }}>
          {unlimited ? `${Math.round(used)} · Unlimited` : `${Math.round(used)} / ${limit}`}
        </span>
      </div>
      <div className="h-[5px] rounded-full overflow-hidden" style={{ background: "var(--color-surface-2)" }}>
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: unlimited ? "100%" : `${Math.min(100, pct)}%`,
            background: over ? "var(--color-bear)" : "var(--color-accent)",
            opacity: unlimited ? 0.25 : 1,
          }}
        />
      </div>
    </div>
  );
}

/** Inner content of the sidebar usage popover (the wrapper/positioning lives in the caller). */
export default function UsagePanel({
  data,
  onSeeDetails,
}: {
  data: UsageSummary;
  onSeeDetails: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12.5px] font-bold" style={{ color: "var(--color-text)" }}>
          Usage
        </span>
        <span
          className="text-[10px] font-semibold px-2 py-[3px] rounded-full"
          style={{ background: "var(--color-surface)", color: "var(--color-text-secondary)" }}
        >
          {data.plan}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <Meter
          label="This week"
          used={data.weekly.used}
          limit={data.weekly.limit}
          pct={data.weekly.pct}
          over={data.weekly.pct >= 100}
        />
        <Meter
          label="Today"
          used={data.daily.used}
          limit={data.daily.limit}
          pct={data.daily.pct}
          over={data.daily.pct >= 100}
        />
      </div>

      <p className="text-[10.5px] mt-3 leading-snug" style={{ color: "var(--color-muted)" }}>
        Weekly is a rolling 7-day window; daily resets at midnight UTC.
      </p>

      <button
        onClick={onSeeDetails}
        className="w-full mt-3 inline-flex items-center justify-center gap-1.5 py-[7px] rounded-[8px] text-[12px] font-semibold transition-colors duration-150"
        style={{ background: "var(--color-accent)", color: "#fff" }}
      >
        See details
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </button>
    </>
  );
}
