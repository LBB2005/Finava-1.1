/**
 * House chart style — the single source of chart styling for both Recharts
 * charts and hand-rolled SVG charts. See docs/design-system.md §10.
 *
 * - Series colors come from the theme-aware --chart-* tokens (chart-1 = accent).
 * - Axes: micro mono labels in muted ink, no axis/tick lines.
 * - Gridlines and reference/estimated lines share ONE dash rhythm: "3 4".
 * - Tooltips: bg card, hairline border, shadow-pop (use <ChartTooltip/>).
 */

/** Categorical series palette (theme-aware via CSS variables). */
export const CHART_SERIES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
] as const;

export function seriesColor(i: number): string {
  return CHART_SERIES[i % CHART_SERIES.length];
}

/** The one dash rhythm for gridlines + reference/estimated lines. */
export const CHART_DASH = "3 4";

/** Recharts <CartesianGrid> props. */
export const gridProps = {
  strokeDasharray: CHART_DASH,
  stroke: "var(--color-border)",
  vertical: false,
} as const;

/** Recharts <XAxis>/<YAxis> shared props (spread onto both). */
export const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: {
    fill: "var(--color-muted)",
    fontSize: 10,
    fontFamily: "var(--font-mono)",
  },
} as const;

interface TooltipEntry {
  name?: string | number;
  value?: number | string;
  color?: string;
  // Recharts payload entries carry extra fields we don't need.
  [key: string]: unknown;
}

interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: TooltipEntry[];
  /** Format a numeric value for display (default: locale string). */
  formatValue?: (v: number | string, entry: TooltipEntry) => string;
}

/** The shared Recharts tooltip: pass as `content={<ChartTooltip />}`. */
export function ChartTooltip({ active, label, payload, formatValue }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{
        background: "var(--color-bg)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-sm)",
        boxShadow: "var(--shadow-pop)",
        padding: "7px 10px",
        fontSize: "var(--text-meta)",
      }}
    >
      {label !== undefined && label !== "" && (
        <p
          className="mono"
          style={{
            fontSize: "var(--text-micro)",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--color-muted)",
            marginBottom: 4,
          }}
        >
          {label}
        </p>
      )}
      {payload.map((entry, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {entry.color && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: entry.color,
                flexShrink: 0,
              }}
            />
          )}
          {entry.name !== undefined && (
            <span style={{ color: "var(--color-text-secondary)" }}>{entry.name}</span>
          )}
          <span className="mono" style={{ fontWeight: 600, color: "var(--color-text)", marginLeft: "auto", paddingLeft: 10 }}>
            {formatValue
              ? formatValue(entry.value ?? "", entry)
              : typeof entry.value === "number"
                ? entry.value.toLocaleString("en-US", { maximumFractionDigits: 2 })
                : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}
