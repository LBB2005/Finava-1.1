"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import { useChatStore } from "@/stores/chatStore";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useQuotes } from "@/hooks/useQuotes";
import { useAuth } from "@/context/AuthContext";
import ConversationList from "./ConversationList";
import ChatSearchModal from "./ChatSearchModal";
import PortfolioList from "./PortfolioList";
import AddHoldingModal from "@/components/portfolio/AddHoldingModal";
import CsvUploadModal from "@/components/portfolio/CsvUploadModal";
import StatementUploadModal from "@/components/portfolio/StatementUploadModal";
import BriefingModal from "@/components/briefing/BriefingModal";
import type { HoldingFormData } from "@/types/portfolio";
import { authFetch, authFetcher } from "@/lib/authFetch";

interface BriefingSummary {
  id: string;
  tickers: string[];
  readAt: string | null;
  createdAt: string;
  content: string;
}

const fetcher = authFetcher;

function BriefingBanner() {
  const { data: briefings, mutate } = useSWR<BriefingSummary[]>("/api/briefing", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const [generating, setGenerating] = useState(false);
  const [openBriefing, setOpenBriefing] = useState<BriefingSummary | null>(null);

  const latest = briefings?.[0] ?? null;
  const hasUnread = latest && !latest.readAt;

  async function generate() {
    setGenerating(true);
    try {
      const res = await authFetch("/api/briefing/generate", { method: "POST" });
      if (res.ok) await mutate();
    } finally {
      setGenerating(false);
    }
  }

  async function openLatest() {
    if (!latest) return;
    setOpenBriefing(latest);
    if (!latest.readAt) {
      await authFetch("/api/briefing", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: latest.id }) });
      await mutate();
    }
  }

  return (
    <>
      <div
        className="mx-[14px] mb-2 flex-shrink-0"
        style={{
          border: `1px solid ${hasUnread ? "var(--color-accent-medium)" : "var(--color-border)"}`,
          background: hasUnread ? "var(--color-accent-light)" : "var(--color-surface)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
            style={{ color: hasUnread ? "var(--color-accent)" : "var(--color-muted)", flexShrink: 0 }}>
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
          <span
            className="flex-1 text-[11px] font-semibold truncate"
            style={{ color: hasUnread ? "var(--color-accent)" : "var(--color-text-secondary)" }}
          >
            {hasUnread ? "New briefing ready" : latest ? "Weekly Briefing" : "No briefing yet"}
          </span>
          {hasUnread && (
            <span className="w-[6px] h-[6px] rounded-full flex-shrink-0" style={{ background: "var(--color-accent)" }} />
          )}
        </div>
        <div className="flex border-t border-[var(--color-border)]">
          {latest && (
            <button
              onClick={openLatest}
              className="flex-1 text-[10.5px] font-medium py-1.5 bg-transparent hover:bg-[var(--color-accent-light)] transition-colors duration-100"
              style={{ color: "var(--color-accent)" }}
            >
              Read
            </button>
          )}
          {latest && <div style={{ width: 1, background: "var(--color-border)" }} />}
          <button
            onClick={generate}
            disabled={generating}
            className="flex-1 text-[10.5px] font-medium py-1.5 bg-transparent enabled:hover:bg-[var(--color-surface-2)] transition-colors duration-100 disabled:opacity-50"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {generating ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>

      {openBriefing && (
        <BriefingModal briefing={openBriefing} onClose={() => setOpenBriefing(null)} />
      )}
    </>
  );
}

const MIN_WIDTH = 220;
const MAX_WIDTH = 500;
const DEFAULT_WIDTH = 268;

function fmt(n: number, d = 0) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** Allocation bar using the same oklch colour ramp as the design */
function allocColor(i: number) {
  const l = Math.max(0.2, 0.55 - i * 0.04);
  const c = 0.13;
  const h = 250 - i * 12;
  return `oklch(${l} ${c} ${h})`;
}

function PortfolioHero() {
  const { holdings } = usePortfolio();
  const { quoteMap } = useQuotes(holdings.map((h) => h.ticker));

  const totalValue = holdings.reduce((sum, h) => {
    const p = quoteMap.get(h.ticker)?.price ?? 0;
    return sum + (p > 0 ? p * h.shares : h.avgCost * h.shares);
  }, 0);

  const totalCost = holdings.reduce((sum, h) => sum + h.avgCost * h.shares, 0);
  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
  const isUp = totalGain >= 0;

  // Weights for alloc bar
  const weights = holdings.map((h) => {
    const p = quoteMap.get(h.ticker)?.price ?? 0;
    const mv = p > 0 ? p * h.shares : h.avgCost * h.shares;
    return totalValue > 0 ? (mv / totalValue) * 100 : 0;
  });

  if (holdings.length === 0) return null;

  return (
    <div
      className="flex-shrink-0 border-t border-b border-[var(--color-border)] px-[18px] py-[14px]"
      style={{
        background: "linear-gradient(180deg, color-mix(in oklab, var(--color-accent) 4%, transparent), transparent)",
      }}
    >
      <p
        className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)] mb-2"
      >
        Portfolio
      </p>

      {/* Serif total */}
      <p
        className="text-[24px] font-bold leading-none tracking-tight text-[var(--color-text)]"
        style={{ fontFamily: "var(--font-serif)", letterSpacing: "-0.01em" }}
      >
        ${fmt(totalValue)}
      </p>

      {/* Delta */}
      <div className="flex items-center justify-between mt-1.5">
        <span
          className="text-[12px] font-semibold"
          style={{ color: isUp ? "var(--color-bull)" : "var(--color-bear)" }}
        >
          {isUp ? "▲" : "▼"} ${fmt(Math.abs(totalGain))} · {isUp ? "+" : ""}
          {totalGainPct.toFixed(2)}%
        </span>
        <span className="text-[10.5px] text-[var(--color-muted)] tracking-[0.08em]">ALL-TIME</span>
      </div>

      {/* Alloc bar */}
      {weights.length > 0 && (
        <div className="flex h-[4px] rounded-full overflow-hidden mt-3 gap-[2px]">
          {weights.map((w, i) => (
            <div
              key={holdings[i]?.ticker ?? i}
              style={{ width: `${w}%`, background: allocColor(i) }}
              title={`${holdings[i]?.ticker} ${w.toFixed(1)}%`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface UserProfile {
  name: string | null;
  plan: string;
}

function UserWidget() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const ref = useRef<HTMLDivElement>(null);
  const { data } = useSWR<UserProfile>(user ? "/api/user" : null, authFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 120_000,
  });

  // localStorage is client-only; reading it in an effect (not render) is the
  // hydration-safe way to pick up the stored theme without an SSR mismatch.
  useEffect(() => {
    const stored = localStorage.getItem("lucra-theme") as "light" | "dark" | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(stored ?? "light");
  }, []);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("lucra-theme", next);
    if (next === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    setOpen(false);
  }

  if (!user) return null;

  const displayName = data?.name ?? user.displayName ?? user.email ?? "User";
  const plan = data?.plan ?? "Pro";
  const initials = displayName
    .split(" ")
    .map((w: string) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const MENU = [
    {
      label: "Settings",
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
      action: () => { router.push("/settings"); setOpen(false); },
    },
    {
      label: "View profile",
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
      action: () => { router.push("/settings?section=account"); setOpen(false); },
    },
    {
      label: theme === "light" ? "Dark mode" : "Light mode",
      icon:
        theme === "light" ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        ),
      action: toggleTheme,
    },
    {
      label: "Sign out",
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      ),
      action: signOut,
      danger: true,
    },
  ];

  return (
    <div ref={ref} className="relative flex-shrink-0 mx-[10px] mb-3">
      {/* Dropdown — opens above */}
      {open && (
        <div
          className="absolute bottom-full left-0 right-0 mb-1 z-50 rounded-[10px] py-1 overflow-hidden"
          style={{
            background: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            boxShadow: "var(--shadow-pop)",
          }}
        >
          {MENU.map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] font-medium text-left bg-transparent hover:bg-[var(--color-surface)] transition-colors duration-100"
              style={{ color: item.danger ? "var(--color-bear)" : "var(--color-text)" }}
            >
              <span style={{ color: item.danger ? "var(--color-bear)" : "var(--color-muted)" }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`user-widget-trigger${open ? " is-open" : ""} w-full flex items-center gap-2.5 px-[10px] py-[8px] rounded-[9px] transition-colors duration-150`}
      >
        {/* Avatar */}
        {user.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photoURL}
            alt={displayName}
            className="w-7 h-7 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
            style={{ background: "var(--color-accent-light)", color: "var(--color-accent)" }}
          >
            {initials}
          </div>
        )}

        {/* Name + plan */}
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[12px] font-semibold leading-tight truncate" style={{ color: "var(--color-text)" }}>
            {displayName}
          </p>
          <p className="text-[10.5px] leading-tight" style={{ color: "var(--color-muted)" }}>
            {plan}
          </p>
        </div>

        {/* Chevron */}
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className={`flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          style={{ color: "var(--color-muted)" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </div>
  );
}

export default function Sidebar({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
} = {}) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [portfolioOpen, setPortfolioOpen] = useState(true);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showCsv, setShowCsv] = useState(false);
  const [showStatement, setShowStatement] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const reset = useChatStore((s) => s.reset);
  const streamingConversationId = useChatStore((s) => s.streamingConversationId);
  const conversationId = useChatStore((s) => s.conversationId);
  const hasBackgroundStream = !!streamingConversationId && streamingConversationId !== conversationId;
  const { addHolding, uploadCsv, setCashBalance } = usePortfolio();

  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth.current + e.clientX - startX.current)));
  }, []);

  const handleMouseUp = useCallback(function up() {
    if (!isDragging.current) return;
    isDragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", up);
  }, [handleMouseMove]);

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const isOnPortfolio = pathname === "/portfolio";
  const isOnHedgeFund = pathname === "/hedge-fund";

  return (
    <aside
      className="relative flex flex-col h-full flex-shrink-0 overflow-hidden"
      style={{
        width: mobile ? "100%" : width,
        background: "var(--color-sidebar)",
        borderRight: "1px solid var(--color-border)",
      }}
    >
      {/* Brand row */}
      <div className="flex items-center justify-between px-[18px] pt-5 pb-[14px] flex-shrink-0">
        <span
          className="text-[22px] font-black uppercase leading-none select-none text-[var(--color-text)]"
          style={{ fontFamily: "var(--font-serif)", letterSpacing: "0.16em" }}
        >
          LUCRA
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setShowSearch(true)}
            title="Search chats"
            className="w-[26px] h-[26px] flex items-center justify-center rounded-[7px] text-[var(--color-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-light)] transition-colors duration-150"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
          <button
            onClick={() => { reset(); onNavigate?.(); }}
            title="New chat"
            className="w-[26px] h-[26px] flex items-center justify-center rounded-[7px] text-[var(--color-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-light)] transition-colors duration-150"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </div>

      {/* Nav pill — Chat + Portfolio */}
      <div
        className="flex gap-1 mx-[14px] mb-[6px] p-[3px] flex-shrink-0"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: isOnHedgeFund ? "4px" : "10px",
        }}
      >
        <Link
          href="/chat"
          onClick={onNavigate}
          className="flex-1 text-center text-[12px] font-medium py-[5px] transition-all duration-150 relative"
          style={
            !isOnPortfolio && !isOnHedgeFund
              ? {
                  background: "var(--color-bg)",
                  color: "var(--color-accent)",
                  boxShadow: "0 1px 2px rgba(15,23,42,0.06)",
                  fontWeight: 600,
                  borderRadius: isOnHedgeFund ? "2px" : "7px",
                }
              : { color: "var(--color-text-secondary)", borderRadius: isOnHedgeFund ? "2px" : "7px" }
          }
        >
          Chat
          {hasBackgroundStream && (
            <span
              className="absolute top-[4px] right-[10px] inline-flex w-[7px] h-[7px] rounded-full"
              style={{ background: "var(--color-accent)", boxShadow: "0 0 0 2px color-mix(in oklab, var(--color-accent) 25%, transparent)", animation: "pulse-dot 1.4s infinite ease-in-out" }}
            />
          )}
        </Link>
        <Link
          href="/portfolio"
          onClick={onNavigate}
          className="flex-1 text-center text-[12px] font-medium py-[5px] transition-all duration-150"
          style={
            isOnPortfolio
              ? {
                  background: "var(--color-bg)",
                  color: "var(--color-accent)",
                  boxShadow: "0 1px 2px rgba(15,23,42,0.06)",
                  fontWeight: 600,
                  borderRadius: isOnHedgeFund ? "2px" : "7px",
                }
              : { color: "var(--color-text-secondary)", borderRadius: isOnHedgeFund ? "2px" : "7px" }
          }
        >
          Portfolio
        </Link>
      </div>

      {/* Hedge Fund nav button */}
      <Link
        href="/hedge-fund"
        onClick={onNavigate}
        className="flex items-center gap-[6px] mx-[14px] mb-3 px-[10px] py-[6px] text-[12px] font-medium transition-all duration-150 flex-shrink-0"
        style={
          isOnHedgeFund
            ? {
                background: "var(--color-accent)",
                color: "#fff",
                border: "1px solid var(--color-accent)",
                borderRadius: "4px",
                fontWeight: 600,
              }
            : {
                color: "var(--color-text-secondary)",
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                borderRadius: "7px",
              }
        }
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
        Hedge Fund
      </Link>

      {/* Weekly briefing banner */}
      <BriefingBanner />

      {/* Portfolio hero */}
      <PortfolioHero />

      {/* Holdings section header */}
      <div
        className="flex items-center px-[18px] py-[10px] flex-shrink-0"
        style={{ borderBottom: portfolioOpen ? "none" : "1px solid var(--color-border)" }}
      >
        <span className="flex-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
          Holdings
        </span>

        {/* + dropdown */}
        <div className="relative" ref={addMenuRef}>
          <button
            onClick={() => setShowAddMenu((v) => !v)}
            className="w-[22px] h-[22px] flex items-center justify-center rounded text-[var(--color-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-light)] transition-colors duration-150"
            title="Add holding"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          {showAddMenu && (
            <div className="absolute right-0 top-6 z-50 bg-white border border-[var(--color-border)] rounded-xl shadow-lg py-1 w-36 overflow-hidden">
              <button
                onClick={() => { setShowAdd(true); setShowAddMenu(false); }}
                className="w-full text-left px-3 py-2 text-xs text-[var(--color-text)] hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)] transition-colors duration-100"
              >
                Add Stock
              </button>
              <button
                onClick={() => { setShowCsv(true); setShowAddMenu(false); }}
                className="w-full text-left px-3 py-2 text-xs text-[var(--color-text)] hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)] transition-colors duration-100"
              >
                Import CSV
              </button>
              <button
                onClick={() => { setShowStatement(true); setShowAddMenu(false); }}
                className="w-full text-left px-3 py-2 text-xs text-[var(--color-text)] hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)] transition-colors duration-100"
              >
                Upload Statement
              </button>
            </div>
          )}
        </div>

        {/* Collapse chevron */}
        <button
          onClick={() => setPortfolioOpen((v) => !v)}
          className="w-[22px] h-[22px] flex items-center justify-center rounded text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors duration-150"
        >
          <svg
            width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            className={`transition-transform duration-200 ${portfolioOpen ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {portfolioOpen && (
        <div className="overflow-y-auto flex-shrink-0" style={{ maxHeight: "32vh", borderBottom: "1px solid var(--color-border)" }}>
          <PortfolioList compact />
        </div>
      )}

      {/* Recent conversations */}
      <div className="flex-1 overflow-y-auto min-h-0 py-1">
        <p className="px-[18px] pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
          Recent
        </p>
        <ConversationList />
      </div>

      {showSearch && <ChatSearchModal onClose={() => setShowSearch(false)} />}

      {/* User widget */}
      <div className="flex-shrink-0 border-t" style={{ borderColor: "var(--color-border)" }}>
        <UserWidget />
      </div>

      {/* Resize handle — desktop only */}
      {!mobile && (
        <div
          onMouseDown={startResize}
          className="absolute top-0 right-0 w-[5px] h-full cursor-col-resize z-10 group"
        >
          <div className="absolute right-0 top-0 w-[1px] h-full bg-[var(--color-border)] group-hover:w-[2px] group-hover:bg-[var(--color-accent-medium)] transition-all duration-150" />
        </div>
      )}

      {/* Modals */}
      {showAdd && (
        <AddHoldingModal
          onClose={() => setShowAdd(false)}
          onAdd={(data: HoldingFormData) =>
            addHolding({ ...data, companyName: data.companyName ?? null, sector: data.sector ?? null })
          }
        />
      )}
      {showCsv && <CsvUploadModal onClose={() => setShowCsv(false)} onUpload={uploadCsv} />}
      {showStatement && (
        <StatementUploadModal
          onClose={() => setShowStatement(false)}
          onAdd={async (holdings, buyingPower, replace) => {
            if (replace) {
              await authFetch("/api/portfolio", { method: "DELETE" });
            }
            for (const h of holdings) {
              const shares = typeof h.shares === "number" ? h.shares : parseFloat(String(h.shares));
              const avgCost = typeof h.avgCost === "number" ? h.avgCost : h.avgCost != null ? parseFloat(String(h.avgCost)) : 0;
              if (!h.ticker || !isFinite(shares) || shares <= 0) continue;
              await addHolding({ ticker: h.ticker, companyName: h.companyName ?? null, shares, avgCost: isFinite(avgCost) ? avgCost : 0, sector: null });
            }
            if (buyingPower != null && buyingPower > 0) {
              await setCashBalance(buyingPower);
            }
          }}
        />
      )}
    </aside>
  );
}
