/**
 * Human duration for the chat response timer — "8s" under a minute, "1m 4s"
 * from a minute up (a trailing "0s" is dropped, so exact minutes read "2m").
 * Shared by the live count-up suffix and the frozen "Analyzed in Ns" receipt
 * so both render identically.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}
