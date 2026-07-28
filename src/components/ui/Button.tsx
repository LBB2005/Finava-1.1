"use client";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
}

/* Token-backed variants — see docs/design-system.md §8. Never use Tailwind
   palette classes here; semantic colors must survive dark mode + accent swap. */
const variantClasses = {
  primary:
    "bg-[var(--color-accent)] text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50",
  ghost:
    "bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]",
  danger:
    "bg-transparent border border-[color-mix(in_oklab,var(--color-bear)_35%,transparent)] text-[var(--color-bear)] hover:bg-[color-mix(in_oklab,var(--color-bear)_8%,transparent)]",
  outline:
    "border border-[var(--color-border-strong)] text-[var(--color-text)] hover:bg-[var(--color-surface-2)]",
};

const sizeClasses = {
  sm: "px-3 py-1.5 text-[length:var(--text-sm)]",
  md: "px-4 py-2 text-[length:var(--text-sm)]",
  lg: "px-5 py-2.5 text-[length:var(--text-body)]",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", children, ...props }, ref) => (
    <button
      ref={ref}
      className={`inline-flex items-center gap-2 rounded-[var(--radius-sm)] font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
);
Button.displayName = "Button";

export default Button;
