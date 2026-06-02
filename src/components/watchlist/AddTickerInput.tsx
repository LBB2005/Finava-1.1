"use client";
import { useState } from "react";
import { UNIVERSE } from "@/lib/research";

export default function AddTickerInput({ onAdd }: { onAdd: (ticker: string) => void }) {
  const [value, setValue] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const sym = value.trim().toUpperCase();
    if (!sym) return;
    onAdd(sym);
    setValue("");
  }

  return (
    <form onSubmit={submit} className="flex items-center" style={{ gap: 8 }}>
      <input
        list="watchlist-ticker-options"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add ticker (e.g. NVDA)"
        className="tsel"
        style={{ width: 200, textTransform: "uppercase" }}
        aria-label="Add ticker"
      />
      <datalist id="watchlist-ticker-options">
        {UNIVERSE.map((s) => (
          <option key={s.ticker} value={s.ticker}>{s.name}</option>
        ))}
      </datalist>
      <button type="submit" className="tbtn">＋ Add</button>
    </form>
  );
}
