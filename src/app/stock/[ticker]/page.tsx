"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useStockBundle } from "@/hooks/useStock";
import { useQuotes } from "@/hooks/useQuotes";
import { useToast } from "@/hooks/useToast";
import StockHero, { StatStrip } from "@/components/stock/StockHero";
import { OverviewTab, FinancialsTab, AnalystsTab, NewsTab } from "@/components/stock/StockTabs";
import { DcfTab } from "@/components/stock/DcfTab";
import { FinavaTab } from "@/components/stock/FinavaTab";
import ChatContextButton from "@/components/chat/ChatContextButton";

const TABS = ["Overview", "Financials", "Analysts", "News", "DCF", "Finava"] as const;
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
        <div style={{ padding: "22px var(--page-gutter) 0", background: "linear-gradient(180deg, var(--color-accent-light), transparent 80%)" }}>
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
  const chg = quoteMap.get(ticker)?.changePct ?? null;

  return (
    <div className="research-root stock-page h-full overflow-y-auto" style={{ background: "var(--color-bg)", scrollbarGutter: "stable both-edges" }}>
      <StockHero
        ticker={ticker}
        profile={bundle.profile}
        fallbackQuote={bundle.quote}
        initialCandles={bundle.candles}
        initialRange={bundle.candleRange}
        sentiment={bundle.sentiment}
      />

      {/* 12-stat terminal strip (F2d) */}
      <StatStrip keyStats={bundle.keyStats} quote={bundle.quote} analysts={bundle.analysts} />

      {/* Sticky tab bar — pill lenses + mini ticker/price (F2d) */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", rowGap: 12,
          padding: "10px var(--page-gutter)",
          borderBottom: "1px solid var(--color-border)",
          background: "color-mix(in oklab, var(--color-surface) 92%, transparent)",
          backdropFilter: "blur(8px)",
          position: "sticky", top: 0, zIndex: 5,
        }}
      >
        <div className="b-lenses b-lenses-pill">
          {TABS.map((t) => (
            <button key={t} className={"b-lens" + (tab === t ? " on" : "")} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span className="ticker-chip">{ticker}</span>
          {livePrice != null && (
            <span className="serif" style={{ fontSize: 16, fontWeight: 800, color: "var(--color-text)" }}>
              ${livePrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
          {chg != null && (
            <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: chg >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}>
              {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
            </span>
          )}
          <span style={{ width: 1, height: 22, background: "var(--color-border)" }} />
          <ChatContextButton context={`stock:${ticker}`} />
        </div>
      </div>

      {/* Tab content */}
      <div style={{ padding: "22px var(--page-gutter) 48px" }}>
        {tab === "Overview" && (
          <OverviewTab ticker={ticker} profile={bundle.profile} keyStats={bundle.keyStats} sentiment={bundle.sentiment} />
        )}
        {tab === "Financials" && <FinancialsTab fundamentals={bundle.fundamentals} />}
        {tab === "Analysts" && <AnalystsTab analysts={bundle.analysts} price={livePrice} />}
        {tab === "News" && <NewsTab news={bundle.news} />}
        {tab === "DCF" && <DcfTab ticker={ticker} />}
        {tab === "Finava" && <FinavaTab ticker={ticker} />}
      </div>
    </div>
  );
}
