import { Resend } from "resend";
import type { EmailContent } from "./templates";

/**
 * Thin Resend wrapper that degrades gracefully when email isn't configured.
 *
 * Until RESEND_API_KEY (and a verified sending domain) exist, sendEmail() logs
 * and no-ops instead of throwing — so waitlist signups keep working before the
 * provider is live. Flip the env vars and emails start flowing; no code change.
 *
 * Env:
 *   RESEND_API_KEY   — Resend API key (re_...)
 *   EMAIL_FROM       — verified sender, e.g. "Finava <hello@finava.ai>"
 *   EMAIL_REPLY_TO   — optional reply-to address
 */

const FROM = process.env.EMAIL_FROM || "Finava <hello@finava.ai>";
const REPLY_TO = process.env.EMAIL_REPLY_TO;

let client: Resend | null = null;
function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!client) client = new Resend(key);
  return client;
}

export function isEmailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export interface SendResult {
  sent: boolean;
  id?: string;
  skipped?: boolean;
  error?: string;
}

/**
 * Send a single transactional email. Never throws — returns a result the caller
 * can log. A failed send must not fail the surrounding request (e.g. a signup).
 */
export async function sendEmail(
  to: string | string[],
  content: EmailContent
): Promise<SendResult> {
  const resend = getClient();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping send to", to);
    return { sent: false, skipped: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      subject: content.subject,
      html: content.html,
      text: content.text,
      ...(REPLY_TO ? { replyTo: REPLY_TO } : {}),
    });
    if (error) {
      console.error("[email] send failed:", error);
      return { sent: false, error: error.message };
    }
    return { sent: true, id: data?.id };
  } catch (err) {
    console.error("[email] send threw:", err);
    return { sent: false, error: err instanceof Error ? err.message : "unknown" };
  }
}
