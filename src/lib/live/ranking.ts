// The ranked candidate list, extracted from the synthesis the crew already wrote.
//
// The synthesis pass produces prose that ranks the shortlist. The runner needs
// that ranking as data so it can loop debates over the top names. Extracting it
// from the existing report — rather than asking a model to rank again — keeps
// the published transcript a complete account of how the day's subjects were
// chosen. A second ranking pass would be a real decision that no transcript
// explains.

import { z } from "zod";

/**
 * How many names go to a full crew debate per day.
 *
 * Bounded because a debate is ~10 minutes and about a dollar, and the whole run
 * has to commit before 09:30 ET. Four, for three entry slots: the spare covers a
 * name that clears the crew but fails a rail, and when all three slots fill it
 * yields one rejection on merit.
 *
 * It was six. On 2026-09-02 that bought three debates the day could never act on
 * — CF, EIX and FCX were all refused by max_entries_per_day, not by anything
 * about the businesses — at roughly a dollar each. A name refused because the
 * day was full is also poor counterfactual data: the rejected cohort is supposed
 * to isolate judgment, and a queue limit is not a judgment.
 */
export const MAX_DEBATE_SUBJECTS = 4;

export const RankedCandidatesSchema = z.object({
  ranked: z
    .array(
      z.object({
        ticker: z.string().min(1).max(10),
        rank: z.number().int().min(1).max(40),
        /** Why the synthesis placed it here. Quoted from the report, not invented. */
        rationale: z.string().min(1).max(600),
      })
    )
    .min(1)
    .max(40),
});
export type RankedCandidates = z.infer<typeof RankedCandidatesSchema>;

export const RANKED_CONTRACT = [
  "{",
  '  "ranked": [',
  '    { "ticker": string (uppercase),',
  '      "rank": integer, 1 = the synthesis\'s strongest candidate,',
  '      "rationale": string (<=600 chars) — the reason the REPORT gives.',
  "         Do not supply a reason of your own; if the report gives none for a",
  "         name, leave that name out entirely rather than inventing one.",
  "    }",
  "  ]",
  "}",
].join("\n");
