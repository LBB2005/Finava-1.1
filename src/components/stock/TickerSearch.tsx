"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  /** Visual size: "sm" for topbars, "md" for standalone. */
  size?: "sm" | "md";
  placeholder?: string;
}

/** A lookup box that routes to any symbol's research page. */
export default function TickerSearch({ size = "sm", placeholder = "Search ticker…" }: Props) {
  const router = useRouter();
  const [value, setValue] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const sym = value.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
    if (!sym) return;
    setValue("");
    router.push(`/stock/${sym}`);
  }

  const pad = size === "md" ? "py-2.5 pl-9 pr-3 text-[13px]" : "py-[6px] pl-8 pr-2.5 text-[12px]";

  return (
    <form onSubmit={submit} className="relative">
      <svg
        className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
        width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2" strokeLinecap="round"
      >
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
      </svg>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className={`bg-transparent rounded-[9px] focus:outline-none ${pad}`}
        style={{ border: "1px solid var(--color-border)", color: "var(--color-text)", width: size === "md" ? 240 : 160 }}
        aria-label="Search ticker"
        spellCheck={false}
        autoCapitalize="characters"
      />
    </form>
  );
}
