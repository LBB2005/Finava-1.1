"use client";
import { useParams, useRouter } from "next/navigation";
import { useStockBundle } from "@/hooks/useStock";
import StockHeader from "@/components/stock/StockHeader";
import PriceChart from "@/components/stock/PriceChart";
import PositionCard from "@/components/stock/PositionCard";
import AiTakePanel from "@/components/stock/AiTakePanel";
import {
  KeyStatsPanel,
  AnalystPanel,
  FundamentalsPanel,
  InsiderPanel,
  NewsPanel,
} from "@/components/stock/StockPanels";

export default function StockPage() {
  const params = useParams<{ ticker: string }>();
  const router = useRouter();
  const ticker = (params?.ticker ?? "").toUpperCase();

  const { bundle, error, isLoading } = useStockBundle(ticker || null);

  /* ── Error states ─────────────────────────────────────────────────────── */
  if (error) {
    const notFound = error.status === 404;
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6" style={{ background: "var(--color-bg)" }}>
        <p className="text-[15px] font-semibold text-[var(--color-text)]" style={{ fontFamily: "var(--font-serif)" }}>
          {notFound ? `Couldn't find “${ticker}”` : "Couldn't load this stock"}
        </p>
        <p className="text-[12.5px] text-[var(--color-muted)] max-w-[360px] text-center">
          {notFound
            ? "Double-check the symbol, or try another ticker."
            : error.message || "The data service may be unavailable right now."}
        </p>
        <button
          onClick={() => router.push("/portfolio")}
          className="text-[12px] px-3.5 py-[7px] rounded-[9px] mt-1"
          style={{ border: "1px solid var(--color-accent)", background: "var(--color-accent)", color: "white" }}
        >
          Back to portfolio
        </button>
      </div>
    );
  }

  /* ── Loading state ────────────────────────────────────────────────────── */
  if (isLoading || !bundle) {
    return (
      <div className="flex flex-col h-full" style={{ background: "var(--color-bg)" }}>
        <div className="flex-shrink-0 px-7 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div className="max-w-[1100px] mx-auto flex items-center gap-4">
            <div className="w-[42px] h-[42px] rounded-[10px] animate-pulse" style={{ background: "var(--color-surface-2)" }} />
            <div className="flex flex-col gap-2">
              <div className="h-[18px] w-[120px] rounded animate-pulse" style={{ background: "var(--color-surface-2)" }} />
              <div className="h-[12px] w-[180px] rounded animate-pulse" style={{ background: "var(--color-surface-2)" }} />
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center text-[13px] text-[var(--color-muted)]">
          Loading {ticker}…
        </div>
      </div>
    );
  }

  /* ── Loaded ───────────────────────────────────────────────────────────── */
  const livePrice = bundle.quote?.price ?? null;

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <StockHeader ticker={ticker} profile={bundle.profile} fallbackQuote={bundle.quote} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1100px] mx-auto px-8 py-6 flex flex-col gap-[18px]">
          <PriceChart ticker={ticker} initialCandles={bundle.candles} initialRange={bundle.candleRange} />

          <div className="grid gap-[18px] items-start" style={{ gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)" }}>
            {/* Main column */}
            <div className="flex flex-col gap-[18px] min-w-0">
              <AiTakePanel ticker={ticker} sentiment={bundle.sentiment} />
              <FundamentalsPanel fundamentals={bundle.fundamentals} />
              <NewsPanel news={bundle.news} />
            </div>

            {/* Side column */}
            <div className="flex flex-col gap-[18px] min-w-0">
              <PositionCard ticker={ticker} />
              <KeyStatsPanel stats={bundle.keyStats} />
              <AnalystPanel analysts={bundle.analysts} price={livePrice} />
              <InsiderPanel trades={bundle.insider} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
