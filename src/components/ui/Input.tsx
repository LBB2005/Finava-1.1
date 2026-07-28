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
        <label className="eyebrow-label text-[var(--color-muted)]">
          {label}
        </label>
      )}
      <input
        ref={ref}
        className={`input ${error ? "!border-[var(--color-bear)]" : ""} ${className}`}
        {...props}
      />
      {error && (
        <span className="text-[length:var(--text-meta)] text-[var(--color-bear)]">{error}</span>
      )}
    </div>
  )
);
Input.displayName = "Input";

export default Input;
