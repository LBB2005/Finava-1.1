"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { authFetch } from "@/lib/authFetch";
import { useToast } from "@/hooks/useToast";

export type PlaidPhase = "idle" | "starting" | "importing";

interface PlaidConnectApi {
  /** Open Plaid Link. `onLinked` fires after holdings import so the caller can revalidate. */
  connect: (onLinked?: () => void | Promise<void>) => void;
  phase: PlaidPhase;
}

const Ctx = createContext<PlaidConnectApi | null>(null);

/**
 * Single source of Plaid Link for the whole app. Mounting exactly one
 * `usePlaidLink` hook means the Plaid SDK script (`link-initialize.js`) is only
 * ever injected once — previously every <ConnectBrokerageButton> initialized its
 * own hook, so two mounted buttons (e.g. portfolio + settings, or topbar +
 * empty-state during a state transition) raced to embed the script twice.
 */
export function PlaidConnectProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<PlaidPhase>("idle");
  // Intent to auto-open once Link becomes ready after a fresh token fetch.
  const autoOpenRef = useRef(false);
  // The latest caller's revalidate callback — runs after a successful import.
  const onLinkedRef = useRef<(() => void | Promise<void>) | undefined>(undefined);

  const onSuccess = useCallback(
    async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      setPhase("importing");
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
        toast.success(`Imported ${imported} position${imported === 1 ? "" : "s"}`);
        await onLinkedRef.current?.();
      } catch (e) {
        setPhase("idle");
        toast.error(e instanceof Error ? e.message : "Couldn't import your holdings. Please try again.");
      }
    },
    [toast]
  );

  // Reset when the user closes Link without finishing.
  const onExit = useCallback(() => {
    setPhase((p) => (p === "starting" ? "idle" : p));
  }, []);

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess, onExit });

  // Auto-open once the freshly fetched token makes Link ready.
  useEffect(() => {
    if (autoOpenRef.current && ready && linkToken) {
      autoOpenRef.current = false;
      open();
    }
  }, [ready, linkToken, open]);

  const connect = useCallback(
    async (onLinked?: () => void | Promise<void>) => {
      onLinkedRef.current = onLinked;
      if (phase === "starting" || phase === "importing") return;
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
        setPhase("idle");
        toast.error(e instanceof Error ? e.message : "Couldn't reach Plaid. Check your connection and try again.");
      }
    },
    [phase, linkToken, ready, open, toast]
  );

  return <Ctx.Provider value={{ connect, phase }}>{children}</Ctx.Provider>;
}

/** Access the shared Plaid Link controller. Returns null outside the provider. */
export function usePlaidConnect(): PlaidConnectApi | null {
  return useContext(Ctx);
}
