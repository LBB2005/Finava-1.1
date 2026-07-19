"use client";
import { useId, useRef, useState } from "react";

type Placement = "top" | "bottom" | "left" | "right";

interface Props {
  /** Tooltip text. */
  label: string;
  /** Where the bubble sits relative to the trigger. Default "top". */
  placement?: Placement;
  /** Show delay in ms (hover only; focus is immediate). Default 250. */
  delay?: number;
  /** The trigger element — should be a single focusable child (e.g. a button). */
  children: React.ReactNode;
  /** Optional class on the inline wrapper span. */
  className?: string;
}

const POS: Record<Placement, React.CSSProperties> = {
  top: { bottom: "calc(100% + 7px)", left: "50%", transform: "translateX(-50%)" },
  bottom: { top: "calc(100% + 7px)", left: "50%", transform: "translateX(-50%)" },
  left: { right: "calc(100% + 7px)", top: "50%", transform: "translateY(-50%)" },
  right: { left: "calc(100% + 7px)", top: "50%", transform: "translateY(-50%)" },
};

/**
 * Lightweight, themed tooltip. Appears on hover (after a short delay) and on
 * keyboard focus (immediately), so icon-only buttons get a discoverable label.
 * Keep an `aria-label` on the trigger itself for screen readers — this bubble is
 * supplemental and wired via `aria-describedby`.
 */
export default function Tooltip({ label, placement = "top", delay = 250, children, className }: Props) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const id = useId();

  function show(immediate = false) {
    if (timer.current) window.clearTimeout(timer.current);
    if (immediate) { setOpen(true); return; }
    timer.current = window.setTimeout(() => setOpen(true), delay);
  }
  function hide() {
    if (timer.current) window.clearTimeout(timer.current);
    setOpen(false);
  }

  return (
    <span
      className={`relative inline-flex${className ? ` ${className}` : ""}`}
      onMouseEnter={() => show()}
      onMouseLeave={hide}
      onFocus={() => show(true)}
      onBlur={hide}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          id={id}
          className="pointer-events-none absolute z-[var(--z-tooltip)] whitespace-nowrap text-[11px] font-medium leading-none fade-in"
          style={{
            ...POS[placement],
            padding: "5px 8px",
            background: "var(--color-bg)",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm, 6px)",
            boxShadow: "0 8px 28px rgba(15, 23, 42, 0.08)",
          }}
        >
          {label}
        </span>
      )}
    </span>
  );
}
