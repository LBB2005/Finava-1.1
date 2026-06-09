"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import { useChatStore } from "@/stores/chatStore";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useQuotes } from "@/hooks/useQuotes";
import { useWatchlists } from "@/hooks/useWatchlists";
import { useWatchlistStore } from "@/stores/watchlistStore";
import { useAuth } from "@/context/AuthContext";
import ConversationList from "./ConversationList";
import ChatSearchModal from "./ChatSearchModal";
import PortfolioList from "./PortfolioList";
import WatchlistBoard from "@/components/watchlist/WatchlistBoard";
import AddHoldingModal from "@/components/portfolio/AddHoldingModal";
import CsvUploadModal from "@/components/portfolio/CsvUploadModal";
import StatementUploadModal from "@/components/portfolio/StatementUploadModal";
import BriefingModal from "@/components/briefing/BriefingModal";
import type { HoldingFormData } from "@/types/portfolio";
import { authFetch, authFetcher } from "@/lib/authFetch";
import UsageRing from "@/components/usage/UsageRing";
import UsagePanel, { type UsageSummary } from "@/components/usage/UsagePanel";

interface BriefingSummary {
  id: string;
  tickers: string[];
  readAt: string | null;
  createdAt: string;
  content: string;
}

const fetcher = authFetcher;

/* ============================================================
   Briefing banner — unchanged
   ============================================================ */
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
        className="mx-[14px] mb-2 flex items-center flex-shrink-0 overflow-hidden"
        style={{
          border: `1px solid ${hasUnread ? "var(--color-accent-medium)" : "var(--color-border)"}`,
          background: hasUnread ? "var(--color-accent-light)" : "var(--color-surface)",
          borderRadius: 8,
        }}
      >
        <div className="flex items-center gap-2 px-3 py-[7px] flex-1 min-w-0">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
            style={{ color: hasUnread ? "var(--color-accent)" : "var(--color-muted)", flexShrink: 0 }}>
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
          <span
            className="text-[11px] font-semibold truncate"
            style={{ color: hasUnread ? "var(--color-accent)" : "var(--color-text-secondary)" }}
          >
            {hasUnread ? "New briefing ready" : "Briefing"}
          </span>
          {hasUnread && (
            <span className="w-[6px] h-[6px] rounded-full flex-shrink-0" style={{ background: "var(--color-accent)" }} />
          )}
        </div>
        {latest && <div style={{ width: 1, background: "var(--color-border)", alignSelf: "stretch" }} />}
        {latest && (
          <button
            onClick={openLatest}
            className="text-[10.5px] font-medium px-3 py-[7px] bg-transparent hover:bg-[var(--color-accent-light)] transition-colors duration-100 flex-shrink-0"
            style={{ color: "var(--color-accent)" }}
          >
            Read
          </button>
        )}
        <div style={{ width: 1, background: "var(--color-border)", alignSelf: "stretch" }} />
        <button
          onClick={generate}
          disabled={generating}
          className="text-[10.5px] font-medium px-3 py-[7px] bg-transparent enabled:hover:bg-[var(--color-surface-2)] transition-colors duration-100 disabled:opacity-50 flex-shrink-0"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {generating ? "…" : "Generate"}
        </button>
      </div>

      {openBriefing && (
        <BriefingModal briefing={openBriefing} onClose={() => setOpenBriefing(null)} />
      )}
    </>
  );
}

const MIN_WIDTH = 220;
const MAX_WIDTH = 500;
const DEFAULT_WIDTH = 276;

function fmt(n: number, d = 0) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

/* ============================================================
   Shared nav primitives
   ============================================================ */

