"use client";
import { useRouter } from "next/navigation";
import { useQuotes } from "@/hooks/useQuotes";
import { useChatStore } from "@/stores/chatStore";
import AddToWatchlistButton from "@/components/watchlist/AddToWatchlistButton";
import type { StockProfile } from "@/lib/stockData";
import type { TickerSnapshot } from "@/lib/finnhub";

interface Props {
  ticker: string;
  profile: StockProfile | null;
  fallbackQuote: TickerSnapshot | null;
}

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export default function StockHeader({ ticker, profile, fallbackQuote }: Props) {
  const router = useRouter();
  const { setPendingMessage, reset } = useChatStore();
  const { quoteMap } = useQuotes([ticker]);

  function askAi() {
    reset();
    setPendingMessage(`Give me your take on ${ticker}${profile?.name ? ` (${profile.name})` : ""}.`);
    router.push("/chat");
  }

  // Prefer the live polled quote; fall back to the bundle's snapshot.
  const live = quoteMap.get(ticker);
  const price = live?.price ?? fallbackQuote?.price ?? 0;
  const changePct = live?.changePct ?? fallbackQuote?.changePct ?? 0;
  const change = live?.change ?? fallbackQuote?.change ?? 0;
  const up = changePct >= 0;
  const hasPrice = price > 0;

  return (
    <div
      className="flex-shrink-0 px-7 py-4"
      style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg)" }}
    >
      <div className="max-w-[1100px] mx-auto flex items-center justify-between gap-4">
        {/* Identity + price */}
        <div className="flex items-center gap-4 min-w-0">
          {profile?.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.logo}
              alt=""
              width={42}
              height={42}
              className="rounded-[10px] flex-shrink-0"
              style={{ border: "1px solid var(--color-border)", objectFit: "contain", background: "white" }}
            />
          ) : (
            <div
              className="w-[42px] h-[42px] rounded-[10px] flex items-center justify-center text-[13px] font-bold flex-shrink-0"
              style={{ background: "var(--color-accent-light)", color: "var(--color-accent)" }}
            >
              {ticker.slice(0, 2)}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="m-0 text-[19px] font-bold tracking-[-0.01em] text-[var(--color-text)]" style={{ fontFamily: "var(--font-serif)" }}>
                {ticker}
              </h1>
              {profile?.exchange && (
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-[5px] text-[var(--color-muted)]" style={{ background: "var(--color-surface-2)" }}>
                  {profile.exchange}
                </span>
              )}
            </div>
            <p className="text-[12px] text-[var(--color-text-secondary)] truncate max-w-[280px]">
              {profile?.name ?? "—"}{profile?.industry ? ` · ${profile.industry}` : ""}
            </p>
          </div>

          {/* Big live price */}
          <div className="flex items-baseline gap-2.5 ml-3 pl-4" style={{ borderLeft: "1px solid var(--color-border)" }}>
            <span className="text-[26px] font-bold tabular-nums leading-none text-[var(--color-text)]" style={{ fontFamily: "var(--font-serif)" }}>
              {hasPrice ? `$${fmt(price)}` : "—"}
            </span>
            {hasPrice && (
              <span className="text-[13px] font-semibold tabular-nums" style={{ color: up ? "var(--color-bull)" : "var(--color-bear)" }}>
                {up ? "+" : ""}{fmt(change)} ({up ? "+" : ""}{fmt(changePct)}%)
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <AddToWatchlistButton ticker={ticker} variant="button" />
          <button
            onClick={askAi}
            className="text-[12px] px-3 py-[6px] rounded-[9px] transition-all duration-150"
            style={{ border: "1px solid var(--color-accent)", background: "var(--color-accent)", color: "white" }}
          >
            Ask AI about {ticker}
          </button>
        </div>
      </div>
    </div>
  );
}
