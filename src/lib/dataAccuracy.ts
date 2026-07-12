/**
 * The one data-accuracy rule shared by every AI-generated report.
 *
 * Sub-agents and synthesis prompts already receive *real* fetched data and are
 * asked to synthesize it — but the discipline was inconsistent: only some agents
 * forbade hallucination, none uniformly forced an explicit "Unavailable" for null
 * fields, and sourcing was never required. This constant makes the three policies
 * uniform. It mirrors EXTERNAL_DATA_RULE in externalContent.ts: a plain string
 * that drops into either a `system` prompt (e.g. via getSkillsPrompt) or a user
 * `prompt` (e.g. alongside JSON_RULES), wherever a report is produced.
 *
 * Policy (confirmed with product): when a data point is genuinely unavailable,
 * say so explicitly — never fabricate, never leave a field silently blank.
 *
 * Keep this tight — it is spliced into many prompts, so length is token cost.
 */
const HEADER = "## Data Accuracy — NON-NEGOTIABLE";

export const DATA_ACCURACY_RULE = [
  HEADER,
  "- No fabrication: state a specific figure (price, %, ratio, $ amount, share count, date) ONLY if it appears in the data provided to you in this prompt. Never recall a number from memory, estimate, interpolate, round-from-memory, or carry a figure over from a similar company.",
  '- Explicit "Unavailable": when a value you would report is missing, null, N/A, an `error`, or was simply not provided, write "Unavailable" (or "Not reported") in its place. Never omit the field silently, never substitute 0 or a placeholder, and never guess. A silent blank is a bug; an explicit "Unavailable" is correct and expected.',
  "- Sourcing: attribute every figure to its origin inline, e.g. (SEC EDGAR FY2024), (Finnhub), (web). If you cannot attribute a figure to the data provided, do not state it.",
].join("\n");

/**
 * The same no-fabrication discipline, shaped for agents that emit *strict JSON*
 * rather than prose (the portfolio-statement extractor and the supply-chain
 * estimator). The prose rule can't be spliced verbatim into these: its "write
 * Unavailable" clause fights a JSON shape that already uses `null` as the
 * missing-value sentinel, and its inline-sourcing clause is meaningless in a
 * structured payload. So this variant keeps the core guardrail — never invent an
 * entity or a figure the source doesn't support — but points missing values at
 * `null` and drops sourcing. It deliberately permits estimation *when the prompt
 * asks for it* (supply-chain weights are AI-estimated by design), while still
 * forbidding invented specifics the model isn't confident about.
 *
 * Keep in lockstep with DATA_ACCURACY_RULE: same policy, different output shape.
 */
export const DATA_ACCURACY_RULE_JSON = [
  HEADER,
  "- No fabrication: only output a company, ticker, holding, or figure (shares, cost, %, $ amount, weight) that is present in — or, where this prompt explicitly asks you to estimate, directly supported by — the source provided to you. Never recall a value from memory, invent an entity, or carry a figure over from a similar company.",
  "- Use null, never a guess: when a value is missing, unreadable, or unknown, set that field to null as the JSON shape specifies. Never substitute 0, a placeholder, or a rounded-from-memory number, and never drop a required field.",
].join("\n");
