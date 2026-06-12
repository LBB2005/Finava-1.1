// Roster + line icons for the v5 "CEO deploys 15 analysts" scroll scene.
// Deploy order matches the right-column caption sequence exactly; the 15th
// entry is CEO Synthesis itself — the center hex that conducts the other 14.
import type { ReactNode } from "react";

export type V5Agent = {
  name: string;
  caption: string;
};

// 14 specialists that deploy outward, in caption order.
export const SPECIALISTS: V5Agent[] = [
  { name: "Fundamentals", caption: "five years of SEC filings, line by line" },
  { name: "DCF Valuation", caption: "building the cash-flow model" },
  { name: "Insider Activity", caption: "scanning Form 4 buys & sells" },
  { name: "Technicals", caption: "reading the trend and momentum" },
  { name: "Sentiment", caption: "Reddit, X, YouTube & forums" },
  { name: "Macro Context", caption: "rates, the curve, sector rotation" },
  { name: "Earnings", caption: "transcripts, beats, guidance" },
  { name: "Options Flow", caption: "unusual activity & put/call skew" },
  { name: "Risk", caption: "beta, drawdown, correlation" },
  { name: "Analyst Consensus", caption: "Wall Street targets & revisions" },
  { name: "Comparables", caption: "peer multiples, relative value" },
  { name: "Graham Value", caption: "Benjamin Graham intrinsic value" },
  { name: "News & Catalysts", caption: "filings and breaking events" },
  { name: "Competitor Analysis", caption: "share shifts & moats" },
];

export const CEO: V5Agent = {
  name: "CEO Synthesis",
  caption: "one briefing, one conviction, a confidence level",
};

const s = {
  width: 17,
  height: 17,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ICONS: Record<string, ReactNode> = {
  Fundamentals: (
    <svg {...s}><path d="M3 21h18" /><rect x="5" y="11" width="3" height="7" /><rect x="11" y="7" width="3" height="11" /><rect x="17" y="13" width="3" height="5" /></svg>
  ),
  "DCF Valuation": (
    <svg {...s}><path d="M12 2v20" /><path d="M17 6a4 4 0 0 0-4-2H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6h-3a4 4 0 0 1-4-2" /></svg>
  ),
  "Insider Activity": (
    <svg {...s}><path d="M16 21v-2a4 4 0 0 0-8 0v2" /><circle cx="12" cy="7" r="4" /></svg>
  ),
  Technicals: (
    <svg {...s}><path d="M3 15l4-5 4 3 5-7 5 6" /><path d="M3 21h18" /></svg>
  ),
  Sentiment: (
    <svg {...s}><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><path d="M9 9h.01M15 9h.01" /></svg>
  ),
  "Macro Context": (
    <svg {...s}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>
  ),
  Earnings: (
    <svg {...s}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /><path d="M8 14h3" /></svg>
  ),
  "Options Flow": (
    <svg {...s}><path d="M4 17l5-5 3 3 7-8" /><path d="M16 7h4v4" /></svg>
  ),
  Risk: (
    <svg {...s}><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" /></svg>
  ),
  "Analyst Consensus": (
    <svg {...s}><path d="M3 3v18h18" /><path d="M7 14l3-3 3 2 5-6" /></svg>
  ),
  Comparables: (
    <svg {...s}><path d="M12 3v18" /><path d="M5 7l-3 6h6zM19 7l-3 6h6z" /><path d="M5 7h14" /></svg>
  ),
  "Graham Value": (
    <svg {...s}><path d="M12 2l3 6 6 .5-4.5 4 1.5 6L12 15l-6 3.5 1.5-6L3 8.5 9 8z" /></svg>
  ),
  "News & Catalysts": (
    <svg {...s}><path d="M4 4h13v16H6a2 2 0 0 1-2-2z" /><path d="M17 8h3v10a2 2 0 0 1-2 2" /><path d="M8 8h5M8 12h5M8 16h3" /></svg>
  ),
  "Competitor Analysis": (
    <svg {...s}><path d="M6 9h12l-1 11H7z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /><path d="M12 13v3" /></svg>
  ),
  // hub-and-spokes — the conductor at the center of the formation
  "CEO Synthesis": (
    <svg {...s}><circle cx="12" cy="12" r="3" /><path d="M12 3v4M12 17v4M3.8 7.3l3.5 2M16.7 14.7l3.5 2M3.8 16.7l3.5-2M16.7 9.3l3.5-2" /></svg>
  ),
};

export function V5AgentIcon({ name }: { name: string }) {
  return <>{ICONS[name] ?? null}</>;
}
