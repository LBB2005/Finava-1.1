"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";
import Toast, { type ToastData, type ToastVariant, type ToastAction } from "./Toast";

export interface ShowToastOptions {
  action?: ToastAction;
  /** Override the auto-dismiss delay (ms). Pass `0` to persist until dismissed. */
  duration?: number;
}

export interface ToastContextValue {
  show: (variant: ToastVariant, message: string, opts?: ShowToastOptions) => string;
  dismiss: (id: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

/** Default auto-dismiss. Errors persist longer since they usually need a response. */
const DEFAULT_DURATION: Record<ToastVariant, number> = {
  info: 5000,
  success: 5000,
  error: 8000,
};

let toastCounter = 0;

// Hydration-safe client gate: server snapshot is `false`, client is `true`.
// Avoids a setState-in-effect while keeping the portal off the server render.
const emptySubscribe = () => () => {};

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  // Track per-toast timers so we can clear them on dismiss / unmount.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (variant: ToastVariant, message: string, opts?: ShowToastOptions) => {
      const id = `toast-${++toastCounter}`;
      setToasts((prev) => [...prev, { id, variant, message, action: opts?.action }]);

      // Actionable toasts persist by default so the action (e.g. chat "Retry")
      // stays available; non-actionable toasts use the per-variant default.
      const fallbackDuration = opts?.action ? 0 : DEFAULT_DURATION[variant];
      const duration = opts?.duration ?? fallbackDuration;
      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismiss]
  );

  // Clear every pending timer when the provider unmounts.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach(clearTimeout);
      map.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
            {/* Errors get an assertive live region so they interrupt the user. */}
            <div role="alert" aria-live="assertive" className="flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {toasts
                  .filter((toast) => toast.variant === "error")
                  .map((toast) => (
                    <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
                  ))}
              </AnimatePresence>
            </div>
            {/* Success / info are polite — announced without interrupting. */}
            <div role="status" aria-live="polite" className="flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {toasts
                  .filter((toast) => toast.variant !== "error")
                  .map((toast) => (
                    <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
                  ))}
              </AnimatePresence>
            </div>
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}
