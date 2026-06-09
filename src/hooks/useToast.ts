"use client";

import { useContext, useMemo } from "react";
import {
  ToastContext,
  type ShowToastOptions,
} from "@/components/feedback/ToastProvider";

export interface ToastApi {
  error: (message: string, opts?: ShowToastOptions) => string;
  success: (message: string, opts?: ShowToastOptions) => string;
  info: (message: string, opts?: ShowToastOptions) => string;
  dismiss: (id: string) => void;
}

/**
 * Ergonomic toast API. Usage:
 *
 *   const toast = useToast();
 *   toast.error("Something failed", { action: { label: "Retry", onClick: retry } });
 *
 * Throws if called outside a <ToastProvider>.
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>.");
  }

  const { show, dismiss } = ctx;
  return useMemo<ToastApi>(
    () => ({
      error: (message, opts) => show("error", message, opts),
      success: (message, opts) => show("success", message, opts),
      info: (message, opts) => show("info", message, opts),
      dismiss,
    }),
    [show, dismiss]
  );
}

export default useToast;
