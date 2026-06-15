import { z } from "zod";

const OptionalTrimmedString = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || undefined : value),
    z.string().max(max).optional()
  );

export const CreateConversationSchema = z.object({
  id: OptionalTrimmedString(128),
  title: OptionalTrimmedString(200).nullable().optional(),
  context: z.string().max(50_000).nullable().optional(),
});

export type CreateConversationBody = z.infer<typeof CreateConversationSchema>;

export const UpdateConversationSchema = z
  .object({
    title: OptionalTrimmedString(200),
    archived: z.boolean().optional(),
  })
  .refine((body) => body.title !== undefined || body.archived !== undefined, {
    message: "At least one field must be provided",
  });

export type UpdateConversationBody = z.infer<typeof UpdateConversationSchema>;

export const AddMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(100_000),
  mode: z.string().max(40).default("simple"),
  agentTrace: z.unknown().optional(),
  durationMs: z.number().nonnegative().optional(),
});

export type AddMessageBody = z.infer<typeof AddMessageSchema>;
