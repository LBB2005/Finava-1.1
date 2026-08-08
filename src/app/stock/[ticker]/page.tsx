"use client";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useStockBundle } from "@/hooks/useStock";
import { useQuotes } from "@/hooks/useQuotes";
import { useChatStore } from "@/stores/chatStore";
import { buildStockSnapshot } from "@/lib/pageContext";
import { useToast } from "@/hooks/useToast";
import { runFinava } from "@/lib/finavaStore";
import StockHero from "@/components/stock/StockHero";
import { OverviewTab, FinancialsTab, AnalystsTab, NewsTab } from "@/components/stock/StockTabs";
import { DcfTab } from "@/components/stock/DcfTab";
import { FinavaTab } from "@/components/stock/FinavaTab";
import { MoneyMapTab } from "@/components/stock/MoneyMapTab";
import ChatContextButton from "@/components/chat/ChatContextButton";

const TABS = ["Overview", "Financials", "Analysts", "News", "DCF", "Finava", "Money Map"] as const;
type Tab = (typeof TABS)[number];

/** Resolve a ?tab= param (case-insensitive, tolerant of old names) to a Tab. */
function tabFromParam(raw: string | null): Tab | null {
  if (!raw) return null;
  const norm = raw.trim().toLowerCase();
  const direct = TABS.find((t) => t.toLowerCase() === norm);
  if (direct) return direct;
  // Aliases — old links and the upcoming consolidated names both land somewhere sane.
  if (norm === "finava-analysis" || norm === "analysis") return "Finava";
  if (norm === "moneymap" || norm === "money-map") return "Money Map";
  return null;
}

/* useSearchParams requires a Suspense boundary in the App Router — the inner
   component holds all page logic; this wrapper only satisfies the bailout. */
export default function StockPage() {
  return (
    <Suspense fallback={null}>
      <StockPageInner />
    </Suspense>
  );
}

