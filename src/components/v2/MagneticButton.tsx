"use client";
import { useEffect, useRef } from "react";
import gsap from "gsap";

// CTA that leans gently toward the cursor within a 90px radius. Skipped under
// prefers-reduced-motion.
export default function MagneticButton({
  children,
  onClick,
  type = "button",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const xTo = gsap.quickTo(el, "x", { duration: 0.4, ease: "power3" });
    const yTo = gsap.quickTo(el, "y", { duration: 0.4, ease: "power3" });
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) < 110) {
        xTo(dx * 0.22);
        yTo(dy * 0.22);
      } else {
        xTo(0);
        yTo(0);
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      gsap.set(el, { x: 0, y: 0 });
    };
  }, []);

  return (
    <button ref={ref} type={type} onClick={onClick} disabled={disabled} className="v2-cta">
      {children}
    </button>
  );
}
