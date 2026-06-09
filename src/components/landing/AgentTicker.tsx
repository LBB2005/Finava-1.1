import { AGENTS } from "./agentData";

// Always-on band: two rows of agent pills scroll in opposite directions with
// live-looking read-outs, fading at the edges. "15 specialists, always running."
function Pill({ name, value, color }: { name: string; value: string; color: string }) {
  return (
    <span className="lp-tick-pill">
      <span className="lp-tick-dot" style={{ background: color }} />
      {name}
      <b style={{ color }}>{value}</b>
    </span>
  );
}

function Track({ agents, dir }: { agents: typeof AGENTS; dir: "l" | "r" }) {
  // duplicate the list so the -50% translate loops seamlessly
  const doubled = [...agents, ...agents];
  return (
    <div className="lp-tick-row" aria-hidden>
      <div className={dir === "l" ? "lp-tick-track lp-tick-l" : "lp-tick-track lp-tick-r"}>
        {doubled.map((a, i) => (
          <Pill key={`${a.name}-${i}`} name={a.name} value={a.value} color={a.color} />
        ))}
      </div>
    </div>
  );
}

export default function AgentTicker() {
  const mid = Math.ceil(AGENTS.length / 2);
  const top = AGENTS.slice(0, mid);
  const bottom = AGENTS.slice(mid);
  return (
    <section
      className="lp-ticker border-y border-[var(--lp-border)] bg-[var(--lp-bg-2)] py-7 overflow-hidden"
      aria-label="The 15 specialist agents, always running"
    >
      <div className="max-w-[1140px] mx-auto px-5 sm:px-8 mb-4">
        <span className="lp-eyebrow text-[var(--lp-muted)]">Working in the background, every query</span>
      </div>
      <div className="flex flex-col gap-3">
        <Track agents={top} dir="l" />
        <Track agents={bottom} dir="r" />
      </div>
    </section>
  );
}
