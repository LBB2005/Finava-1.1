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
export const DATA_ACCURACY_RULE = [
  "## Data Accuracy — NON-NEGOTIABLE",
  "- No fabrication: state a specific figure (price, %, ratio, $ amount, share count, date) ONLY if it appears in the data provided to you in this prompt. Never recall a number from memory, estimate, interpolate, round-from-memory, or carry a figure over from a similar company.",
  '- Explicit "Unavailable": when a value you would report is missing, null, N/A, an `error`, or was simply not provided, write "Unavailable" (or "Not reported") in its place. Never omit the field silently, never substitute 0 or a placeholder, and never guess. A silent blank is a bug; an explicit "Unavailable" is correct and expected.',
  "- Sourcing: attribute every figure to its origin inline, e.g. (SEC EDGAR FY2024), (Finnhub), (web). If you cannot attribute a figure to the data provided, do not state it.",
].join("\n");
