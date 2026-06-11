"use client";
import { useRef, useEffect, useState, useCallback, type KeyboardEvent } from "react";
import type { ChatMode } from "@/types/chat";
import { AGENT_COUNT, PROMPT_TEMPLATES } from "@/types/chat";
import { useWatchlists } from "@/hooks/useWatchlists";
import useSWR from "swr";
import { authFetcher } from "@/lib/authFetch";

interface Playbook {
  id: string;
  title: string;
  steps: string[];
}

interface WatchlistRef {
  id: string;
  name: string;
  tickers: string[];
}

export interface Attachment {
  name: string;
  type: "image" | "pdf" | "file";
  dataUrl?: string;
}

interface Props {
  onSend: (text: string, attachments?: Attachment[]) => void;
  disabled?: boolean;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  /** Auto-focus the textarea on mount. True on the chat page; false when the
   *  composer is embedded on Portfolio/Watchlist so it doesn't steal scroll. */
  autoFocus?: boolean;
  /** Floating overlay mode: transparent surround (no white band), stronger
   *  shadow, and click-through side gutters so page content scrolls behind it.
   *  Used by the global persistent composer. */
  floating?: boolean;
}

const MODE_CONFIG: Record<ChatMode, { label: string; pill: string; description: string; color: string; icon: React.ReactNode }> = {
  agent: {
    label: "Agent Mode",
    pill: "Agent",
    description: `${AGENT_COUNT} specialist agents`,
    color: "var(--color-accent)",
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
  discover: {
    label: "Discover",
    pill: "Discover",
    description: "Scan all 500 S&P names for ideas",
    color: "var(--color-discover)",
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" /><polygon points="16 8 10.5 10.5 8 16 13.5 13.5 16 8" />
      </svg>
    ),
  },
  deep_research: {
    label: "Deep Research",
    pill: "Deep Research",
    description: "All agents + extended web search",
    color: "var(--color-deep-research)",
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
      </svg>
    ),
  },
  simple: {
    label: "Simple Chat",
    pill: "Simple Chat",
    description: "Fast, conversational",
    color: "var(--color-text-secondary)",
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  backtest: {
    label: "Backtest",
    pill: "Backtest",
    description: "NL → strategy → chart vs SPY",
    color: "var(--color-backtest)",
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
};

const MODE_ORDER: ChatMode[] = ["agent", "discover", "deep_research", "backtest", "simple"];

export default function ChatInput({ onSend, disabled, mode, onModeChange, autoFocus = true, floating = false }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const plusBtnRef = useRef<HTMLButtonElement>(null);
  const modeWrapRef = useRef<HTMLDivElement>(null);

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [tickers, setTickers] = useState<string[]>([]);
  const [watchlistRefs, setWatchlistRefs] = useState<WatchlistRef[]>([]);
  const [tickerInput, setTickerInput] = useState("");
  const [hasText, setHasText] = useState(false);
  const [launching, setLaunching] = useState(false);

  const { watchlists } = useWatchlists();
  // User-saved playbooks (from the chat header's "Save as Playbook"). Fetched
  // lazily — only once the "+" popover is first opened.
  const { data: playbooks } = useSWR<Playbook[]>(popoverOpen ? "/api/playbooks" : null, authFetcher);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        plusBtnRef.current && !plusBtnRef.current.contains(e.target as Node)
      ) setPopoverOpen(false);
      if (modeWrapRef.current && !modeWrapRef.current.contains(e.target as Node)) setModeOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  useEffect(() => {
    if (autoFocus && !disabled) textareaRef.current?.focus();
  }, [disabled, autoFocus]);

  function resize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }

  function onInput() {
    resize();
    setHasText(!!textareaRef.current?.value.trim());
  }

  const canSend = hasText && !disabled;

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  }

  function submit() {
    const val = textareaRef.current?.value.trim();
    if (!val || disabled) return;
    setLaunching(true);
    setTimeout(() => setLaunching(false), 360);
    const tickerPrefix = tickers.length > 0 ? `[Focus: ${tickers.join(", ")}] ` : "";
    const watchlistPrefix = watchlistRefs.length > 0
      ? watchlistRefs
          .map((w) => `[Watchlist "${w.name}": ${w.tickers.length > 0 ? w.tickers.join(", ") : "empty"}]`)
          .join(" ") + " "
      : "";
    const attachSuffix = attachments.length > 0
      ? `\n\n[Attached files: ${attachments.map((a) => a.name).join(", ")}]` : "";
    onSend(watchlistPrefix + tickerPrefix + val + attachSuffix, attachments.length > 0 ? attachments : undefined);
    if (textareaRef.current) { textareaRef.current.value = ""; textareaRef.current.style.height = "auto"; }
    setHasText(false);
    setAttachments([]);
    setTickers([]);
    setWatchlistRefs([]);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => {
      const isImage = file.type.startsWith("image/");
      const att: Attachment = { name: file.name, type: isImage ? "image" : file.type === "application/pdf" ? "pdf" : "file" };
      if (isImage) {
        const reader = new FileReader();
        reader.onload = (ev) => { att.dataUrl = ev.target?.result as string; setAttachments((p) => [...p, att]); };
        reader.readAsDataURL(file);
      } else setAttachments((p) => [...p, att]);
    });
    if (e.target) e.target.value = "";
    setPopoverOpen(false);
  }

  function addTicker() {
    const t = tickerInput.trim().toUpperCase();
    if (t && !tickers.includes(t)) setTickers((p) => [...p, t]);
    setTickerInput("");
  }

  function toggleWatchlist(w: WatchlistRef) {
    setWatchlistRefs((prev) =>
      prev.some((x) => x.id === w.id)
        ? prev.filter((x) => x.id !== w.id)
        : [...prev, { id: w.id, name: w.name, tickers: w.tickers }]
    );
  }

  const applyTemplate = useCallback((template: string) => {
    if (textareaRef.current) { textareaRef.current.value = template; textareaRef.current.focus(); resize(); }
    setHasText(!!template.trim());
    setPopoverOpen(false);
  }, []);

  // Kept short enough to stay on one line in the single-row textarea even on
  // narrow mobile widths (longer copy wrapped and got clipped by the 1-row height).
  const placeholder =
    mode === "deep_research" ? "Deep research — ask anything…"
    : mode === "agent" ? "Ask a research question…"
    : mode === "discover" ? "Describe the kind of stocks to find…"
    : mode === "backtest" ? "Describe a strategy to backtest…"
    : "Ask about a stock or your portfolio…";

  const sendBgColor =
    mode === "deep_research" ? "var(--color-deep-research)"
    : mode === "discover" ? "var(--color-discover)"
    : mode === "backtest" ? "var(--color-backtest)"
    : "var(--color-accent)";

  const cfg = MODE_CONFIG[mode];

  return (
    <div
      className={floating ? "px-6 pt-5 pb-0 pointer-events-none" : "flex-shrink-0 px-6 pb-6 pt-5"}
      style={floating ? { background: "transparent" } : { background: "linear-gradient(to bottom, rgba(255,255,255,0) 0%, var(--color-bg) 28%)" }}
    >
      <div className={floating ? "mx-auto max-w-[720px] pointer-events-auto" : "mx-auto max-w-[720px]"}>
        {/* Chips row */}
        {(attachments.length > 0 || tickers.length > 0 || watchlistRefs.length > 0) && (
          <div className="flex flex-wrap gap-1.5 mb-2 px-1">
            {watchlistRefs.map((w) => (
              <span key={w.id} className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md"
                style={{ background: "var(--color-accent-light)", color: "var(--color-accent)" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
                {w.name}
                <span style={{ opacity: 0.6 }}>·{w.tickers.length}</span>
                <button onClick={() => toggleWatchlist(w)} className="hover:opacity-60">×</button>
              </span>
            ))}
            {tickers.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md"
                style={{ background: "var(--color-accent-light)", color: "var(--color-accent)" }}>
                {t}
                <button onClick={() => setTickers((p) => p.filter((x) => x !== t))} className="hover:opacity-60">×</button>
              </span>
            ))}
            {attachments.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-md"
                style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
                {a.type === "image" ? "🖼" : a.type === "pdf" ? "📄" : "📎"}
                <span className="max-w-[120px] truncate">{a.name}</span>
                <button onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))} className="hover:opacity-60">×</button>
              </span>
            ))}
          </div>
        )}

        <div className="relative">
          {/* Input box — Calm Orb composer: + attach · mode pill · textarea · circular send */}
          <div
            className="chat-input-box relative flex items-end gap-1.5 transition-all duration-200"
            style={{
              // Frost composer — translucent frosted surface (theme-token driven),
              // soft blur so page content reads softly behind it. A faint cool tint
              // (surface over the page) + firm edge + lifted shadow keep the glass
              // pill legible even on a near-white page. Focus firms the border (no
              // glow) via .chat-input-box:focus-within.
              background: "color-mix(in oklab, var(--color-surface) 82%, transparent)",
              border: "1px solid var(--color-border-strong)",
              borderRadius: 16,
              padding: 9,
              backdropFilter: "blur(16px) saturate(1.25)",
              WebkitBackdropFilter: "blur(16px) saturate(1.25)",
              boxShadow: floating
                ? "inset 0 1px 0 color-mix(in oklab, var(--color-bg) 30%, #fff), 0 14px 36px -14px rgba(15,23,42,0.34)"
                : disabled ? "none" : "inset 0 1px 0 color-mix(in oklab, var(--color-bg) 30%, #fff), 0 10px 26px -14px rgba(15,23,42,0.26)",
              opacity: disabled ? 0.6 : 1,
            }}
          >
            {/* + attach / tickers / templates */}
            <button
              ref={plusBtnRef}
              onClick={() => { setPopoverOpen((v) => !v); setModeOpen(false); }}
              disabled={disabled}
              title="Attach files, pin tickers, or use a template"
              className="cmp-plus flex-shrink-0 w-8 h-8 mb-[1px] rounded-[9px] flex items-center justify-center"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>

            {/* Mode pill (inline dropdown — replaces the old header toggles) */}
            <div ref={modeWrapRef} className="relative flex-shrink-0">
              <button
                onClick={() => { setModeOpen((v) => !v); setPopoverOpen(false); }}
                disabled={disabled}
                title={cfg.label}
                aria-label={`Mode: ${cfg.label}`}
                className="cmp-mode-btn inline-flex items-center gap-1 h-8 px-2 mb-[1px] rounded-[9px] text-[12px] font-semibold"
                style={{ border: "1px solid transparent", background: "transparent", color: cfg.color }}
              >
                {cfg.icon}
                <span
                  className="flex"
                  style={{ color: "var(--color-muted)", transform: modeOpen ? "rotate(180deg)" : "none", transition: "transform 160ms" }}
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </button>

              {modeOpen && (
                <div
                  className="absolute bottom-full left-0 mb-2 z-[60] rounded-[14px] p-1.5 fade-in"
                  style={{ width: 248, background: "var(--color-bg)", border: "1px solid var(--color-border)", boxShadow: "0 8px 32px rgba(15,23,42,0.14)" }}
                >
                  {MODE_ORDER.map((m) => {
                    const mc = MODE_CONFIG[m];
                    const active = mode === m;
                    return (
                      <button key={m} onClick={() => { onModeChange(m); setModeOpen(false); }}
                        className="mode-option w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[9px] text-left transition-colors duration-100"
                        style={active ? { background: "var(--color-accent-light)" } : undefined}>
                        <span className="w-[26px] h-[26px] rounded-[7px] flex items-center justify-center flex-shrink-0"
                          style={{ background: active ? mc.color : "var(--color-surface)", color: active ? "white" : "var(--color-muted)" }}>
                          {mc.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12.5px] font-semibold" style={{ color: active ? mc.color : "var(--color-text)" }}>{mc.label}</div>
                          <div className="text-[11px]" style={{ color: "var(--color-muted)" }}>{mc.description}</div>
                        </div>
                        {active && (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ color: mc.color, flexShrink: 0 }}>
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <textarea
              ref={textareaRef}
              rows={1}
              placeholder={placeholder}
              disabled={disabled}
              onInput={onInput}
              onKeyDown={handleKey}
              className="chat-textarea flex-1 resize-none bg-transparent focus:outline-none leading-[1.55] text-[14px]"
              style={{ color: "var(--color-text)", maxHeight: 180, padding: "7px 2px", fontFamily: "var(--font-sans)" }}
            />

            <button
              onClick={submit}
              disabled={!canSend}
              className="flex-shrink-0 w-8 h-8 mb-[1px] rounded-full flex items-center justify-center transition-colors duration-150"
              style={{
                // Frost send — always reads as a navy puck (mock keeps it solid).
                // At rest it's a softened accent; ready state is full accent + a soft
                // accent glow. Disabled (streaming) falls back to a neutral disc.
                background: disabled
                  ? "var(--color-surface-2)"
                  : canSend
                    ? sendBgColor
                    : `color-mix(in oklab, ${sendBgColor} 42%, var(--color-surface))`,
                color: disabled ? "var(--color-muted)" : "white",
                boxShadow: canSend ? `0 4px 12px -5px color-mix(in oklab, ${sendBgColor} 55%, transparent)` : "none",
                animation: launching ? "send-launch 360ms ease-out" : "none",
              }}
            >
              {disabled ? (
                <span className="inline-block rounded-full border-2 border-white border-t-transparent"
                  style={{ width: 13, height: 13, animation: "spin 0.9s linear infinite" }} />
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
                </svg>
              )}
            </button>
          </div>

          {/* "+" Popover — Attach · Pin Tickers · Templates (mode now lives in the pill) */}
          {popoverOpen && (
            <div
              ref={popoverRef}
              className="absolute bottom-full left-0 mb-2 z-50 rounded-[14px] overflow-hidden"
              style={{ width: 310, background: "var(--color-bg)", border: "1px solid var(--color-border)", boxShadow: "0 8px 32px rgba(15,23,42,0.14)" }}
            >
              {/* ATTACH */}
              <div className="px-4 pt-3 pb-2.5" style={{ borderBottom: "1px solid var(--color-border)" }}>
                <p className="eyebrow-label mb-2" style={{ color: "var(--color-muted)" }}>Attach</p>
                <button onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-[8px] text-[12.5px] transition-colors duration-100"
                  style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                  Add file, chart, or image
                </button>
                <input ref={fileInputRef} type="file" accept="image/*,.pdf" multiple className="hidden" onChange={handleFileSelect} />
              </div>

              {/* TICKERS */}
              <div className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--color-border)" }}>
                <p className="eyebrow-label mb-2" style={{ color: "var(--color-muted)" }}>Pin Tickers</p>
                {tickers.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {tickers.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md"
                        style={{ background: "var(--color-accent-light)", color: "var(--color-accent)" }}>
                        {t} <button onClick={() => setTickers((p) => p.filter((x) => x !== t))} className="hover:opacity-60">×</button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-1.5">
                  <input type="text" value={tickerInput}
                    onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTicker(); } }}
                    placeholder="AAPL, NVDA…" maxLength={8}
                    className="flex-1 text-[12px] px-2.5 py-1.5 rounded-[7px] focus:outline-none"
                    style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)", fontFamily: "var(--font-sans)" }} />
                  <button onClick={addTicker} className="px-2.5 py-1.5 rounded-[7px] text-[12px] font-semibold"
                    style={{ background: "var(--color-accent)", color: "white" }}>Add</button>
                </div>
              </div>

              {/* WATCHLISTS */}
              {watchlists.length > 0 && (
                <div className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <p className="eyebrow-label mb-2" style={{ color: "var(--color-muted)" }}>Reference Watchlist</p>
                  <div className="flex flex-col gap-0.5 max-h-[148px] overflow-y-auto">
                    {watchlists.map((w) => {
                      const selected = watchlistRefs.some((x) => x.id === w.id);
                      return (
                        <button key={w.id} onClick={() => toggleWatchlist(w)}
                          className="template-btn w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[7px] text-left transition-colors duration-100"
                          style={selected ? { background: "var(--color-accent-light)" } : undefined}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                            style={{ color: selected ? "var(--color-accent)" : "var(--color-muted)", flexShrink: 0 }}>
                            <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                            <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                          </svg>
                          <span className="flex-1 min-w-0 truncate text-[12.5px]"
                            style={{ color: selected ? "var(--color-accent)" : "var(--color-text-secondary)", fontWeight: selected ? 600 : 400 }}>
                            {w.name}
                          </span>
                          <span className="text-[11px]" style={{ color: "var(--color-muted)" }}>{w.tickers.length}</span>
                          {selected && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-accent)", flexShrink: 0 }}>
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* PLAYBOOKS — saved from past conversations via the ⋯ menu */}
              {Array.isArray(playbooks) && playbooks.length > 0 && (
                <div className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <p className="eyebrow-label mb-1.5" style={{ color: "var(--color-muted)" }}>Your Playbooks</p>
                  <div className="flex flex-col gap-0.5 max-h-[148px] overflow-y-auto">
                    {playbooks.map((pb) => (
                      <button key={pb.id} onClick={() => applyTemplate(pb.steps[0] ?? "")}
                        className="template-btn w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[7px] text-left text-[12px] transition-colors duration-100"
                        style={{ color: "var(--color-text-secondary)" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                          style={{ color: "var(--color-accent)", flexShrink: 0 }}>
                          <path d="M19 21l-7-4-7 4V5a2 2 0 012-2h10a2 2 0 012 2v16z" />
                        </svg>
                        <span className="flex-1 min-w-0 truncate">{pb.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* TEMPLATES */}
              <div className="px-4 pt-2.5 pb-3">
                <p className="eyebrow-label mb-1.5" style={{ color: "var(--color-muted)" }}>Templates</p>
                {PROMPT_TEMPLATES.map((pt) => (
                  <button key={pt.label} onClick={() => applyTemplate(pt.template)}
                    className="template-btn w-full text-left px-2.5 py-1.5 rounded-[7px] text-[12px] transition-colors duration-100"
                    style={{ color: "var(--color-text-secondary)" }}>
                    {pt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <p
          className="text-center text-[10.5px] text-[var(--color-muted)] tracking-[0.04em]"
          style={{ marginTop: "var(--composer-footer-gap, 12px)" }}
        >
          Not financial advice · Always do your own research
        </p>
      </div>
    </div>
  );
}
