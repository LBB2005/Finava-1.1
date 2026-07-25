/**
 * Calm Orb thinking indicator — the "waiting for response" state from the
 * Claude Design "Calm Orb" handoff: a gently breathing Finava avatar beside a
 * breathing navy dot and a shimmering label. Used for the Simple Chat waiting
 * state (Agent / Deep Research keep their richer "Research crew" panel).
 *
 * When `startedAt` is supplied it appends a faint live "· Ns" timer that counts
 * up while thinking (design A).
 */
import { LiveElapsed } from "./ResponseTiming";

export default function TypingIndicator({
  label = "Thinking through your portfolio",
  startedAt = null,
  accent = "var(--color-accent)",
  scanning = false,
}: {
  label?: string;
  startedAt?: number | null;
  /** Orb/dot colour — Discover passes the teal --color-discover. */
  accent?: string;
  /** Show the "ticker-bars" equalizer so it reads as an active market scan. */
  scanning?: boolean;
}) {
  return (
    <div className="flex gap-[14px] fade-in">
      {/* Breathing avatar */}
      <div
        className="calm-orb-avatar w-[30px] h-[30px] rounded-[9px] flex items-center justify-center flex-shrink-0 text-white text-[13px] font-black"
        style={{ background: accent, fontFamily: "var(--font-serif)", letterSpacing: "0.04em" }}
      >
        F
      </div>

      <div className="flex items-center gap-[11px] pt-1">
        {/* Breathing navy dot with glow ring */}
        <span className="relative flex-shrink-0" style={{ width: 11, height: 11 }}>
          <span className="calm-orb-dot absolute inset-0 rounded-full" style={{ background: accent }} />
        </span>
        <span className="flex items-baseline gap-[6px]">
          <span className="shimmer-text text-[14px] font-medium">{label}</span>
          {scanning && (
            <span className="ticker-bars" style={{ color: accent }} aria-hidden>
              <i /><i /><i /><i />
            </span>
          )}
          {startedAt != null && (
            <span className="text-[13px]" style={{ color: "var(--color-muted)" }}>
              · <LiveElapsed startedAt={startedAt} />
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
