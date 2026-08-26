"use client";

/** The one segmented range/period toggle — Portfolio periods, Stock chart
    ranges and modes, and Research horizons all render this so the control
    reads identically across pages (design-system §8 "Segmented tabs").
    Surface pill track, mono meta labels, accent chip for the active option.
    Outer height is 28px so it sits even with `.tbtn`/`.btn` in control rows. */
export default function RangeToggle<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  /** Optional display label per option (defaults to the option itself). */
  labels?: Partial<Record<T, string>>;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 2,
        background: "var(--color-surface)",
        borderRadius: 999,
        padding: 3,
        flexShrink: 0,
      }}
    >
      {options.map((o) => {
        const on = o === value;
        return (
          <button
            key={o}
            onClick={() => onChange(o)}
            className="mono"
            style={{
              fontSize: "var(--text-meta)",
              fontWeight: 600,
              letterSpacing: "0.03em",
              lineHeight: "16px",
              padding: "3px 10px",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              color: on ? "var(--color-on-accent)" : "var(--color-text-secondary)",
              background: on ? "var(--color-accent)" : "transparent",
              transition: "background 130ms, color 130ms",
            }}
          >
            {labels?.[o] ?? o}
          </button>
        );
      })}
    </div>
  );
}
