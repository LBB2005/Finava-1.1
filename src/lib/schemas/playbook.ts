import { z } from "zod";

// Caps mirror the manual limits the playbooks POST used to enforce by hand. As
// before these TRUNCATE rather than reject (a pasted-in over-long title/step is
// trimmed to fit, not 400'd) so existing callers see identical behavior.
export const MAX_STEPS = 20;
export const MAX_STEP_CHARS = 2000;
export const MAX_TITLE_CHARS = 80;
export const MAX_INSTRUCTIONS_CHARS = 2000;

/** Trim, require non-empty, and truncate to the title cap. */
const TitleSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().slice(0, MAX_TITLE_CHARS) : v),
  z.string().min(1, "A name is required")
);

/** Drop blank/non-string steps, cap the count, then trim + cap each. */
const StepsSchema = z.preprocess(
  (v) =>
    (Array.isArray(v) ? v : [])
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .slice(0, MAX_STEPS)
      .map((s) => s.trim().slice(0, MAX_STEP_CHARS)),
  z.array(z.string())
);

/** Optional free-text; defaults to "" and truncates to the cap. */
const InstructionsSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().slice(0, MAX_INSTRUCTIONS_CHARS) : ""),
  z.string()
);

/** Optional conversation id the template was distilled from. */
const SourceConversationIdSchema = z.preprocess(
  (v) => (typeof v === "string" ? v : null),
  z.string().nullable()
);

// `formats` (and the legacy singular `format`) stay loose here — the handler runs
// them through `sanitizeFormats`, which is the authoritative allow-list.
export const CreatePlaybookSchema = z.object({
  title: TitleSchema,
  steps: StepsSchema,
  instructions: InstructionsSchema,
  formats: z.unknown().optional(),
  format: z.unknown().optional(),
  sourceConversationId: SourceConversationIdSchema,
});

export type CreatePlaybookBody = z.infer<typeof CreatePlaybookSchema>;
