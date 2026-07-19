type Cell = { v: "yes" | "no" | "warn"; note?: string } | { v: "text"; note: string };

const COLS = ["Finava", "Seeking Alpha", "Bloomberg", "ChatGPT"];

const ROWS: { label: string; cells: Cell[] }[] = [
  {
    label: "Multi-angle AI analysis",
    cells: [
      { v: "yes", note: "15 agents" },
      { v: "no", note: "One writer's view" },
      { v: "no", note: "Raw data only" },
      { v: "warn", note: "No real-time data" },
    ],
  },
  {
    label: "Real SEC EDGAR data",
    cells: [{ v: "yes" }, { v: "no" }, { v: "yes" }, { v: "no" }],
  },
  {
    label: "Insider transaction analysis",
    cells: [{ v: "yes" }, { v: "no" }, { v: "yes" }, { v: "no" }],
  },
  {
    label: "Conversational interface",
    cells: [{ v: "yes" }, { v: "no" }, { v: "no" }, { v: "yes" }],
  },
  {
    label: "Portfolio integration",
    cells: [{ v: "yes" }, { v: "no" }, { v: "yes" }, { v: "no" }],
  },
  {
    label: "Price",
    cells: [
      { v: "text", note: "$25–$59/mo" },
      { v: "text", note: "$299/yr" },
      { v: "text", note: "$32,000/yr" },
      { v: "text", note: "$20/mo" },
    ],
  },
  {
    label: "Built for retail investors",
    cells: [{ v: "yes" }, { v: "yes" }, { v: "no" }, { v: "warn" }],
  },
];

function Glyph({ cell, highlight }: { cell: Cell; highlight: boolean }) {
  if (cell.v === "text") {
    return (
      <span
        className={`text-[13.5px] font-semibold ${
          highlight ? "text-[var(--lp-accent-2)]" : "text-[var(--lp-text)]"
        }`}
      >
        {cell.note}
      </span>
    );
  }
  const map = {
    yes: { ch: "✓", cls: "text-[var(--lp-bull)] bg-[color-mix(in_srgb,var(--lp-bull)_12%,transparent)]" },
    no: { ch: "✕", cls: "text-[var(--lp-bear)] bg-[color-mix(in_srgb,var(--lp-bear)_10%,transparent)]" },
    // No --lp-warn token exists; keep the amber hue as a single hex constant.
    warn: { ch: "!", cls: "text-[#fbbf24] bg-[color-mix(in_srgb,#fbbf24_12%,transparent)]" },
  }[cell.v];
  return (
    <span className="inline-flex flex-col items-center gap-1">
      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[13px] font-bold ${map.cls}`}>
        {map.ch}
      </span>
      {cell.note && (
        <span className="text-[11px] text-[var(--lp-muted)] leading-tight text-center">
          {cell.note}
        </span>
      )}
    </span>
  );
}

export default function Comparison() {
  return (
    <section className="bg-[var(--lp-bg-2)] border-y border-[var(--lp-border)]">
      <div className="max-w-[1140px] mx-auto px-5 sm:px-8 py-24 md:py-28">
        <div className="max-w-2xl mb-12">
          <span className="lp-eyebrow text-[var(--lp-accent-2)]">Where Finava fits</span>
          <h2 className="lp-display mt-3 text-[clamp(1.9rem,4vw,2.8rem)] font-bold text-[var(--lp-text)]">
            Finally, something that belongs in the middle.
          </h2>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block lp-card rounded-2xl overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left p-5 text-[13px] font-medium text-[var(--lp-muted)] w-[34%]" />
                {COLS.map((c, i) => (
                  <th
                    key={c}
                    className={`p-5 text-center text-[15px] font-bold ${
                      i === 0 ? "text-[var(--lp-accent-2)]" : "text-[var(--lp-text)]"
                    }`}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.label} className="border-t border-[var(--lp-border)]">
                  <td className="p-5 text-[14px] font-medium text-[var(--lp-text-secondary)]">
                    {r.label}
                  </td>
                  {r.cells.map((cell, i) => (
                    <td
                      key={i}
                      className={`p-5 text-center ${i === 0 ? "bg-[var(--lp-accent-soft)]" : ""}`}
                    >
                      <Glyph cell={cell} highlight={i === 0} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile stacked cards */}
        <div className="md:hidden space-y-4">
          {COLS.map((col, ci) => (
            <div key={col} className="lp-card rounded-2xl p-5">
              <h3
                className={`text-[16px] font-bold mb-3 ${
                  ci === 0 ? "text-[var(--lp-accent-2)]" : "text-[var(--lp-text)]"
                }`}
              >
                {col}
              </h3>
              <div className="space-y-2.5">
                {ROWS.map((r) => (
                  <div key={r.label} className="flex items-center justify-between gap-4">
                    <span className="text-[13px] text-[var(--lp-text-secondary)]">{r.label}</span>
                    <Glyph cell={r.cells[ci]} highlight={ci === 0} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
