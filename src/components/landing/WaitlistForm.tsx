"use client";
import { useState, FormEvent } from "react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = "idle" | "loading" | "success" | "error";

export default function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setStatus("error");
      setMessage("Enter a valid email address.");
      return;
    }
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Something went wrong");
      }
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <section id="waitlist" className="bg-[var(--lp-bg-2)] border-y border-[var(--lp-border)]">
      <div className="max-w-[680px] mx-auto px-5 sm:px-8 py-24 md:py-28 text-center">
        <span className="lp-eyebrow text-[var(--lp-accent-2)]">Early access</span>
        <h2 className="lp-display mt-3 text-[clamp(2rem,4.5vw,3rem)] font-bold text-[var(--lp-text)]">
          Get early access.
        </h2>
        <p className="mt-5 text-[clamp(1rem,1.4vw,1.15rem)] leading-relaxed text-[var(--lp-text-secondary)]">
          Finava is in private beta. Join the waitlist and be first in line when we open the doors.
          Early waitlist members get{" "}
          <span className="text-[var(--lp-text)] font-semibold">3 months of Pro free.</span>
        </p>

        {status === "success" ? (
          <div className="mt-9 inline-flex flex-col items-center gap-3 rounded-2xl border border-[var(--lp-border-strong)] bg-[var(--lp-surface)] px-8 py-7">
            <span className="w-12 h-12 rounded-full bg-[rgba(52,211,153,0.14)] text-[var(--lp-bull)] flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <p className="text-[16px] font-semibold text-[var(--lp-text)]">You&apos;re on the list.</p>
            <p className="text-[13.5px] text-[var(--lp-text-secondary)]">
              We&apos;ll email you the moment access is ready.
            </p>
          </div>
        ) : (
          <>
            <form
              onSubmit={handleSubmit}
              className="mt-9 flex flex-col sm:flex-row items-stretch gap-3 max-w-md mx-auto"
            >
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === "error") setStatus("idle");
                }}
                placeholder="Your email address"
                aria-label="Email address"
                className="flex-1 px-4 py-3 rounded-xl bg-[var(--lp-surface)] border border-[var(--lp-border-strong)] text-[15px] text-[var(--lp-text)] placeholder:text-[var(--lp-muted)] outline-none focus:border-[var(--lp-accent)] transition-colors"
              />
              <button
                type="submit"
                disabled={status === "loading"}
                className="px-6 py-3 rounded-xl text-[15px] font-semibold text-[#070b16] bg-[var(--lp-accent)] hover:bg-[var(--lp-accent-2)] transition-colors disabled:opacity-60 whitespace-nowrap"
              >
                {status === "loading" ? "Joining…" : "Join the waitlist"}
              </button>
            </form>
            {status === "error" && (
              <p className="mt-3 text-[13px] text-[var(--lp-bear)]">{message}</p>
            )}
            <p className="mt-4 text-[12.5px] text-[var(--lp-muted)]">
              By joining, you agree to receive a confirmation and a short weekly update from Finava.
              Unsubscribe anytime. See our{" "}
              <a href="/privacy" className="underline hover:text-[var(--lp-text)]">Privacy Policy</a>.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
