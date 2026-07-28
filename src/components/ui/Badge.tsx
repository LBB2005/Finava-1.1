interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info";
  className?: string;
}

/* Token-backed — 12% semantic fill + semantic ink (design-system §8). */
const variantClasses = {
  default: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  success:
    "bg-[color-mix(in_oklab,var(--color-bull)_12%,transparent)] text-[var(--color-bull)]",
  warning:
    "bg-[color-mix(in_oklab,var(--color-warn)_12%,transparent)] text-[var(--color-warn)]",
  danger:
    "bg-[color-mix(in_oklab,var(--color-bear)_12%,transparent)] text-[var(--color-bear)]",
  info: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
};

export default function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[length:var(--text-meta)] font-semibold ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
