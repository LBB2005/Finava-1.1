import type { ScoutPick, DiscoverTier, WaveEvidence } from "@/lib/scoutTypes";

export type ChatMode = "simple" | "agent" | "deep_research" | "backtest" | "discover";

export { AGENT_COUNT } from "@/agents/tools/index";

export const PROMPT_TEMPLATES = [
  { label: "Full analysis", template: "Give me a full analysis of [TICKER] — valuation, technicals, insider activity, and whether I should add to my position." },
  { label: "Portfolio risk review", template: "Run a full risk analysis on my portfolio. How concentrated am I, what's my beta, and what should I trim or hedge?" },
  { label: "Earnings check", template: "What earnings are coming up this week that are relevant to my portfolio or the broader market?" },
  { label: "Sector macro view", template: "What's the current macro environment doing to [SECTOR] stocks? Any tailwinds or headwinds I should know about?" },
  { label: "Buy/sell decision", template: "Should I buy, hold, or sell [TICKER] right now? Give me a verdict with supporting data." },
  { label: "Hype vs fundamentals", template: "Is [TICKER] trading on hype or fundamentals? How does the narrative match the numbers?" },
];

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode: ChatMode;
  createdAt: string;
  agentTrace?: AgentStep[];
  critique?: string;
  followups?: string[];
  /** Discovery: the scout's picks, kept so the "Go deeper" button can re-seed a deep run. */
  scoutPicks?: ScoutPick[];
  /** Discovery: which tier produced this message. */
  tier?: DiscoverTier;
}

export type AgentName =
  | "run_risk_agent"
  | "run_news_agent"
  | "run_macro_agent"
  | "run_technical_agent"
  | "run_dcf_agent"
  | "run_earnings_agent"
  | "run_insider_agent"
  | "run_sentiment_agent"
  | "run_competitor_agent"
  | "run_options_agent"
  | "run_comparables_agent"
  | "run_graham_agent"
  | "run_analyst_agent"
  | "run_hype_agent"
  | "run_fundamentals_agent"
  | "skeptic_review";

export const AGENT_LABELS: Record<AgentName, string> = {
  run_risk_agent: "Risk Analysis",
  run_news_agent: "News Research",
  run_macro_agent: "Macro & Market",
  run_technical_agent: "Technical Analysis",
  run_dcf_agent: "DCF Valuation",
  run_earnings_agent: "Earnings & Catalysts",
  run_insider_agent: "Insider & Institutional",
  run_sentiment_agent: "Social Sentiment",
  run_competitor_agent: "Competitor Analysis",
  run_options_agent: "Options Flow",
  run_comparables_agent: "Comparables",
  run_graham_agent: "Graham Screen",
  run_analyst_agent: "Analyst Consensus",
  run_hype_agent: "Hype Score",
  run_fundamentals_agent: "Multi-Year Fundamentals",
  skeptic_review: "Skeptic Review",
};

export type AgentStatus = "pending" | "running" | "complete" | "error";

export interface AgentStep {
  agent: AgentName;
  status: AgentStatus;
  result?: string;
  error?: string;
}

export type AgentEvent =
  | { type: "agent_start"; agent: AgentName }
  | { type: "agent_complete"; agent: AgentName; result: string }
  | { type: "agent_error"; agent: AgentName; error: string }
  | { type: "ceo_thinking"; content: string }
  | { type: "ceo_compiling" }
  | { type: "final_response"; content: string }
  | { type: "skeptic_start" }
  | { type: "skeptic_complete"; critique: string }
  | { type: "followups"; questions: string[] }
  | { type: "text_delta"; content: string }
  // ── Discovery funnel ──
  | { type: "discover_clarify"; question: string; chips: string[] }
  | { type: "scout_complete"; tier: DiscoverTier; query: string; interpretation: string; picks: ScoutPick[] }
  | { type: "deep_shortlist"; query: string; interpretation: string; picks: ScoutPick[] }
  | { type: "wave_start"; waveIndex: number; totalWaves: number; tickers: string[] }
  | { type: "wave_result"; wave: WaveEvidence; totalWaves: number }
  | { type: "discover_done" }
  | { type: "done" }
  | { type: "error"; message: string };
