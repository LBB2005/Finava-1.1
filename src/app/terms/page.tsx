import type { Metadata } from "next";
import { LegalShell, Section, P, UL, Strong, A } from "@/components/legal/LegalShell";

export const metadata: Metadata = {
  title: "Terms of Service — Finava",
  description: "The terms that govern your use of Finava.",
};

// DRAFT FOR LEGAL REVIEW: have qualified counsel review before public launch.
// TODO: replace "Finava" with the registered legal entity name and set the
// governing-law state once the entity is formed.

export default function TermsOfServicePage() {
  return (
    <LegalShell title="Terms of Service" effectiveDate="June 11, 2026">
      <Section title="1. Agreement">
        <P>
          These Terms of Service (&quot;Terms&quot;) are a contract between you and Finava
          (&quot;Finava&quot;, &quot;we&quot;, &quot;us&quot;) governing your use of finava.ai and
          related services (the &quot;Service&quot;). By creating an account, joining the waitlist,
          or using the Service, you agree to these Terms and to our{" "}
          <A href="/privacy">Privacy Policy</A>. If you do not agree, do not use the Service.
        </P>
      </Section>

      <Section title="2. Not investment advice">
        <P>
          <Strong>
            Finava is an investment research tool, not an investment adviser. Nothing on the Service
            is investment, financial, legal, or tax advice, and nothing is a recommendation or
            solicitation to buy, sell, or hold any security or other asset.
          </Strong>
        </P>
        <UL
          items={[
            <>
              Finava is <Strong>not</Strong> a registered investment adviser, broker-dealer, or
              fiduciary, and is not registered with the SEC, FINRA, the FCA, or any other financial
              regulator.
            </>,
            <>
              All content — including AI-generated analysis, scores, valuations, DCF models,
              briefings, and chat responses — is impersonal, general-purpose research provided for
              informational and educational purposes only. It is not tailored to your financial
              situation, objectives, or risk tolerance, even where the Service displays data about
              your connected portfolio.
            </>,
            <>
              Investing involves risk, including the possible loss of all principal. Past
              performance is not indicative of future results.
            </>,
            <>
              You are solely responsible for your investment decisions. Do your own research and
              consult a qualified, licensed financial adviser before acting on anything you see on
              the Service.
            </>,
          ]}
        />
      </Section>

      <Section title="3. AI-generated content">
        <P>
          The Service uses artificial intelligence to generate research, analysis, and chat
          responses. You will be interacting with AI systems, not humans.{" "}
          <Strong>
            AI-generated content can be inaccurate, incomplete, outdated, or wrong
          </Strong>{" "}
          — including numbers, valuations, and statements presented confidently. Market data may be
          delayed or contain errors. Verify anything material independently before relying on it.
        </P>
      </Section>

      <Section title="4. Eligibility">
        <P>
          You must be at least 18 years old and able to form a binding contract to use the Service.
          By using the Service you represent that you meet these requirements. The Service is not
          directed to children, and we will close accounts we learn belong to anyone under 18.
        </P>
      </Section>

      <Section title="5. Your account">
        <P>
          You are responsible for activity on your account and for keeping your sign-in method
          secure. Notify us promptly at <A href="mailto:hello@finava.ai">hello@finava.ai</A> if you
          suspect unauthorized use. We may suspend or terminate accounts that violate these Terms.
        </P>
      </Section>

      <Section title="6. Brokerage connections (Plaid)">
        <P>
          You may optionally connect brokerage accounts through Plaid Inc. By doing so you grant
          Finava and Plaid the right to access read-only information from your financial
          institution as described in our <A href="/privacy">Privacy Policy</A>, and you agree to
          the{" "}
          <A href="https://plaid.com/legal/#end-user-privacy-policy">Plaid End User Privacy Policy</A>.
          Finava receives holdings data only — we never receive your brokerage credentials, and we
          cannot move money or place trades. You can disconnect a brokerage at any time in the app.
        </P>
      </Section>

      <Section title="7. Acceptable use">
        <UL
          items={[
            <>Don&apos;t use the Service for anything unlawful.</>,
            <>
              Don&apos;t scrape, harvest, bulk-download, resell, or redistribute content or market
              data from the Service. Market data is licensed from third-party providers for display
              within Finava only.
            </>,
            <>
              Don&apos;t use the Service or its output to build or operate a competing product, an
              investment advisory service, or to provide advice to third parties.
            </>,
            <>
              Don&apos;t attempt to probe, disrupt, overload, or gain unauthorized access to the
              Service, or circumvent usage limits.
            </>,
            <>Don&apos;t misrepresent Finava output as human-authored professional advice.</>,
          ]}
        />
      </Section>

      <Section title="8. Subscriptions and billing">
        <P>
          Some features require a paid plan, billed through Stripe. Prices, plan limits, and
          features are shown in the app and may change with notice. Unless required by law, fees are
          non-refundable. You can cancel any time, effective at the end of the current billing
          period.
        </P>
      </Section>

      <Section title="9. Intellectual property">
        <P>
          Finava and its content, software, and branding are owned by Finava or its licensors. We
          grant you a personal, non-exclusive, non-transferable license to use the Service for your
          own non-commercial investment research. You retain ownership of the content you submit
          (such as chat prompts and notes) and grant us a license to use it to operate and — where
          you have allowed it in Settings — improve the Service. Subject to these Terms, you may use
          AI output generated for you for your personal purposes.
        </P>
      </Section>

      <Section title="10. Third-party services and data">
        <P>
          The Service displays data from third parties (market data providers, SEC EDGAR, news
          sources, social platforms) and depends on third-party infrastructure. We are not
          responsible for the accuracy or availability of third-party data or services.
        </P>
      </Section>

      <Section title="11. Disclaimer of warranties">
        <P>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot;, WITHOUT WARRANTIES
          OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR
          PURPOSE, NON-INFRINGEMENT, ACCURACY, OR AVAILABILITY. WE DO NOT WARRANT THAT ANY CONTENT —
          INCLUDING AI-GENERATED ANALYSIS AND THIRD-PARTY MARKET DATA — IS ACCURATE, COMPLETE, OR
          CURRENT, OR THAT THE SERVICE WILL BE UNINTERRUPTED OR ERROR-FREE.
        </P>
      </Section>

      <Section title="12. Limitation of liability">
        <P>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, FINAVA AND ITS OFFICERS, EMPLOYEES, AND SUPPLIERS
          WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
          DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR GOODWILL — AND, IN PARTICULAR,{" "}
          <Strong>
            FOR ANY TRADING OR INVESTMENT LOSSES ARISING FROM DECISIONS MADE IN RELIANCE ON THE
            SERVICE OR ITS CONTENT
          </Strong>
          . OUR TOTAL LIABILITY FOR ALL CLAIMS RELATING TO THE SERVICE IS LIMITED TO THE GREATER OF
          (A) THE AMOUNT YOU PAID US IN THE 12 MONTHS BEFORE THE CLAIM AND (B) USD $100.
        </P>
        <P>
          Some jurisdictions do not allow certain exclusions or limits. Nothing in these Terms
          excludes or limits liability that cannot lawfully be excluded or limited — including, for
          consumers in the EU or UK, liability for death or personal injury caused by negligence,
          fraud, or your statutory consumer rights.
        </P>
      </Section>

      <Section title="13. Dispute resolution (US users)">
        <P>
          If you are a US user, you and Finava agree to resolve disputes through binding individual
          arbitration administered by the American Arbitration Association under its Consumer
          Arbitration Rules, rather than in court, and{" "}
          <Strong>both sides waive the right to a jury trial and to participate in a class action</Strong>.
          Small-claims court remains available for qualifying claims. You may opt out of this
          arbitration agreement by emailing <A href="mailto:hello@finava.ai">hello@finava.ai</A>{" "}
          within 30 days of first accepting these Terms. This section does not apply to consumers in
          the EU or UK, who may bring claims in their local courts.
        </P>
      </Section>

      <Section title="14. Termination">
        <P>
          You can stop using the Service or delete your account at any time (Settings → Privacy
          &amp; Data). We may suspend or terminate your access for breach of these Terms or to
          protect the Service, with notice where practicable. Sections that by their nature should
          survive (including 2, 3, 9, 11, 12, and 13) survive termination.
        </P>
      </Section>

      <Section title="15. Changes to these Terms">
        <P>
          We may update these Terms. For material changes we will give reasonable advance notice
          (for example by email or in-app notice); continued use after the effective date means you
          accept the updated Terms.
        </P>
      </Section>

      <Section title="16. Governing law">
        <P>
          These Terms are governed by the laws of the State of Delaware, USA, without regard to
          conflict-of-law rules, except where the law of your country of residence mandatorily
          applies (for example, consumer protections for EU/UK residents).
        </P>
      </Section>

      <Section title="17. Contact">
        <P>
          Questions about these Terms: <A href="mailto:hello@finava.ai">hello@finava.ai</A>.
        </P>
      </Section>
    </LegalShell>
  );
}
