"use client";
import { useEffect, useState } from "react";

/**
 * Live whole-seconds elapsed since `startedAt` (epoch ms), ticking once a
 * second. Returns 0 when `startedAt` is null. Drives the chat "Analyzing · Ns"
 * live timer; the frozen receipt uses the stored duration instead.
 */
export function useElapsedSeconds(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  if (startedAt == null) return 0;
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}
