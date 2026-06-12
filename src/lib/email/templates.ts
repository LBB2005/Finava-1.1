/**
 * Branded HTML email templates for Finava.
 *
 * Plain template-literal HTML (no react-email dependency) with fully inlined
 * styles — the only thing email clients reliably render. The palette mirrors the
 * landing page: near-black background (#070b16), blue accent (#4d9cf8).
 *
 * Each builder returns { subject, html, text }. Always provide the text variant —
 * it improves deliverability and serves clients that strip HTML.
 */

const ACCENT = "#4d9cf8";
const BG = "#070b16";
const SURFACE = "#0e1424";
const BORDER = "#1d2740";
const TEXT = "#e8edf7";
const TEXT_DIM = "#9aa7c2";
const MUTED = "#5d6b8a";

// CAN-SPAM requires a valid physical postal address in every commercial email.
// Set COMPANY_POSTAL_ADDRESS in the environment (a registered-agent or virtual
// mailbox address is fine). TODO: set this in prod before sending the weekly email.
const POSTAL_ADDRESS = process.env.COMPANY_POSTAL_ADDRESS ?? "";

/** Shared chrome: dark canvas, centered card, wordmark header, legal footer. */
function shell(opts: { preview: string; body: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark light" />
<meta name="supported-color-schemes" content="dark light" />
<title>Finava</title>
</head>
<body style="margin:0;padding:0;background:${BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${opts.preview}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
        <tr>
          <td style="padding:0 4px 20px;">
            <span style="font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:${TEXT};">Finava</span>
          </td>
        </tr>
        <tr>
          <td style="background:${SURFACE};border:1px solid ${BORDER};border-radius:16px;padding:36px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            ${opts.body}
          </td>
        </tr>
        <tr>
          <td style="padding:24px 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 8px;font-size:11.5px;line-height:1.6;color:${MUTED};">
              Finava is not a registered investment advisor. All content is for informational and
              educational purposes only and does not constitute financial, investment, or trading
              advice. Investing involves risk, including the possible loss of principal.
            </p>
            <p style="margin:0;font-size:11.5px;color:${MUTED};">
              © 2026 Finava · You're receiving this because you joined the Finava waitlist.
              <a href="{{unsubscribe_url}}" style="color:${MUTED};text-decoration:underline;">Unsubscribe</a> ·
              <a href="https://finava.ai/privacy" style="color:${MUTED};text-decoration:underline;">Privacy Policy</a>
            </p>
            ${POSTAL_ADDRESS ? `<p style="margin:6px 0 0;font-size:11.5px;color:${MUTED};">Finava · ${POSTAL_ADDRESS}</p>` : ""}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0;">
  <tr>
    <td style="border-radius:12px;background:${ACCENT};">
      <a href="${href}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:#070b16;text-decoration:none;border-radius:12px;">${label}</a>
    </td>
  </tr>
</table>`;
}

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

/**
 * Sent immediately when someone joins the waitlist. Confirms they're on the
 * list and sets expectations (3 months Pro free for early members).
 */
export function waitlistConfirmationEmail(): EmailContent {
  const subject = "You're on the Finava waitlist 🎉";
  const html = shell({
    preview: "You're on the list — early members get 3 months of Pro free.",
    body: `
      <h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;font-weight:800;color:${TEXT};">You're on the list.</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${TEXT_DIM};">
        Thanks for joining the Finava waitlist. We're building the AI analyst team for
        self-directed investors — and you'll be among the first in when we open the doors.
      </p>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:${TEXT_DIM};">
        As an early waitlist member, you get <strong style="color:${TEXT};">3 months of Pro, free</strong>
        the moment your access is ready.
      </p>
      <p style="margin:0 0 8px;font-size:15px;line-height:1.65;color:${TEXT_DIM};">
        We'll send you a short weekly note as we get closer to launch — no spam, just the
        build in progress. Reply to this email any time; a human reads them.
      </p>
      <p style="margin:24px 0 0;font-size:15px;line-height:1.65;color:${TEXT_DIM};">— The Finava team</p>
    `,
  });
  const text = [
    "You're on the list.",
    "",
    "Thanks for joining the Finava waitlist. We're building the AI analyst team for self-directed investors — and you'll be among the first in when we open the doors.",
    "",
    "As an early waitlist member, you get 3 months of Pro, free the moment your access is ready.",
    "",
    "We'll send you a short weekly note as we get closer to launch — no spam, just the build in progress. Reply to this email any time; a human reads them.",
    "",
    "— The Finava team",
  ].join("\n");
  return { subject, html, text };
}

export interface WeeklyUpdateInput {
  /** e.g. "Issue #1" or "Week of June 10" — shown as the eyebrow. */
  issueLabel: string;
  /** Headline for this week's note. */
  headline: string;
  /** Intro paragraph(s). Plain text; line breaks become paragraphs. */
  intro: string;
  /** Bullet highlights of what shipped / what's coming. */
  highlights: string[];
  /** Optional closing call-to-action. */
  cta?: { label: string; href: string };
  /** Sign-off line. */
  signoff?: string;
}

/**
 * Reusable weekly update to the waitlist. Pass the week's content in; the chrome,
 * branding, and footer stay consistent.
 */
export function weeklyUpdateEmail(input: WeeklyUpdateInput): EmailContent {
  const {
    issueLabel,
    headline,
    intro,
    highlights,
    cta,
    signoff = "— The Finava team",
  } = input;

  const introHtml = intro
    .split("\n")
    .filter((p) => p.trim())
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${TEXT_DIM};">${p.trim()}</p>`
    )
    .join("");

  const highlightsHtml = highlights.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;">
        ${highlights
          .map(
            (h) => `<tr>
          <td valign="top" style="padding:0 10px 12px 0;font-size:15px;line-height:1.5;color:${ACCENT};">▸</td>
          <td valign="top" style="padding:0 0 12px;font-size:15px;line-height:1.5;color:${TEXT_DIM};">${h}</td>
        </tr>`
          )
          .join("")}
      </table>`
    : "";

  const subject = `Finava — ${headline}`;
  const html = shell({
    preview: headline,
    body: `
      <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${ACCENT};">${issueLabel}</p>
      <h1 style="margin:0 0 16px;font-size:23px;line-height:1.3;font-weight:800;color:${TEXT};">${headline}</h1>
      ${introHtml}
      ${highlightsHtml}
      ${cta ? button(cta.label, cta.href) : ""}
      <p style="margin:24px 0 0;font-size:15px;line-height:1.65;color:${TEXT_DIM};">${signoff}</p>
    `,
  });

  const text = [
    issueLabel.toUpperCase(),
    headline,
    "",
    intro.trim(),
    "",
    ...highlights.map((h) => `• ${h}`),
    cta ? `\n${cta.label}: ${cta.href}` : "",
    "",
    signoff,
  ]
    .filter((l) => l !== undefined)
    .join("\n");

  return { subject, html, text };
}