function StockPageInner() {
  const params = useParams<{ ticker: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const ticker = (params?.ticker ?? "").toUpperCase();

  const { bundle, error, isLoading, mutate } = useStockBundle(ticker || null);
  const { quoteMap } = useQuotes(ticker ? [ticker] : []);
  const [tab, setTab] = useState<Tab>(() => tabFromParam(searchParams.get("tab")) ?? "Overview");

  // ?run=1 deep link (rail "Generate", notifications): start a metered run once
  // the page is mounted. runFinava self-dedupes, so a re-render can't double-fire.
  useEffect(() => {
    if (ticker && searchParams.get("run") === "1") {
      setTab("Finava");
      void runFinava(ticker, { force: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);
  // Flips on if the bundle hasn't arrived after a beat, so the skeleton can admit
  // it's taking longer than usual and offer a manual retry instead of hanging.
  const [slow, setSlow] = useState(false);

  // Surface genuine load failures via a toast in addition to the inline state.
  // A 404 (unknown symbol) is a user-input issue already explained clearly in
  // the full-page state, so we skip toasting for it to avoid redundant noise.
  useEffect(() => {
    if (error && error.status !== 404) {
      toast.error(`Couldn't load ${ticker}. The data service may be unavailable — please retry.`);
    }
  }, [error, ticker, toast]);

  // Publish the loaded bundle as the app-wide "active page context" so the chat
  // composer can attach a ticker+data snapshot to whatever the user asks — and
  // resolve vague references ("is this a buy?") to this stock. Cleared on
  // unmount / ticker change so a stale ticker can never leak into an off-page chat.
  useEffect(() => {
    const setActivePageContext = useChatStore.getState().setActivePageContext;
    if (bundle && ticker) {
      setActivePageContext({ kind: "stock", ticker, snapshot: buildStockSnapshot(bundle) });
    }
    return () => setActivePageContext(null);
  }, [bundle, ticker]);

  // Arm a slow-load timer while loading; the cleanup clears it and resets the
  // flag whenever the ticker changes or the bundle finishes loading.
  const loadingBundle = isLoading || !bundle;
  useEffect(() => {
    if (!loadingBundle || error) return;
    const id = window.setTimeout(() => setSlow(true), 9000);
    return () => {
      window.clearTimeout(id);
      setSlow(false);
    };
  }, [loadingBundle, error, ticker]);

  /* ── Error states ─────────────────────────────────────────────────────── */
  if (error) {
    const notFound = error.status === 404;
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6" style={{ background: "var(--color-bg)" }}>
        <p className="text-[length:var(--text-title)] font-semibold text-[var(--color-text)]" style={{ fontFamily: "var(--font-serif)" }}>
          {notFound ? `Couldn't find “${ticker}”` : "Couldn't load this stock"}
        </p>
        <p className="text-[length:var(--text-sm)] text-[var(--color-muted)] max-w-[360px] text-center">
          {notFound
            ? "Double-check the symbol, or try another ticker."
            : error.message || "The data service may be unavailable right now."}
        </p>
        <button onClick={() => router.push("/portfolio")} className="btn btn-primary mt-1">
          Back to portfolio
        </button>
      </div>
    );
  }

  /* ── Loading state ────────────────────────────────────────────────────── */
  if (loadingBundle) {
    return (
      <div className="research-root h-full overflow-y-auto" style={{ background: "var(--color-bg)" }} aria-busy="true" aria-label={`Loading ${ticker}`}>
        <div style={{ padding: "22px var(--page-gutter) 0", background: "linear-gradient(180deg, var(--color-accent-light), transparent 80%)" }}>
          <div className="flex items-center gap-3.5">
            <div className="w-[44px] h-[44px] rounded-[var(--radius-sm)] skeleton" />
            <div className="flex flex-col gap-2">
              <div className="h-[20px] w-[160px] skeleton" />
              <div className="h-[12px] w-[120px] skeleton" />
            </div>
          </div>
          <div className="h-[46px] w-[200px] skeleton mt-4" />
          <div className="h-[300px] skeleton mt-3" />

          {!slow ? (
            <p className="mt-3.5 text-[length:var(--text-meta)] flex items-center gap-2" style={{ color: "var(--color-muted)" }}>
              <span className="spin inline-block w-3 h-3 rounded-full border-2 border-[var(--color-border-strong)] border-t-[var(--color-accent)]" />
              Loading quote &amp; chart for {ticker}…
            </p>
          ) : (
            <div className="mt-3.5 flex items-center gap-3">
              <p className="text-[length:var(--text-meta)]" style={{ color: "var(--color-muted)" }}>
                Taking longer than usual — the data service may be busy.
              </p>
              <button
                onClick={() => { setSlow(false); mutate(); }}
                className="btn"
                style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)", background: "var(--color-accent-light)" }}
              >
                Retry
              </button>
            </div>
          )}
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
        onOpenAnalysis={(opts) => {
          setTab("Finava");
          if (opts?.run) void runFinava(ticker, { force: true });
        }}
        onOpenDcf={() => setTab("DCF")}
      />

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
            <span className="serif" style={{ fontSize: "var(--text-lg)", fontWeight: 800, color: "var(--color-text)" }}>
              ${livePrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
          {chg != null && (
            <span className="mono" style={{ fontSize: "var(--text-meta)", fontWeight: 700, color: chg >= 0 ? "var(--color-bull)" : "var(--color-bear)" }}>
              {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
            </span>
          )}
          <span style={{ width: 1, height: 22, background: "var(--color-border)" }} />
          <ChatContextButton context={`stock:${ticker}`} />
        </div>
      </div>

      {/* Tab content */}
      <div style={{ padding: "22px var(--page-gutter) var(--content-pad-bottom)" }}>
        {tab === "Overview" && (
          <OverviewTab ticker={ticker} profile={bundle.profile} keyStats={bundle.keyStats} sentiment={bundle.sentiment} />
        )}
        {tab === "Financials" && <FinancialsTab fundamentals={bundle.fundamentals} />}
        {tab === "Analysts" && <AnalystsTab analysts={bundle.analysts} price={livePrice} />}
        {tab === "News" && <NewsTab news={bundle.news} />}
        {tab === "DCF" && <DcfTab ticker={ticker} />}
        {tab === "Finava" && <FinavaTab ticker={ticker} />}
        {tab === "Money Map" && <MoneyMapTab ticker={ticker} />}
      </div>
    </div>
  );
}