/** A plain destination row (Chat / Research / Hedge Fund). */
function NavLink({
  href,
  active,
  icon,
  label,
  trailing,
  onNavigate,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  trailing?: React.ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="nav-row group flex items-center gap-[11px] w-full text-left px-[11px] py-2 rounded-[9px] text-[13px] transition-colors duration-100 relative"
      style={
        active
          ? { background: "var(--color-accent-light)", color: "var(--color-accent)", fontWeight: 600 }
          : { color: "var(--color-text-secondary)", fontWeight: 500 }
      }
    >
      {active && (
        <span className="absolute -left-[10px] top-2 bottom-2 w-[3px] rounded-r-[3px]" style={{ background: "var(--color-accent)" }} />
      )}
      <span className="flex-shrink-0 flex items-center justify-center w-4 h-4">{icon}</span>
      <span className="flex-1">{label}</span>
      {trailing}
    </Link>
  );
}

/** Chevron used on expandable rows. */
function Chevron({ open, size = 13 }: { open: boolean; size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      className="flex-shrink-0 transition-transform duration-200"
      style={{ color: "var(--color-muted)", transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/** Smoothly-animating collapsible body (grid-rows 1fr↔0fr trick). */
function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      className="grid transition-[grid-template-rows] duration-[260ms] ease-[cubic-bezier(.4,0,.2,1)]"
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
    >
      <div className="overflow-hidden min-h-0">{children}</div>
    </div>
  );
}

/* ============================================================
   Portfolio — expandable nav item (stacked readout → holdings)
   ============================================================ */
function PortfolioNavItem({
  active,
  onAddClick,
  onNavigate,
}: {
  active: boolean;
  onAddClick: () => void;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const { holdings, plaidConnected } = usePortfolio();
  const { quoteMap } = useQuotes(holdings.map((h) => h.ticker));

  const totalValue = holdings.reduce((sum, h) => {
    const p = quoteMap.get(h.ticker)?.price ?? 0;
    return sum + (p > 0 ? p * h.shares : h.avgCost * h.shares);
  }, 0);
  const totalCost = holdings.reduce((sum, h) => sum + h.avgCost * h.shares, 0);
  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
  const isUp = totalGain >= 0;
  const hasHoldings = holdings.length > 0;

  return (
    <div className="nav-acc">
      <div
        className="nav-row group flex items-start gap-[11px] w-full px-[11px] py-[9px] rounded-[9px] transition-colors duration-100 relative cursor-pointer"
        style={
          active
            ? { background: "var(--color-accent-light)" }
            : undefined
        }
      >
        {active && (
          <span className="absolute -left-[10px] top-2 bottom-2 w-[3px] rounded-r-[3px]" style={{ background: "var(--color-accent)" }} />
        )}
        <Link href="/portfolio" onClick={onNavigate} className="flex items-start gap-[11px] flex-1 min-w-0 text-left">
          <svg className="flex-shrink-0 mt-[2px]" width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke={active ? "var(--color-accent)" : "var(--color-text-secondary)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-9-9v9z" />
            <path d="M12 3a9 9 0 0 1 9 9h-9z" />
          </svg>

          <span className="flex-1 min-w-0 flex flex-col gap-[2px]">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.16em] leading-tight" style={{ color: "var(--color-muted)" }}>
              Portfolio
            </span>
            {hasHoldings ? (
              <>
                <span className="text-[18px] font-extrabold leading-[1.1] tracking-tight" style={{ fontFamily: "var(--font-serif)", color: "var(--color-text)", letterSpacing: "-0.01em" }}>
                  ${fmt(totalValue)}
                </span>
                <span className="text-[11px] font-bold leading-tight" style={{ color: isUp ? "var(--color-bull)" : "var(--color-bear)" }}>
                  {isUp ? "▲" : "▼"} ${fmt(Math.abs(totalGain))} · {isUp ? "+" : ""}{totalGainPct.toFixed(2)}%
                </span>
              </>
            ) : (
              <span className="text-[13px] font-medium leading-tight" style={{ color: "var(--color-text-secondary)" }}>
                No holdings yet
              </span>
            )}
          </span>
        </Link>

        {hasHoldings && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="mt-[3px] flex-shrink-0 p-[2px] rounded hover:bg-[var(--color-sidebar-hover)] transition-colors duration-100"
            aria-label={open ? "Collapse portfolio" : "Expand portfolio"}
          >
            <Chevron open={open} />
          </button>
        )}
      </div>

      {hasHoldings && (
        <Collapsible open={open}>
          <div className="pb-1">
            <PortfolioList compact />
            {/* Manual add is hidden when a brokerage is linked — Plaid is the source of truth. */}
            {!plaidConnected && (
              <div className="flex justify-end pl-[42px] pr-[14px] pt-1 pb-1">
                <button
                  onClick={onAddClick}
                  title="Add holding"
                  className="w-[20px] h-[20px] flex items-center justify-center rounded text-[var(--color-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-light)] transition-colors duration-150"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </Collapsible>
      )}
    </div>
  );
}

/* ============================================================
   Watchlist — expandable nav item (lists → stocks)
   ============================================================ */
function WatchlistGroup({
  name,
  tickers,
  defaultOpen,
}: {
  name: string;
  tickers: string[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="wl-group">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full text-left pl-[42px] pr-[11px] py-[6px] text-[12px] font-medium transition-colors duration-100 hover:bg-[var(--color-sidebar-hover)]"
        style={{ color: "var(--color-text-secondary)" }}
      >
        <span className="flex-1 truncate">{name}</span>
        <span className="text-[10.5px]" style={{ color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}>{tickers.length}</span>
        <Chevron open={open} size={11} />
      </button>
      <Collapsible open={open}>
        <WatchlistBoard tickers={tickers} compact />
      </Collapsible>
    </div>
  );
}

function WatchlistNavItem({
  active,
  onNavigate,
}: {
  active: boolean;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { watchlists } = useWatchlists();
  const { activeId } = useWatchlistStore();

  const hasLists = watchlists.length > 0;
  const totalLists = watchlists.length;

  return (
    <div className="nav-acc">
      <div
        className="nav-row group flex items-center gap-[11px] w-full px-[11px] py-2 rounded-[9px] text-[13px] transition-colors duration-100 relative cursor-pointer"
        style={
          active
            ? { background: "var(--color-accent-light)", color: "var(--color-accent)", fontWeight: 600 }
            : { color: "var(--color-text-secondary)", fontWeight: 500 }
        }
      >
        {active && (
          <span className="absolute -left-[10px] top-2 bottom-2 w-[3px] rounded-r-[3px]" style={{ background: "var(--color-accent)" }} />
        )}
        <Link href="/watchlist" onClick={onNavigate} className="flex items-center gap-[11px] flex-1 min-w-0">
          <svg className="flex-shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15 8.5 22 9.3 17 14 18.2 21 12 17.6 5.8 21 7 14 2 9.3 9 8.5 12 2" />
          </svg>
          <span className="flex-1">Watchlist</span>
          {hasLists && (
            <span className="text-[11px] font-semibold" style={{ color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}>{totalLists}</span>
          )}
        </Link>
        {hasLists && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex-shrink-0 p-[2px] rounded hover:bg-[var(--color-sidebar-hover)] transition-colors duration-100"
            aria-label={open ? "Collapse watchlists" : "Expand watchlists"}
          >
            <Chevron open={open} />
          </button>
        )}
      </div>

      {hasLists && (
        <Collapsible open={open}>
          <div className="pt-[2px] pb-[6px]">
            {watchlists.map((w, i) => (
              <WatchlistGroup
                key={w.id}
                name={w.name}
                tickers={w.tickers}
                defaultOpen={activeId ? w.id === activeId : i === 0}
              />
            ))}
          </div>
        </Collapsible>
      )}
    </div>
  );
}

interface UserProfile {
  name: string | null;
  plan: string;
}

/* ============================================================
   User widget — unchanged
   ============================================================ */
function UserWidget() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const ref = useRef<HTMLDivElement>(null);
  const { data } = useSWR<UserProfile>(user ? "/api/user" : null, authFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 120_000,
  });
  const { data: usage } = useSWR<UsageSummary>(user ? "/api/usage" : null, authFetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
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
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setUsageOpen(false);
      }
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
  const plan = data?.plan ?? "Free";
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
    <div ref={ref} className="relative flex-shrink-0">
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

      {usageOpen && usage && (
        <div
          className="absolute bottom-full left-0 right-0 mb-1 z-50 rounded-[11px] p-3.5"
          style={{
            background: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            boxShadow: "var(--shadow-pop)",
          }}
        >
          <UsagePanel
            data={usage}
            onSeeDetails={() => {
              router.push("/settings?section=usage");
              setUsageOpen(false);
            }}
          />
        </div>
      )}

      <div
        className={`user-widget-trigger${open || usageOpen ? " is-open" : ""} w-full flex items-center gap-2.5 px-[10px] py-[8px] transition-colors duration-150`}
      >
        <button
          onClick={() => {
            setOpen((v) => !v);
            setUsageOpen(false);
          }}
          className="flex items-center gap-2.5 flex-1 min-w-0 text-left bg-transparent"
        >
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

          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold leading-tight truncate" style={{ color: "var(--color-text)" }}>
              {displayName}
            </p>
            <p className="text-[10.5px] leading-tight" style={{ color: "var(--color-muted)" }}>
              {plan}
            </p>
          </div>
        </button>

        <button
          onClick={() => {
            setUsageOpen((v) => !v);
            setOpen(false);
          }}
          aria-label="AI usage"
          title="AI usage"
          className="flex-shrink-0 flex items-center bg-transparent"
        >
          <UsageRing pct={usage?.weekly.pct ?? 0} tone={(usage?.weekly.pct ?? 0) >= 90 ? "over" : "accent"} />
        </button>

        <button
          onClick={() => {
            setOpen((v) => !v);
            setUsageOpen(false);
          }}
          aria-label="Account menu"
          className="flex-shrink-0 flex items-center bg-transparent"
        >
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            style={{ color: "var(--color-muted)" }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Sidebar — Direction A: one unified nav list. Portfolio and
   Watchlist are expandable nav items (no duplicate sections).
   ============================================================ */
export default function Sidebar({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
} = {}) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
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
  const isOnResearch = pathname === "/research";
  const isOnWatchlist = pathname === "/watchlist" || pathname.startsWith("/watchlist/");
  const isOnChat = !isOnPortfolio && !isOnHedgeFund && !isOnResearch && !isOnWatchlist;

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

      {/* Unified nav list */}
      <nav className="flex flex-col gap-[2px] px-[10px] flex-shrink-0">
        {/* Chat */}
        <NavLink
          href="/chat"
          active={isOnChat}
          onNavigate={onNavigate}
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          }
          label="Chat"
          trailing={
            hasBackgroundStream ? (
              <span className="w-[7px] h-[7px] rounded-full" style={{ background: "var(--color-accent)", boxShadow: "0 0 0 3px color-mix(in oklab, var(--color-accent) 22%, transparent)", animation: "pulse-dot 1.4s infinite ease-in-out" }} />
            ) : undefined
          }
        />

        {/* Portfolio (expandable) */}
        <PortfolioNavItem active={isOnPortfolio} onAddClick={() => setShowAddMenu(true)} onNavigate={onNavigate} />

        {/* Research */}
        <NavLink
          href="/research"
          active={isOnResearch}
          onNavigate={onNavigate}
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <path d="M8 11h6M11 8v6" />
            </svg>
          }
          label="Research"
        />

        {/* Watchlist (expandable) */}
        <WatchlistNavItem active={isOnWatchlist} onNavigate={onNavigate} />

        {/* Hedge Fund — hidden for now, restore when feature is ready */}
        {/* <NavLink
          href="/hedge-fund"
          active={isOnHedgeFund}
          onNavigate={onNavigate}
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          }
          label="Hedge Fund"
        /> */}
      </nav>

      {/* divider */}
      <div className="h-px mx-[14px] my-[6px] flex-shrink-0" style={{ background: "var(--color-border)" }} />

      {/* Add-holding menu (anchored, opened from inside Portfolio item) */}
      {showAddMenu && (
        <div ref={addMenuRef} className="absolute left-[14px] top-[180px] z-50 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl shadow-lg py-1 w-40 overflow-hidden">
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

      {/* Weekly briefing banner */}
      <BriefingBanner />

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
