"use client";
import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", ...props }, ref) => (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wide">
          {label}
        </label>
      )}
      <input
        ref={ref}
        className={`std-focus w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] transition ${error ? "border-[var(--color-bear)]" : ""} ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-[var(--color-bear)]">{error}</span>}
    </div>
  )
);
Input.displayName = "Input";

export default Input;
