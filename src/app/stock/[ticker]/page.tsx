"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useStockBundle } from "@/hooks/useStock";
import { useQuotes } from "@/hooks/useQuotes";
import { useToast } from "@/hooks/useToast";
import StockHero from "@/components/stock/StockHero";
import { OverviewTab, FinancialsTab, AnalystsTab, NewsTab } from "@/components/stock/StockTabs";
import { DcfTab } from "@/components/stock/DcfTab";
import { LucraTab } from "@/components/stock/LucraTab";

const TABS = ["Overview", "Financials", "Analysts", "News", "DCF", "Lucra"] as const;
type Tab = (typeof TABS)[number];

export default function StockPage() {
  const params = useParams<{ ticker: string }>();
  const router = useRouter();
  const toast = useToast();
  const ticker = (params?.ticker ?? "").toUpperCase();

  const { bundle, error, isLoading } = useStockBundle(ticker || null);
  const { quoteMap } = useQuotes(ticker ? [ticker] : []);
  const [tab, setTab] = useState<Tab>("Overview");

  // Surface genuine load failures via a toast in addition to the inline state.
  // A 404 (unknown symbol) is a user-input issue already explained clearly in
  // the full-page state, so we skip toasting for it to avoid redundant noise.
  useEffect(() => {
    if (error && error.status !== 404) {
      toast.error(`Couldn't load ${ticker}. The data service may be unavailable — please retry.`);
    }
  }, [error, ticker, toast]);

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
          className="text-[12px] px-3.5 py-[7px] rounded-[6px] mt-1"
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
      <div className="research-root h-full overflow-y-auto" style={{ background: "var(--color-bg)" }} aria-busy="true" aria-label={`Loading ${ticker}`}>
        <div style={{ padding: "22px 36px 0", background: "linear-gradient(180deg, var(--color-accent-light), transparent 80%)" }}>
          <div className="flex items-center gap-3.5">
            <div className="w-[44px] h-[44px] rounded-[8px] skeleton" />
            <div className="flex flex-col gap-2">
              <div className="h-[20px] w-[160px] skeleton" />
              <div className="h-[12px] w-[120px] skeleton" />
            </div>
          </div>
          <div className="h-[46px] w-[200px] skeleton mt-4 rounded-[6px]" />
          <div className="h-[300px] skeleton mt-3 rounded-[6px]" />
        </div>
      </div>
    );
  }

  /* ── Loaded ───────────────────────────────────────────────────────────── */
  const livePrice = quoteMap.get(ticker)?.price ?? bundle.quote?.price ?? null;

  return (
    <div className="research-root stock-page h-full overflow-y-auto" style={{ background: "var(--color-bg)" }}>
      <StockHero
        ticker={ticker}
        profile={bundle.profile}
        fallbackQuote={bundle.quote}
        initialCandles={bundle.candles}
        initialRange={bundle.candleRange}
      />

      {/* Sticky tab bar — research .tbtn vocabulary */}
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "12px 36px",
          borderTop: "1px solid var(--color-border)",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-surface)",
          position: "sticky",
          top: 0,
          zIndex: 5,
        }}
      >
        {TABS.map((t) => (
          <button key={t} className={"tbtn" + (tab === t ? " on" : "")} onClick={() => setTab(t)}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ padding: "22px 36px 48px" }}>
        {tab === "Overview" && (
          <OverviewTab ticker={ticker} profile={bundle.profile} keyStats={bundle.keyStats} sentiment={bundle.sentiment} />
        )}
        {tab === "Financials" && <FinancialsTab fundamentals={bundle.fundamentals} />}
        {tab === "Analysts" && <AnalystsTab analysts={bundle.analysts} price={livePrice} />}
        {tab === "News" && <NewsTab news={bundle.news} />}
        {tab === "DCF" && <DcfTab ticker={ticker} />}
        {tab === "Lucra" && <LucraTab ticker={ticker} />}
      </div>
    </div>
  );
}
