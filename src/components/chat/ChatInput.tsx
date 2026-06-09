"use client";
import { useRef, useEffect, useState, useCallback, type KeyboardEvent } from "react";
import type { ChatMode } from "@/types/chat";
import { AGENT_COUNT, PROMPT_TEMPLATES } from "@/types/chat";

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

const MODE_ORDER: ChatMode[] = ["agent", "deep_research", "backtest", "simple"];

export default function ChatInput({ onSend, disabled, mode, onModeChange }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const plusBtnRef = useRef<HTMLButtonElement>(null);
  const modeWrapRef = useRef<HTMLDivElement>(null);

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [tickers, setTickers] = useState<string[]>([]);
  const [tickerInput, setTickerInput] = useState("");
  const [hasText, setHasText] = useState(false);
  const [launching, setLaunching] = useState(false);

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
    if (!disabled) textareaRef.current?.focus();
  }, [disabled]);

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
    const attachSuffix = attachments.length > 0
      ? `\n\n[Attached files: ${attachments.map((a) => a.name).join(", ")}]` : "";
    onSend(tickerPrefix + val + attachSuffix, attachments.length > 0 ? attachments : undefined);
    if (textareaRef.current) { textareaRef.current.value = ""; textareaRef.current.style.height = "auto"; }
    setHasText(false);
    setAttachments([]);
    setTickers([]);
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
    : mode === "backtest" ? "Describe a strategy to backtest…"
    : "Ask about a stock or your portfolio…";

  const sendBgColor =
    mode === "deep_research" ? "var(--color-deep-research)"
    : mode === "backtest" ? "var(--color-backtest)"
    : "var(--color-accent)";

  const cfg = MODE_CONFIG[mode];

  return (
    <div
      className="flex-shrink-0 px-6 pb-6 pt-5"
      style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0) 0%, var(--color-bg) 28%)" }}
    >
      <div className="mx-auto max-w-[720px]">
        {/* Chips row */}
        {(attachments.length > 0 || tickers.length > 0) && (
          <div className="flex flex-wrap gap-1.5 mb-2 px-1">
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
              background: "var(--color-bg)",
              border: "1px solid var(--color-border)",
              borderRadius: 16,
              padding: 8,
              boxShadow: disabled ? "none" : "0 1px 4px rgba(15,23,42,0.04)",
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
                className="inline-flex items-center gap-1.5 h-8 px-2.5 mb-[1px] rounded-[9px] text-[12px] font-semibold"
                style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", color: cfg.color }}
              >
                {cfg.icon}
                <span>{cfg.pill}</span>
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
                background: canSend ? sendBgColor : "var(--color-surface-2)",
                color: canSend ? "white" : "var(--color-muted)",
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

        <p className="text-center text-[10.5px] text-[var(--color-muted)] mt-3 tracking-[0.04em]">
          Not financial advice · Always do your own research
        </p>
      </div>
    </div>
  );
}
