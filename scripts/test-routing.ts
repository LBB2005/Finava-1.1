/**
 * Throwaway verification harness for the OpenRouter per-agent routing.
 *
 * Run it twice to exercise the kill-switch:
 *   LLM_ROUTING=on  npx tsx scripts/test-routing.ts    # per-agent routing
 *   LLM_ROUTING=off npx tsx scripts/test-routing.ts    # everything back to Sonnet/Haiku
 *
 * It hits one Tier-A agent (technical → Gemini Flash-Lite), one Tier-B agent
 * (graham → Gemini Flash), and the dcf agent (Sonnet, reduced thinking) for AAPL,
 * prints the model each is routed to + a snippet of output, and confirms the
 * technical data-quality guard still fires when a ticker has no data.
 *
 * Requires OPENROUTER_API_KEY + FINNHUB_API_KEY in .env.local.
 */
import dotenv from "dotenv";
// Load .env.local first. dotenv does NOT override vars already set on the command
// line, so `LLM_ROUTING=off npx tsx ...` still wins over the .env.local value.
dotenv.config({ path: ".env.local" });

import { AGENT_MODELS, LLM_ROUTING_ON, type AgentKey } from "@/lib/llm";
import { runTechnicalAgent } from "@/agents/sub-agents/technical-agent";
import { runGrahamAgent } from "@/agents/sub-agents/graham-agent";
import { runDcfAgent } from "@/agents/sub-agents/dcf-agent";

function snippet(s: string, n = 280): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > n ? clean.slice(0, n) + "…" : clean;
}

async function main() {
  console.log("══════════════════════════════════════════════════════════════");
  console.log(`LLM_ROUTING=${process.env.LLM_ROUTING ?? "(unset → on)"}  →  routing ${LLM_ROUTING_ON ? "ON" : "OFF"}`);
  console.log("Model map for the agents under test:");
  for (const a of ["technical", "graham", "dcf"] as AgentKey[]) {
    console.log(`   ${a.padEnd(11)} → ${AGENT_MODELS[a]}`);
  }
  console.log("══════════════════════════════════════════════════════════════\n");

  // ── Tier A: technical (AAPL) ────────────────────────────────────────────────
  console.log("▶ technical(AAPL) — Tier A narration");
  const tech = await runTechnicalAgent({ tickers: ["AAPL"] });
  console.log(`   output (${tech.length} chars): ${snippet(tech)}\n`);

  // ── Tier B: graham (AAPL) ───────────────────────────────────────────────────
  console.log("▶ graham(AAPL) — Tier B judgment");
  const graham = await runGrahamAgent({ ticker: "AAPL" });
  console.log(`   output (${graham.length} chars): ${snippet(graham)}\n`);

  // ── dcf (AAPL) — Sonnet, reduced thinking when routing on ───────────────────
  console.log("▶ dcf(AAPL) — Sonnet + reasoning");
  const dcf = await runDcfAgent({ ticker: "AAPL" });
  console.log(`   output (${dcf.length} chars): ${snippet(dcf)}\n`);

  // ── Data-quality guard: a bogus ticker must trip the no-data block ──────────
  console.log("▶ technical(ZZZZINVALID) — data-quality guard check");
  const guard = await runTechnicalAgent({ tickers: ["ZZZZINVALID"] });
  const guardFired = guard.includes("DATA UNAVAILABLE");
  console.log(`   guard fired: ${guardFired ? "✅ YES" : "❌ NO"} — ${snippet(guard, 160)}\n`);

  // ── Verdict ─────────────────────────────────────────────────────────────────
  const ok =
    tech.trim().length > 0 &&
    graham.trim().length > 0 &&
    dcf.trim().length > 0 &&
    guardFired;
  console.log("──────────────────────────────────────────────────────────────");
  console.log(ok ? "✅ ALL CHECKS PASSED" : "❌ SOME CHECKS FAILED");
  console.log("──────────────────────────────────────────────────────────────");
  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error("test-routing failed:", err);
  process.exit(1);
});
