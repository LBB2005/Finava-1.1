"use client";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";
import { CHART_SERIES as PALETTE, CHART_TICK } from "@/lib/chartPalette";

export interface ChartData {
  type: "bar" | "line" | "area" | "donut";
  title?: string;
  description?: string;
  unit?: string;
  data: Array<{ name: string; value: number; color?: string; [key: string]: unknown }>;
  series?: Array<{ key: string; color?: string; label?: string }>;
}

function fmt(val: number, unit?: string) {
  if (unit === "%" || unit === "percent") return `${val > 0 ? "+" : ""}${val.toFixed(1)}%`;
  if (unit === "$" || unit === "usd") return `$${Math.abs(val).toLocaleString()}`;
  return `${val.toLocaleString()}${unit ? ` ${unit}` : ""}`;
}

function valueColor(v: number) {
  return v >= 0 ? "var(--color-bull)" : "var(--color-bear)";
}

// Tooltip component
function CustomTooltip({ active, payload, label, unit }: { active?: boolean; payload?: Array<{value: number; name: string; color: string}>; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-lg px-3 py-2.5 text-xs">
      <p className="font-semibold text-[var(--color-text)] mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-medium">
          {p.name !== "value" ? `${p.name}: ` : ""}{fmt(p.value, unit)}
        </p>
      ))}
    </div>
  );
}

function BarChartView({ data, unit, series }: ChartData) {
  const isMultiSeries = series && series.length > 0;
  const isPercentage = unit === "%" || unit === "percent";

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }} barSize={isMultiSeries ? 12 : 24}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: CHART_TICK }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: CHART_TICK }} axisLine={false} tickLine={false}
          tickFormatter={(v) => isPercentage ? `${v}%` : v} />
        <Tooltip content={<CustomTooltip unit={unit} />} />
        {isMultiSeries && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {isMultiSeries
          ? series!.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.label ?? s.key}
                fill={s.color ?? PALETTE[i % PALETTE.length]} radius={[4, 4, 0, 0]} />
            ))
          : (
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color ?? (isPercentage ? valueColor(entry.value) : PALETTE[i % PALETTE.length])} />
              ))}
            </Bar>
          )}
      </BarChart>
    </ResponsiveContainer>
  );
}

function LineChartView({ data, unit, series }: ChartData) {
  const keys = series?.length ? series : [{ key: "value", color: PALETTE[0] }];
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: CHART_TICK }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: CHART_TICK }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip unit={unit} />} />
        {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {keys.map((s, i) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label ?? s.key}
            stroke={s.color ?? PALETTE[i % PALETTE.length]} strokeWidth={2}
            dot={{ r: 3, fill: s.color ?? PALETTE[i % PALETTE.length] }} activeDot={{ r: 5 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function AreaChartView({ data, unit, series }: ChartData) {
  const keys = series?.length ? series : [{ key: "value", color: PALETTE[0] }];
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <defs>
          {keys.map((s, i) => (
            <linearGradient key={s.key} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={s.color ?? PALETTE[i % PALETTE.length]} stopOpacity={0.25} />
              <stop offset="95%" stopColor={s.color ?? PALETTE[i % PALETTE.length]} stopOpacity={0.03} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: CHART_TICK }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: CHART_TICK }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip unit={unit} />} />
        {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {keys.map((s, i) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.label ?? s.key}
            stroke={s.color ?? PALETTE[i % PALETTE.length]} strokeWidth={2}
            fill={`url(#grad-${i})`} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function DonutChartView({ data, unit }: ChartData) {
  const total = data.reduce((s, d) => s + Math.abs(d.value), 0);
  return (
    <div className="flex items-center gap-6">
      <ResponsiveContainer width={160} height={160}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={48} outerRadius={72}
            dataKey="value" strokeWidth={2} stroke="var(--color-surface)" paddingAngle={2}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color ?? PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => [fmt(Number(v), unit), ""]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-col gap-1.5 min-w-0">
        {data.map((entry, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: entry.color ?? PALETTE[i % PALETTE.length] }} />
            <span className="text-xs font-semibold text-[var(--color-text)] w-16 truncate">{entry.name}</span>
            <span className="text-xs text-[var(--color-muted)]">
              {total > 0 ? `${((Math.abs(entry.value) / total) * 100).toFixed(1)}%` : fmt(entry.value, unit)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ChartBlock({ raw }: { raw: string }) {
  let chart: ChartData;
  try {
    chart = JSON.parse(raw) as ChartData;
    if (!chart.data || !Array.isArray(chart.data)) throw new Error("invalid");
  } catch {
    return (
      <div
        className="my-3 p-3 rounded-xl border text-xs"
        style={{
          borderColor: "color-mix(in srgb, var(--color-bear) 35%, transparent)",
          background: "color-mix(in srgb, var(--color-bear) 8%, transparent)",
          color: "var(--color-bear)",
        }}
      >
        Invalid chart data
      </div>
    );
  }

  return (
    <div className="my-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm overflow-hidden">
      {(chart.title || chart.description) && (
        <div className="px-4 pt-3.5 pb-2 border-b border-[var(--color-border)]">
          {chart.title && <p className="text-sm font-semibold text-[var(--color-text)]">{chart.title}</p>}
          {chart.description && <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{chart.description}</p>}
        </div>
      )}
      <div className="px-4 py-4">
        {chart.type === "bar" && <BarChartView {...chart} />}
        {chart.type === "line" && <LineChartView {...chart} />}
        {chart.type === "area" && <AreaChartView {...chart} />}
        {chart.type === "donut" && <DonutChartView {...chart} />}
      </div>
    </div>
  );
}
