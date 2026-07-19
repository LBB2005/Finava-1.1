interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info";
  className?: string;
}

const variantClasses = {
  default: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  success: "bg-[color-mix(in_srgb,var(--color-bull)_10%,transparent)] text-[var(--color-bull)]",
  warning: "bg-[color-mix(in_srgb,var(--color-warn)_10%,transparent)] text-[var(--color-warn)]",
  danger: "bg-[color-mix(in_srgb,var(--color-bear)_10%,transparent)] text-[var(--color-bear)]",
  info: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
};

export default function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
