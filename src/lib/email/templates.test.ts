import { describe, expect, it } from "vitest";
import { waitlistConfirmationEmail, weeklyUpdateEmail } from "./templates";

describe("email templates", () => {
  it("builds the waitlist confirmation with deliverability text and compliance chrome", () => {
    const email = waitlistConfirmationEmail();

    expect(email.subject).toBe("You're on the Finava waitlist 🎉");
    expect(email.html).toContain("<!doctype html>");
    expect(email.html).toContain("early members get 3 months of Pro free");
    expect(email.html).toContain("Finava is not a registered investment advisor");
    expect(email.html).toContain("{{unsubscribe_url}}");
    expect(email.text).toContain("You're on the list.");
    expect(email.text).toContain("3 months of Pro, free");
  });

  it("builds weekly update emails with highlights, CTA, and fallback signoff", () => {
    const email = weeklyUpdateEmail({
      issueLabel: "Issue #4",
      headline: "DCF tabs are live",
      intro: "We shipped valuation controls.\nThey are built for quick scenario work.",
      highlights: ["DCF sliders now update instantly", "Usage metering is stricter"],
      cta: { label: "Open Finava", href: "https://finava.ai/app" },
    });

    expect(email.subject).toBe("Finava — DCF tabs are live");
    expect(email.html).toContain("Issue #4");
    expect(email.html).toContain("DCF sliders now update instantly");
    expect(email.html).toContain('href="https://finava.ai/app"');
    expect(email.text).toContain("ISSUE #4");
    expect(email.text).toContain("• DCF sliders now update instantly");
    expect(email.text).toContain("Open Finava: https://finava.ai/app");
    expect(email.text).toContain("— The Finava team");
  });

  it("omits optional weekly blocks cleanly", () => {
    const email = weeklyUpdateEmail({
      issueLabel: "Week of June 15",
      headline: "Quiet polish",
      intro: "\nOne compact note.\n",
      highlights: [],
      signoff: "Liam",
    });

    expect(email.html).not.toContain("▸");
    expect(email.html).not.toContain("Open Finava");
    expect(email.html).toContain("Liam");
    expect(email.text).toContain("One compact note.");
    expect(email.text).toContain("Liam");
  });
});
