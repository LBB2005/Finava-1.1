import { z } from "zod";

/**
 * Body schema for `POST /api/chat` (SSE).
 *
 * `messages` is an Anthropic-style `MessageParam[]`: each entry has a `role`
 * ("user" | "assistant") and `content` that is either a plain string or an
 * array of content blocks. We keep the block array permissive (`unknown[]`) so
 * valid Anthropic payloads (text, image, tool_use, etc.) are not rejected, while
 * still catching empty or garbage bodies. `portfolioContext` is an optional
 * string injected into the system prompt.
 */
export const ChatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.union([z.string(), z.array(z.unknown())]),
      })
    )
    .min(1, "messages must contain at least one message"),
  portfolioContext: z.string().optional(),
  /** Optional response-template id whose instructions/format shape the answer. */
  templateId: z.string().max(200).optional(),
});

export type ChatRequestBody = z.infer<typeof ChatRequestSchema>;
