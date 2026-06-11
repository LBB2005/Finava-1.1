import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/firebase-admin";
import Markdown from "@/components/chat/Markdown";

interface SharedMessage {
  role: "user" | "assistant";
  content: string;
}

interface ShareDoc {
  title: string;
  messages: SharedMessage[];
  createdAt: string;
}

async function loadShare(id: string): Promise<ShareDoc | null> {
  const snap = await db.collection("shares").doc(id).get();
  if (!snap.exists) return null;
  return snap.data() as ShareDoc;
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const share = await loadShare(id);
  return {
    title: share ? `${share.title} — Finava` : "Shared conversation — Finava",
    description: "AI investment research conversation shared from Finava.",
  };
}

export default async function SharePage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const share = await loadShare(id);
  if (!share) notFound();

  const sharedDate = new Date(share.createdAt).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg)" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-10 flex items-center justify-between px-6 py-3.5"
        style={{
          background: "color-mix(in oklab, var(--color-bg) 88%, transparent)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <Link href="/" className="serif text-[17px] font-extrabold tracking-[0.12em]" style={{ color: "var(--color-text)" }}>
          FINAVA
        </Link>
        <Link
          href="/"
          className="text-[12.5px] font-semibold px-3.5 py-1.5 rounded-[8px]"
          style={{ background: "var(--color-accent)", color: "white" }}
        >
          Try Finava
        </Link>
      </header>

      <main className="max-w-[760px] mx-auto px-5 py-10">
        <p className="mono text-[10.5px] uppercase tracking-[0.08em] mb-2" style={{ color: "var(--color-muted)" }}>
          Shared conversation · {sharedDate}
        </p>
        <h1 className="serif text-[28px] font-bold leading-[1.15] mb-8" style={{ color: "var(--color-text)", letterSpacing: "-0.015em" }}>
          {share.title}
        </h1>

        <div className="flex flex-col gap-6">
          {share.messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div
                  className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md text-[14px] leading-[1.55]"
                  style={{ background: "var(--color-user-bubble)", color: "white" }}
                >
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="flex gap-3">
                <span
                  className="serif flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold"
                  style={{ background: "var(--color-accent)", color: "white" }}
                >
                  F
                </span>
                <div className="flex-1 min-w-0 text-[14px] leading-[1.6]" style={{ color: "var(--color-text)" }}>
                  <Markdown>{m.content}</Markdown>
                </div>
              </div>
            )
          )}
        </div>

        {/* CTA footer */}
        <div
          className="mt-12 rounded-2xl px-6 py-7 text-center"
          style={{ background: "var(--color-accent-light)", border: "1px solid var(--color-accent-medium)" }}
        >
          <p className="serif text-[19px] font-bold mb-1.5" style={{ color: "var(--color-text)" }}>
            Research stocks with AI agents
          </p>
          <p className="text-[13px] mb-4" style={{ color: "var(--color-text-secondary)" }}>
            Finava runs 15 specialist agents over your portfolio, watchlists, and any ticker.
          </p>
          <Link
            href="/"
            className="inline-block text-[13px] font-semibold px-5 py-2.5 rounded-[10px]"
            style={{ background: "var(--color-accent)", color: "white" }}
          >
            Join the waitlist
          </Link>
        </div>

        <p className="text-center text-[10.5px] mt-8 tracking-[0.04em]" style={{ color: "var(--color-muted)" }}>
          Not financial advice · Always do your own research
        </p>
      </main>
    </div>
  );
}
