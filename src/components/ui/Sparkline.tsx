/**
 * The one sparkline. Replaces the near-identical copies that lived in
 * portfolio and watchlist. Colors by direction (bull/bear)
 * unless an explicit stroke is given.
 */
interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  /** Explicit stroke color; defaults to bull/bear by first→last direction. */
  stroke?: string;
  /** Soft area fill under the line (off by default). */
  fill?: boolean;
  className?: string;
}

export default function Sparkline({
  data,
  width = 64,
  height = 20,
  strokeWidth = 1.5,
  stroke,
  fill = false,
  className,
}: SparklineProps) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = strokeWidth;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (width - pad * 2) + pad;
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const up = data[data.length - 1] >= data[0];
  const color = stroke ?? (up ? "var(--color-bull)" : "var(--color-bear)");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
    >
      {fill && (
        <polygon
          points={`${pad},${height - pad} ${line} ${width - pad},${height - pad}`}
          fill={color}
          opacity={0.12}
        />
      )}
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
