"use client";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";
import type { BacktestResult as BacktestResultType } from "@/app/api/backtest/route";

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 3,
        padding: "12px 16px",
        borderRadius: 10,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        flex: "1 1 0",
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-muted)" }}>
        {label}
      </span>
      <span style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono)", color: color ?? "var(--color-text)", letterSpacing: "-0.02em" }}>
        {value}
      </span>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "8px 12px", fontSize: 12, boxShadow: "var(--shadow-pop)" }}>
      <p style={{ color: "var(--color-muted)", marginBottom: 4, fontSize: 11 }}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color, fontWeight: 600 }}>
          {p.name}: {p.value >= 0 ? "+" : ""}{p.value.toFixed(2)}%
        </p>
      ))}
    </div>
  );
}

export default function BacktestResult({ result }: { result: BacktestResultType }) {
  const { config, series, sharpe, maxDrawdown, cagr, winRate, summary } = result;
  const finalPort = series[series.length - 1]?.portfolio ?? 0;
  const finalBench = series[series.length - 1]?.benchmark ?? 0;
  const portColor = finalPort >= finalBench ? "var(--color-bull)" : "var(--color-bear)";
  const benchColor = "var(--color-accent)";

  const strategyLabel: Record<string, string> = {
    buy_hold: "Buy & Hold",
    equal_weight: "Equal Weight",
    momentum: "Momentum",
  };

  const tickerPills = config.tickers.map((t) => (
    <span
      key={t}
      style={{
        fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
        background: "var(--color-accent-light)", color: "var(--color-accent)",
      }}
    >
      {t}
    </span>
  ));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--color-backtest, #0369a1)", fontWeight: 700, marginBottom: 4 }}>
            Backtest Result
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {tickerPills}
            <span style={{ fontSize: 11, color: "var(--color-muted)", fontStyle: "italic", fontFamily: "var(--font-serif)" }}>
              {strategyLabel[config.strategy] ?? config.strategy} · {config.startDate} → {config.endDate}
            </span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div
        style={{
          borderRadius: 14,
          border: "1px solid var(--color-border)",
          background: "var(--color-bg)",
          padding: "16px 16px 8px",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-text)" }}>
            Cumulative Return vs {config.benchmark}
          </span>
          <span style={{ fontSize: 11, fontStyle: "italic", fontFamily: "var(--font-serif)", color: "var(--color-muted)" }}>
            {series.length} data points
          </span>
        </div>
        <ResponsiveContainer width="100%" height={210}>
          <AreaChart data={series} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="bt-port" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={portColor} stopOpacity={0.2} />
                <stop offset="95%" stopColor={portColor} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="bt-bench" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.12} />
                <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "var(--color-muted)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(d: string) => d.slice(0, 7)}
              interval={Math.floor(series.length / 6)}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--color-muted)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              formatter={(value: string) => value === "portfolio" ? strategyLabel[config.strategy] : config.benchmark}
            />
            <Area
              type="monotone"
              dataKey="portfolio"
              stroke={portColor}
              strokeWidth={2}
              fill="url(#bt-port)"
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Area
              type="monotone"
              dataKey="benchmark"
              stroke={benchColor}
              strokeWidth={1.5}
              strokeDasharray="4 2"
              fill="url(#bt-bench)"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Stat label="CAGR" value={`${cagr >= 0 ? "+" : ""}${cagr}%`} color={cagr >= 0 ? "var(--color-bull)" : "var(--color-bear)"} />
        <Stat label="Sharpe" value={String(sharpe)} color={sharpe >= 1 ? "var(--color-bull)" : sharpe >= 0 ? "var(--color-text)" : "var(--color-bear)"} />
        <Stat label="Max Drawdown" value={`${maxDrawdown}%`} color={maxDrawdown < -20 ? "var(--color-bear)" : "var(--color-text)"} />
        <Stat label="Win Rate" value={`${winRate}%`} color={winRate >= 50 ? "var(--color-bull)" : "var(--color-bear)"} />
      </div>

      {/* Summary */}
      {summary && (
        <p style={{ fontSize: 13, lineHeight: 1.65, color: "var(--color-text-secondary)", fontStyle: "italic", fontFamily: "var(--font-serif)", margin: 0 }}>
          {summary}
        </p>
      )}

      {/* Footer */}
      <p style={{ fontSize: 10.5, color: "var(--color-muted)", margin: 0, letterSpacing: "0.02em" }}>
        Historical simulation · past performance does not predict future results · not financial advice
      </p>
    </div>
  );
}
