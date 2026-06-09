"use client";

import { useEffect, useRef } from "react";

// Subtle hex-lattice that breathes in slow waves and ripples toward the cursor.
// Sits behind the hero content at low opacity — pure canvas, pointer-events: none.
export default function HoneycombBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mouse = { x: -9999, y: -9999 };
    let raf = 0;
    let t = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const hexPath = (cx: number, cy: number, r: number) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 180) * (60 * i - 30);
        const px = cx + r * Math.cos(a);
        const py = cy + r * Math.sin(a);
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
    };

    const draw = () => {
      t += 0.016;
      ctx.clearRect(0, 0, w, h);
      const r = 26;
      const dx = r * Math.sqrt(3);
      const dy = r * 1.5;
      const cols = Math.ceil(w / dx) + 2;
      const rows = Math.ceil(h / dy) + 2;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cx = col * dx + (row % 2 ? dx / 2 : 0);
          const cy = row * dy;
          const distC = Math.hypot(cx - w * 0.42, cy - h * 0.3);
          const wave = 0.5 + 0.5 * Math.sin(t - distC * 0.022);

          // cursor ripple
          const dm = Math.hypot(cx - mouse.x, cy - mouse.y);
          const near = Math.max(0, 1 - dm / 150);

          const stroke = 0.05 + wave * 0.11 + near * 0.35;
          hexPath(cx, cy, r - 3);
          ctx.strokeStyle = `rgba(77, 156, 248, ${stroke})`;
          ctx.lineWidth = 1;
          ctx.stroke();

          const fill = Math.max(0, (wave - 0.9) * 1.2) + near * 0.22;
          if (fill > 0.01) {
            ctx.fillStyle = `rgba(124, 192, 255, ${Math.min(0.4, fill)})`;
            ctx.fill();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const onLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
    };

    resize();
    window.addEventListener("resize", resize);
    if (reduce) {
      draw();
      cancelAnimationFrame(raf); // single static frame
    } else {
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseleave", onLeave);
      raf = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{
        opacity: 0.55,
        maskImage: "radial-gradient(70% 60% at 45% 28%, #000 0%, transparent 78%)",
        WebkitMaskImage: "radial-gradient(70% 60% at 45% 28%, #000 0%, transparent 78%)",
      }}
    />
  );
}
