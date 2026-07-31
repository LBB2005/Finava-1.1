"use client";
import { useAuth } from "@/context/AuthContext";

export default function DevAuthToggle() {
  const { devEnabled, devBypass, toggleDevBypass } = useAuth();
  if (!devEnabled) return null;

  return (
    <button
      onClick={toggleDevBypass}
      title="Dev-only: bypass sign-in. Mock user has no real token, so authenticated data calls won't work."
      style={{
        position: "fixed",
        bottom: 12,
        right: 12,
        zIndex: 9999,
        padding: "5px 10px",
        borderRadius: "var(--radius-sm)",
        fontSize: "var(--text-meta)",
        fontWeight: 700,
        letterSpacing: "0.02em",
        fontFamily: "var(--font-mono, monospace)",
        cursor: "pointer",
        color: devBypass ? "var(--color-on-accent)" : "var(--color-text-secondary)",
        background: devBypass ? "var(--color-accent)" : "var(--color-surface)",
        border: "1px solid var(--color-border)",
        boxShadow: "var(--shadow-pop)",
        opacity: 0.85,
      }}
    >
      {devBypass ? "● DEV AUTH ON" : "○ DEV AUTH OFF"}
    </button>
  );
}
