"use client";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
}

const variantClasses = {
  primary:
    "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50",
  ghost:
    "bg-transparent text-[var(--color-muted)] hover:bg-[var(--color-accent-light)] hover:text-[var(--color-text)]",
  danger:
    "bg-[color-mix(in_srgb,var(--color-bear)_8%,transparent)] text-[var(--color-bear)] hover:bg-[color-mix(in_srgb,var(--color-bear)_14%,transparent)]",
  outline:
    "border border-[var(--color-border-strong)] text-[var(--color-text)] hover:bg-[var(--color-accent-light)]",
};

const sizeClasses = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", children, ...props }, ref) => (
    <button
      ref={ref}
      className={`inline-flex items-center gap-2 rounded-lg font-medium transition-colors cursor-pointer disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
);
Button.displayName = "Button";

export default Button;
