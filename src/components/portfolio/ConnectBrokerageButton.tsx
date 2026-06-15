"use client";
import { usePlaidConnect } from "./PlaidConnectProvider";

interface Props {
  /** Called after holdings are imported so the page can revalidate. */
  onLinked?: () => void | Promise<void>;
  /** Button class — defaults to the topbar "tbtn on" style. */
  className?: string;
  /** Inline style overrides for the button (e.g. rounded corners). */
  style?: React.CSSProperties;
  label?: string;
}

/**
 * Triggers Plaid Link via the app-wide {@link PlaidConnectProvider}. The actual
 * SDK/token lifecycle lives in the provider so it initializes exactly once,
 * regardless of how many of these buttons are mounted. Errors surface as toasts.
 */
export default function ConnectBrokerageButton({
  onLinked,
  className = "tbtn on",
  style,
  label = "CONNECT BROKERAGE",
}: Props) {
  const plaid = usePlaidConnect();
  const phase = plaid?.phase ?? "idle";
  const busy = phase === "starting" || phase === "importing";

  const buttonText =
    phase === "starting" ? "STARTING…" : phase === "importing" ? "IMPORTING…" : label;

  return (
    <button
      onClick={() => plaid?.connect(onLinked)}
      className={className}
      style={style}
      disabled={busy || !plaid}
      title="Link a brokerage account via Plaid"
    >
      {buttonText}
    </button>
  );
}
