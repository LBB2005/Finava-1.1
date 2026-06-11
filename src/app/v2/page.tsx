import type { Metadata } from "next";
import V2Landing from "@/components/v2/V2Landing";
import "./v2.css";

export const metadata: Metadata = {
  title: "Finava — 15 analysts. One conversation.",
  description:
    "Finava deploys 15 specialized AI analyst agents on any stock simultaneously, then synthesizes them into one conviction-driven briefing. Research depth that used to cost $32,000/yr, from $20/mo.",
  // Experimental alternate landing — keep it out of search indexes while it runs alongside the live page.
  robots: { index: false, follow: false },
};

export default function V2Page() {
  return <V2Landing />;
}
