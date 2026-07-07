import type { ReactNode } from "react";

/** Uppercase muted micro-label, matching the app's `Eyebrow` convention. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, textTransform: "uppercase",
      letterSpacing: "0.16em", color: "var(--color-muted)",
    }}>{children}</span>
  );
}

/** Standard surface card used across the Investor DNA room. */
export function Card({ title, action, children }: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-lg)",
      padding: "20px 24px",
      background: "var(--color-surface)",
    }}>
      {(title || action) && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, marginBottom: 16,
        }}>
          {title && <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text)", margin: 0 }}>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
