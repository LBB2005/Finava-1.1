"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  usePlaidLink,
  type PlaidLinkOnSuccessMetadata,
} from "react-plaid-link";
import { authFetch } from "@/lib/authFetch";

interface Props {
  /** Called after holdings are imported so the page can revalidate. */
  onLinked?: () => void | Promise<void>;
  /** Button class — defaults to the topbar "tbtn on" style. */
  className?: string;
  label?: string;
}

type Phase = "idle" | "starting" | "importing" | "error";

/**
 * Opens Plaid Link (Investments) and, on success, exchanges the public token
 * and imports holdings into the portfolio. Self-contained: fetches its own
 * link token on click and auto-opens once Plaid is ready.
 */
export default function ConnectBrokerageButton({
  onLinked,
  className = "tbtn on",
  label = "CONNECT BROKERAGE",
}: Props) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  // Intent to auto-open once Plaid Link becomes ready. A ref (not state) so the
  // readiness effect can clear it without triggering a synchronous re-render.
  const autoOpenRef = useRef(false);

  const onSuccess = useCallback(
    async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      setPhase("importing");
      setMessage(null);
      try {
        const res = await authFetch("/api/plaid/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ public_token: publicToken, institution: metadata.institution }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Import failed");
        setPhase("idle");
        const imported = data.imported ?? 0;
        setMessage(`Imported ${imported} position${imported === 1 ? "" : "s"}`);
        await onLinked?.();
        // Clear the success note after a moment.
        window.setTimeout(() => setMessage(null), 4000);
      } catch (e) {
        setPhase("error");
        setMessage(e instanceof Error ? e.message : "Import failed");
      }
    },
    [onLinked]
  );

  // Reset the button when the user closes Link without finishing.
  const onExit = useCallback(() => {
    setPhase((p) => (p === "starting" ? "idle" : p));
  }, []);

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess, onExit });

  // Auto-open once the freshly fetched token makes Plaid Link ready.
  useEffect(() => {
    if (autoOpenRef.current && ready && linkToken) {
      autoOpenRef.current = false;
      open();
    }
  }, [ready, linkToken, open]);

  async function handleClick() {
    if (phase === "starting" || phase === "importing") return;
    setMessage(null);
    // Token already loaded → just reopen.
    if (linkToken && ready) {
      open();
      return;
    }
    setPhase("starting");
    try {
      const res = await authFetch("/api/plaid/create-link-token", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start Plaid");
      autoOpenRef.current = true;
      setLinkToken(data.link_token);
    } catch (e) {
      setPhase("error");
      setMessage(e instanceof Error ? e.message : "Could not start Plaid");
    }
  }

  const buttonText =
    phase === "starting" ? "STARTING…" : phase === "importing" ? "IMPORTING…" : label;

  return (
    <div className="relative inline-flex flex-col items-stretch">
      <button
        onClick={handleClick}
        className={className}
        disabled={phase === "starting" || phase === "importing"}
        title="Link a brokerage account via Plaid"
      >
        {buttonText}
      </button>
      {message && (
        <span
          className="absolute top-full mt-1 right-0 whitespace-nowrap text-[10.5px] font-medium"
          style={{ color: phase === "error" ? "var(--color-bear)" : "var(--color-bull)" }}
        >
          {message}
        </span>
      )}
    </div>
  );
}
