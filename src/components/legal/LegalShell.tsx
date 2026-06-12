import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared chrome for static legal pages (/privacy, /terms). Reuses the landing
 * page's dark theme tokens (scoped under .landing-root) so these pages match
 * the marketing site regardless of app theme.
 */

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5 select-none">
      <span className="w-8 h-8 rounded-lg bg-[var(--lp-accent)] flex items-center justify-center shadow-sm">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#070b16" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
      </span>
      <span
        className="text-[19px] font-black uppercase leading-none text-[var(--lp-text)]"
        style={{ fontFamily: "var(--font-serif)", letterSpacing: "0.14em" }}
      >
        Finava
      </span>
    </Link>
  );
}

export function LegalShell({
  title,
  effectiveDate,
  children,
}: {
  title: string;
  effectiveDate: string;
  children: ReactNode;
}) {
  return (
    <div className="landing-root min-h-screen">
      <header className="border-b border-[var(--lp-border)]">
        <nav className="max-w-[820px] mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Wordmark />
          <Link
            href="/"
            className="text-[13.5px] font-medium text-[var(--lp-text-secondary)] hover:text-[var(--lp-text)] transition-colors"
          >
            Back to Finava
          </Link>
        </nav>
      </header>

      <main className="max-w-[820px] mx-auto px-5 sm:px-8 py-14 md:py-20">
        <h1 className="lp-display text-[clamp(1.9rem,4vw,2.6rem)] font-bold text-[var(--lp-text)]">{title}</h1>
        <p className="mt-3 text-[13.5px] text-[var(--lp-muted)]">Effective date: {effectiveDate}</p>
        <div className="legal-prose mt-10">{children}</div>
      </main>

      <footer className="border-t border-[var(--lp-border)] bg-[var(--lp-bg-2)]">
        <div className="max-w-[820px] mx-auto px-5 sm:px-8 py-10">
          <div className="flex flex-wrap gap-x-6 gap-y-2 mb-6">
            <Link href="/privacy" className="text-[13px] text-[var(--lp-muted)] hover:text-[var(--lp-text)] transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-[13px] text-[var(--lp-muted)] hover:text-[var(--lp-text)] transition-colors">
              Terms of Service
            </Link>
            <a href="mailto:hello@finava.ai" className="text-[13px] text-[var(--lp-muted)] hover:text-[var(--lp-text)] transition-colors">
              Contact
            </a>
          </div>
          <p className="text-[11.5px] leading-relaxed text-[var(--lp-muted)] max-w-3xl">
            Finava is not a registered investment adviser or broker-dealer. All content on this
            platform is for informational and educational purposes only and does not constitute
            financial, investment, or trading advice. Investing involves risk, including the
            possible loss of principal.
          </p>
          <p className="mt-5 text-[12px] text-[var(--lp-muted)]">© 2026 Finava. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

/* Lightweight prose primitives so the legal text stays readable without pulling
   in a typography plugin. */

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 className="text-[19px] font-bold text-[var(--lp-text)]">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="text-[14.5px] leading-relaxed text-[var(--lp-text-secondary)]">{children}</p>;
}

export function UL({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc pl-5 space-y-2">
      {items.map((item, i) => (
        <li key={i} className="text-[14.5px] leading-relaxed text-[var(--lp-text-secondary)]">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function Strong({ children }: { children: ReactNode }) {
  return <strong className="text-[var(--lp-text)] font-semibold">{children}</strong>;
}

export function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--lp-accent)] hover:text-[var(--lp-accent-2)] underline underline-offset-2 transition-colors"
    >
      {children}
    </a>
  );
}
