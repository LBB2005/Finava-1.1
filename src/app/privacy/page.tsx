import type { Metadata } from "next";
import { LegalShell, Section, P, UL, Strong, A } from "@/components/legal/LegalShell";

export const metadata: Metadata = {
  title: "Privacy Policy — Finava",
  description: "How Finava collects, uses, and protects your personal data.",
};

// DRAFT FOR LEGAL REVIEW: have qualified counsel review before public launch.
// TODO: replace "Finava" with the registered legal entity name (e.g. "Finava, Inc.")
// and add the company's postal address under "Contact us" once incorporated.

export default function PrivacyPolicyPage() {
  return (
    <LegalShell title="Privacy Policy" effectiveDate="June 11, 2026">
      <Section title="1. Who we are">
        <P>
          Finava (&quot;Finava&quot;, &quot;we&quot;, &quot;us&quot;) operates finava.ai, an AI-powered
          investment research platform. This policy explains what personal data we collect, why we
          collect it, who we share it with, and the rights you have over it. We are the data
          controller for the personal data described here. You can reach us at{" "}
          <A href="mailto:hello@finava.ai">hello@finava.ai</A>.
        </P>
        <P>
          Finava is an investment research tool. We are not a broker-dealer or a registered
          investment adviser, we never hold your money or securities, and we cannot move funds or
          place trades.
        </P>
      </Section>

      <Section title="2. Data we collect">
        <UL
          items={[
            <>
              <Strong>Account data.</Strong> When you sign in with Google we receive your email
              address, display name, and profile photo from Google via Firebase Authentication.
            </>,
            <>
              <Strong>Waitlist data.</Strong> If you join the waitlist we store your email address.
            </>,
            <>
              <Strong>Brokerage data (optional).</Strong> If you choose to connect a brokerage
              account through Plaid, we receive read-only data about your holdings: ticker symbols,
              share quantities, cost basis, and cash balances. We never receive your brokerage
              username or password — those go directly to Plaid. We cannot move money or place
              trades.
            </>,
            <>
              <Strong>Content you create.</Strong> Chat messages, watchlists, research notes, and
              settings you save in the app.
            </>,
            <>
              <Strong>Usage and technical data.</Strong> Basic logs (IP address, browser type,
              timestamps) generated when you use the service, and usage metering tied to your
              account so we can apply plan limits. We do not run third-party advertising or
              cross-site tracking.
            </>,
            <>
              <Strong>Optional location preference.</Strong> If enabled in Settings, coarse
              city/region location used to improve market context. You can turn this off at any
              time.
            </>,
          ]}
        />
      </Section>

      <Section title="3. How we use your data, and our legal bases">
        <UL
          items={[
            <>
              <Strong>To provide the service</Strong> (accounts, portfolio views, AI research, plan
              limits) — necessary to perform our contract with you.
            </>,
            <>
              <Strong>To send you emails you asked for</Strong> — a confirmation when you join the
              waitlist, and a weekly update email. The weekly email is sent on the basis of your
              consent; every email includes an unsubscribe link and you can withdraw consent at any
              time.
            </>,
            <>
              <Strong>To improve our AI features</Strong> — if you allow it in Settings
              (&quot;Help improve Finava&quot;), your chats and sessions may be used to improve our
              AI models. This is based on your consent and you can opt out at any time in Settings.
            </>,
            <>
              <Strong>To keep the service secure and prevent abuse</Strong> — rate limiting, fraud
              prevention, and debugging, based on our legitimate interests.
            </>,
            <>
              <Strong>To comply with law</Strong> — where we have a legal obligation.
            </>,
          ]}
        />
        <P>
          <Strong>We do not sell your personal information, and we do not share it for cross-context
          behavioral advertising.</Strong>
        </P>
      </Section>

      <Section title="4. Who we share data with">
        <P>
          We share data only with service providers (processors) that help us run Finava, under
          contracts that limit how they can use it:
        </P>
        <UL
          items={[
            <>
              <Strong>Plaid Inc.</Strong> — brokerage account connectivity. Plaid&apos;s handling of
              your data is described in the{" "}
              <A href="https://plaid.com/legal/#end-user-privacy-policy">Plaid End User Privacy Policy</A>,
              which you agree to when you connect an account.
            </>,
            <>
              <Strong>Google (Firebase)</Strong> — authentication, database, and hosting
              infrastructure.
            </>,
            <>
              <Strong>Anthropic and xAI</Strong> — AI model providers that process your chat
              messages and research requests to generate responses.
            </>,
            <>
              <Strong>Resend</Strong> — email delivery.
            </>,
            <>
              <Strong>Stripe</Strong> — payment processing for paid plans. We never see your full
              card number.
            </>,
            <>
              <Strong>Vercel</Strong> — application hosting.
            </>,
            <>
              Market data providers (such as Polygon, Alpaca, and Finnhub) receive the ticker
              symbols you look up but no information identifying you.
            </>,
          ]}
        />
        <P>
          We may also disclose data if required by law, or as part of a merger, acquisition, or sale
          of assets (in which case this policy continues to apply to your data).
        </P>
      </Section>

      <Section title="5. International transfers">
        <P>
          We are based in the United States and our service providers process data there. If you use
          Finava from the EU, UK, or elsewhere, your data is transferred to the US. Where required,
          transfers rely on safeguards such as the EU-US Data Privacy Framework or Standard
          Contractual Clauses maintained by our providers.
        </P>
      </Section>

      <Section title="6. Retention">
        <P>
          We keep your data while your account is active. If you delete your account, we delete your
          account data, content, and brokerage data, and revoke our Plaid connections, except for
          minimal records we must keep for legal, security, or accounting reasons. Waitlist emails
          are kept until you unsubscribe or we launch, whichever you choose. Backup copies are
          purged on a rolling basis.
        </P>
      </Section>

      <Section title="7. Your rights">
        <P>
          You can access, correct, export, or delete your personal data. In the app: Settings →
          Privacy &amp; Data lets you export your data or delete your account entirely. You can also
          email <A href="mailto:hello@finava.ai">hello@finava.ai</A>.
        </P>
        <P>
          If you are in the EU or UK, you additionally have the rights to restrict or object to
          processing, the right to data portability, the right to withdraw consent at any time, and
          the right to lodge a complaint with your data protection authority (in the UK, the ICO).
        </P>
        <P>
          <Strong>US state privacy rights.</Strong> Residents of California and other US states with
          comprehensive privacy laws have similar rights to know, access, correct, and delete
          personal information. We honor these requests for all users regardless of location. We do
          not sell or share personal information as those terms are defined under California law, so
          there is nothing to opt out of.
        </P>
      </Section>

      <Section title="8. Security">
        <P>
          Your data is encrypted in transit and at rest. Access to production data is limited to
          authorized personnel. Brokerage credentials are never stored by Finava — they are handled
          entirely by Plaid. No system is perfectly secure, so we cannot guarantee absolute
          security; if a breach affects your data we will notify you as required by law.
        </P>
      </Section>

      <Section title="9. Children">
        <P>
          Finava is for adults. You must be at least 18 years old to use the service. We do not
          knowingly collect personal data from anyone under 18, and we do not direct the service to
          children. If we learn that a user is under 18 we will close the account and delete the
          associated data. If you believe a minor has provided us data, contact{" "}
          <A href="mailto:hello@finava.ai">hello@finava.ai</A>.
        </P>
      </Section>

      <Section title="10. Cookies">
        <P>
          Finava uses only strictly necessary cookies and similar storage — those required to keep
          you signed in and to make the app function. We do not use advertising or third-party
          analytics cookies. If that changes, we will update this policy and, where required, ask
          for your consent first.
        </P>
      </Section>

      <Section title="11. AI processing">
        <P>
          Finava&apos;s research, analysis, and chat features are powered by artificial intelligence.
          Your prompts and connected data may be processed by our AI providers (listed above) to
          generate responses. AI-generated content can be inaccurate or incomplete and is provided
          for informational purposes only — see our Terms of Service.
        </P>
      </Section>

      <Section title="12. Changes to this policy">
        <P>
          We will post any changes here and update the effective date. For material changes we will
          give you reasonable advance notice, for example by email or an in-app notice.
        </P>
      </Section>

      <Section title="13. Contact us">
        <P>
          Questions or requests: <A href="mailto:hello@finava.ai">hello@finava.ai</A>.
        </P>
      </Section>
    </LegalShell>
  );
}
