import type { Metadata } from "next";
import V5Landing from "@/components/v5/V5Landing";

export const metadata: Metadata = {
  title: "Finava — 15 AI analysts. One conversation.",
  description:
    "Finava deploys 15 specialized AI agents on any stock — fundamentals, DCF valuation, insider activity, technicals, macro, and sentiment — giving you research depth that used to cost $32,000 a year.",
  openGraph: {
    title: "Finava — 15 AI analysts. One conversation.",
    description:
      "Institutional-grade stock research for self-directed investors. 15 specialist agents, real SEC EDGAR data, in minutes.",
    type: "website",
  },
};

export default function Home() {
  return <V5Landing />;
}
