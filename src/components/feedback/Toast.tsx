"use client";

import { motion, useReducedMotion } from "motion/react";

export type ToastVariant = "error" | "success" | "info";

export interface ToastAction {
  label: string;
  /** Invoked when the action button is pressed. The toast is dismissed afterwards. */
  onClick: () => void;
}

export interface ToastData {
  id: string;
  variant: ToastVariant;
  message: string;
  action?: ToastAction;
}

interface ToastProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

/**
 * Per-variant accent + tinted surface, derived from the existing semantic
 * tokens (`--color-bear`, `--color-bull`, `--color-accent`) so toasts inherit
 * the app's light/dark theming for free. Backgrounds use the repo's
 * `color-mix(in oklab, ...)` convention.
 */
const variantStyles: Record<
  ToastVariant,
  { accent: string; tint: string; icon: React.ReactNode }
> = {
  error: {
    accent: "var(--color-bear)",
    tint: "color-mix(in oklab, var(--color-bear) 7%, var(--color-surface))",
    icon: <CircleAlertIcon />,
  },
  success: {
    accent: "var(--color-bull)",
    tint: "color-mix(in oklab, var(--color-bull) 7%, var(--color-surface))",
    icon: <CheckCircleIcon />,
  },
  info: {
    accent: "var(--color-accent)",
    tint: "color-mix(in oklab, var(--color-accent) 7%, var(--color-surface))",
    icon: <InfoIcon />,
  },
};

export default function Toast({ toast, onDismiss }: ToastProps) {
  const reduceMotion = useReducedMotion();
  const { accent, tint, icon } = variantStyles[toast.variant];
  const { action } = toast;

  return (
    <motion.div
      layout
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-auto flex w-full items-start gap-3 overflow-hidden rounded-[var(--radius-md)] border p-3 pl-3.5"
      style={{
        background: tint,
        borderColor: "var(--color-border)",
        boxShadow: "var(--shadow-pop)",
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <span aria-hidden className="mt-0.5 shrink-0" style={{ color: accent }}>
        {icon}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-[13px] leading-snug text-[var(--color-text)]">
          {toast.message}
        </p>
        {action && (
          <button
            type="button"
            onClick={() => {
              action.onClick();
              onDismiss(toast.id);
            }}
            className="-ml-1 w-fit rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[12px] font-semibold transition-colors hover:bg-[color-mix(in_oklab,var(--color-text)_6%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
            style={{ color: accent }}
          >
            {action.label}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="-mr-1 -mt-0.5 shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--color-muted)] transition-colors hover:bg-[color-mix(in_oklab,var(--color-text)_6%,transparent)] hover:text-[var(--color-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]"
      >
        <CloseIcon />
      </button>
    </motion.div>
  );
}

/* ── Inline icons (16px, currentColor) — keeps the component self-contained ── */

function CircleAlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
