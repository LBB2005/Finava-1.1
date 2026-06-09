// Shared roster for the landing-page animated elements (hero grid, ticker, fan).
// Keep this list at 15 — the "15 analysts" story depends on it.
export type Agent = {
  name: string;
  short: string;
  value: string; // sample read-out shown in tiles / ticker
  color: string;
};

export const AGENTS: Agent[] = [
  { name: "Fundamentals", short: "Fund", value: "+18%", color: "#4d9cf8" },
  { name: "DCF Valuation", short: "DCF", value: "$268", color: "#7cc0ff" },
  { name: "Technicals", short: "Tech", value: "↑ 200d", color: "#34d399" },
  { name: "Insider", short: "Insider", value: "NET BUY", color: "#a78bfa" },
  { name: "Earnings", short: "Earn", value: "Beat", color: "#f0abfc" },
  { name: "Sentiment", short: "Sent", value: "0.71", color: "#fbbf24" },
  { name: "Hype", short: "Hype", value: "Heating", color: "#fb923c" },
  { name: "Macro", short: "Macro", value: "Soft", color: "#22d3ee" },
  { name: "Options", short: "Options", value: "Calls", color: "#60a5fa" },
  { name: "Risk", short: "Risk", value: "Low β", color: "#f87171" },
  { name: "Analyst", short: "Analyst", value: "Buy", color: "#818cf8" },
  { name: "Comparables", short: "Comps", value: "Cheap", color: "#2dd4bf" },
  { name: "Graham", short: "Graham", value: "Value", color: "#facc15" },
  { name: "News", short: "News", value: "+ve", color: "#38bdf8" },
  { name: "Competitor", short: "Rival", value: "Leads", color: "#c084fc" },
];
