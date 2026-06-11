import type { Metadata } from "next";
import V2Landing from "@/components/v2/V2Landing";
import "./v2.css";

export const metadata: Metadata = {
  title: "Finava — 15 analysts. One conversation.",
  description:
    "Finava deploys 15 specialized AI analyst agents on any stock at once — fundamentals to options flow — then synthesizes them into one conviction-driven briefing. Research depth that used to cost $32,000/yr, from $20/mo.",
  openGraph: {
    title: "Finava — 15 analysts. One conversation.",
    description:
      "Institutional-grade stock research for self-directed investors. 15 specialist agents, real SEC EDGAR data, synthesized into one conviction-driven briefing.",
    type: "website",
  },
};

export default function Home() {
  return <V2Landing />;
}
