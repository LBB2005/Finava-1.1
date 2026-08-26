"use client";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
}

/* Thin wrapper over the house `.btn` family (globals.css / design-system §8) so
   JSX call sites and raw `className="btn …"` markup render the exact same
   button — one recipe, not two. `sm`/`md` are the standard 28px control
   height; `lg` adds `.btn-lg` (34px) for modal footers. */
const variantClasses = {
  primary: "btn btn-primary",
  ghost: "btn btn-ghost",
  danger: "btn btn-danger",
  outline: "btn",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", children, ...props }, ref) => (
    <button
      ref={ref}
      className={`${variantClasses[variant]}${size === "lg" ? " btn-lg" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
);
Button.displayName = "Button";

export default Button;
