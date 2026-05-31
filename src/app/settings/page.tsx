"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useAuth } from "@/context/AuthContext";
import { authFetcher, authFetch } from "@/lib/authFetch";

interface UserData {
  uid: string;
  name: string | null;
  email: string | null;
  photoURL: string | null;
  createdAt: string | null;
  plan: string;
  allowDataTraining: boolean;
  locationMetadata: boolean;
  stats: { conversations: number; briefings: number };
}

// ─── Icons (inline 24×24 stroke paths) ────────────────────────────────────────

const ICON_PATHS: Record<string, string> = {
  general:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  account: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  card: '<rect x="1" y="4" width="22" height="16" rx="2.5"/><line x1="1" y1="10" x2="23" y2="10"/>',
  activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  download:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  trash:
    '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
};

function Icon({
  name,
  size = 16,
  stroke = 2,
  style,
}: {
  name: string;
  size?: number;
  stroke?: number;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  );
}

// ─── Navigation ───────────────────────────────────────────────────────────────

const NAV = [
  {
    grp: "Workspace",
    items: [
      { id: "general", label: "General", icon: "general" },
      { id: "notifications", label: "Notifications", icon: "bell" },
      { id: "connections", label: "Connections", icon: "link" },
    ],
  },
  {
    grp: "Account",
    items: [
      { id: "account", label: "Profile", icon: "account" },
      { id: "privacy", label: "Privacy & Data", icon: "shield" },
      { id: "billing", label: "Billing", icon: "card" },
      { id: "usage", label: "Usage", icon: "activity" },
    ],
  },
] as const;

type SectionId = (typeof NAV)[number]["items"][number]["id"];

// ─── Shared primitives ────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-[22px] w-[40px] flex-shrink-0 items-center rounded-full transition-colors duration-200"
      style={{ background: checked ? "var(--color-accent)" : "var(--color-border-strong)" }}
    >
      <span
        className="inline-block h-[16px] w-[16px] transform rounded-full bg-white shadow transition-transform duration-200"
        style={{ transform: checked ? "translateX(21px)" : "translateX(3px)" }}
      />
    </button>
  );
}

type BtnVariant = "soft" | "prim" | "danger";
function Btn({
  variant = "soft",
  onClick,
  disabled,
  children,
}: {
  variant?: BtnVariant;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const styles: Record<BtnVariant, React.CSSProperties> = {
    soft: {
      background: "var(--color-surface)",
      border: "1px solid var(--color-border-strong)",
      color: "var(--color-text)",
    },
    prim: { background: "var(--color-accent)", border: "1px solid var(--color-accent)", color: "#fff" },
    danger: { background: "transparent", border: "1px solid var(--color-bear)", color: "var(--color-bear)" },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`set-btn set-btn--${variant} inline-flex items-center gap-1.5 px-[13px] py-[7px] text-[12.5px] font-semibold rounded-[8px] transition-colors duration-150 disabled:opacity-50`}
      style={styles[variant]}
    >
      {children}
    </button>
  );
}

function Row({
  label,
  description,
  danger,
  children,
}: {
  label: string;
  description?: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-start justify-between gap-6 py-4"
      style={{ borderBottom: "1px solid var(--color-border)" }}
    >
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold" style={{ color: danger ? "var(--color-bear)" : "var(--color-text)" }}>
          {label}
        </p>
        {description && (
          <p
            className="text-[12.5px] mt-[3px] leading-relaxed"
            style={{ color: "var(--color-text-secondary)", maxWidth: "42ch" }}
          >
            {description}
          </p>
        )}
      </div>
      <div className="flex-shrink-0 flex items-center">{children}</div>
    </div>
  );
}

function Head({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <div className="mb-2">
        <h2 className="text-[19px] font-bold tracking-[-0.01em]" style={{ color: "var(--color-text)" }}>
          {title}
        </h2>
        {description && (
          <p className="text-[13px] mt-[5px] leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
            {description}
          </p>
        )}
      </div>
      <div style={{ height: 1, background: "var(--color-border)", margin: "18px 0 6px" }} />
    </div>
  );
}

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // localStorage is client-only; reading it in an effect (not render) is the
  // hydration-safe way to pick up the stored theme without an SSR mismatch.
  useEffect(() => {
    const stored = localStorage.getItem("lucra-theme") as "light" | "dark" | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(stored ?? "light");
  }, []);

  function select(next: "light" | "dark") {
    setTheme(next);
    localStorage.setItem("lucra-theme", next);
    if (next === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
  }

  return { theme, select };
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function GeneralSection() {
  const { theme, select } = useTheme();
  return (
    <div>
      <Head title="General" description="App-wide preferences and appearance." />
      <Row label="Appearance" description="Choose between light and dark theme.">
        <div
          className="inline-flex gap-[3px] p-[3px] rounded-[8px]"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        >
          {([["light", "sun"], ["dark", "moon"]] as const).map(([t, ic]) => (
            <button
              key={t}
              onClick={() => select(t)}
              className="inline-flex items-center gap-1.5 px-3 py-[5px] text-[12px] font-medium rounded-[5px] capitalize transition-all duration-150"
              style={
                theme === t
                  ? {
                      background: "var(--color-bg)",
                      color: "var(--color-accent)",
                      boxShadow: "0 1px 2px rgba(15,23,42,0.06)",
                      fontWeight: 600,
                    }
                  : { color: "var(--color-text-secondary)" }
              }
            >
              <Icon name={ic} size={13} /> {t}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Language" description="Language used across the app.">
        <span
          className="text-[13px] flex items-center gap-[7px]"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <Icon name="globe" size={14} /> English
        </span>
      </Row>
      <Row label="Start screen" description="Where Lucra opens when you launch the app.">
        <span className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
          Chat
        </span>
      </Row>
    </div>
  );
}

function NotificationsSection() {
  const [s, setS] = useState({ briefing: true, alerts: true, runs: true, product: false, email: true });
  const set = (k: keyof typeof s) => (v: boolean) => setS((p) => ({ ...p, [k]: v }));
  const items: [keyof typeof s, string, string][] = [
    ["briefing", "Weekly briefing ready", "Get notified when your Monday briefing is generated."],
    ["alerts", "Price & signal alerts", "Movements and agent signals on your watchlist and holdings."],
    ["runs", "Agent run summaries", "A digest when a scheduled routine finishes."],
    ["product", "Product updates", "Occasional news about new Lucra features."],
  ];
  return (
    <div>
      <Head title="Notifications" description="Decide what Lucra notifies you about." />
      {items.map(([k, l, d]) => (
        <Row key={k} label={l} description={d}>
          <Toggle checked={s[k]} onChange={set(k)} />
        </Row>
      ))}
      <Row label="Email notifications" description="Also deliver the above to your inbox.">
        <Toggle checked={s.email} onChange={set("email")} />
      </Row>
    </div>
  );
}

function ConnectionsSection({ userData }: { userData: UserData | undefined }) {
  const rows = [
    {
      logo: "AL",
      color: "#ffd400",
      fg: "#0d1626",
      border: false,
      nm: "Alpaca",
      st: "Connected · Paper trading",
      live: true,
      btn: "Manage",
    },
    {
      logo: "G",
      color: "#fff",
      fg: "#1a4b8f",
      border: true,
      nm: "Google",
      st: userData?.email ? `Linked · ${userData.email}` : "Linked",
      live: true,
      btn: "Manage",
    },
    {
      logo: "▦",
      color: "var(--color-surface-2)",
      fg: "var(--color-muted)",
      border: false,
      nm: "Plaid",
      st: "Not connected",
      live: false,
      btn: "Connect",
    },
  ];
  return (
    <div>
      <Head title="Connections" description="Brokerages and services linked to your Lucra account." />
      {rows.map((r) => (
        <div
          key={r.nm}
          className="flex items-center gap-[13px] py-[14px]"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <div
            className="w-10 h-10 rounded-[10px] flex items-center justify-center font-extrabold text-[13px] flex-shrink-0"
            style={{
              background: r.color,
              color: r.fg,
              border: `1px solid ${r.border ? "var(--color-border-strong)" : "transparent"}`,
            }}
          >
            {r.logo}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-semibold" style={{ color: "var(--color-text)" }}>
              {r.nm}
            </div>
            <div className="text-[12px] mt-[2px] flex items-center gap-1.5" style={{ color: "var(--color-text-secondary)" }}>
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: r.live ? "var(--color-bull)" : "var(--color-muted)" }}
              />
              {r.st}
            </div>
          </div>
          <Btn variant={r.live ? "soft" : "prim"}>{r.btn}</Btn>
        </div>
      ))}
    </div>
  );
}

function ProfileSection({ userData, mutate }: { userData: UserData | undefined; mutate: () => void }) {
  const { signOut } = useAuth();
  const [name, setName] = useState(userData?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sync the editable field when the fetched profile name arrives/changes
  // (render-phase reset, no effect).
  const [prevName, setPrevName] = useState(userData?.name);
  if (userData?.name !== prevName) {
    setPrevName(userData?.name);
    if (userData?.name) setName(userData.name);
  }

  async function saveName() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await authFetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name.trim() }),
      });
      mutate();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  const initials = (userData?.name ?? userData?.email ?? "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const memberSince = userData?.createdAt
    ? new Date(userData.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "—";

  return (
    <div>
      <Head title="Profile" description="Manage your personal information." />
      <div className="flex items-center gap-4" style={{ padding: "8px 0 22px" }}>
        {userData?.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={userData.photoURL}
            alt={userData.name ?? ""}
            className="w-[60px] h-[60px] rounded-full object-cover flex-shrink-0"
            style={{ border: "1px solid var(--color-accent-medium)" }}
          />
        ) : (
          <div
            className="w-[60px] h-[60px] rounded-full flex items-center justify-center text-[22px] font-bold flex-shrink-0"
            style={{
              background: "var(--color-accent-light)",
              color: "var(--color-accent)",
              border: "1px solid var(--color-accent-medium)",
            }}
          >
            {initials}
          </div>
        )}
        <div>
          <div className="text-[17px] font-bold" style={{ color: "var(--color-text)" }}>
            {userData?.name ?? "—"}
          </div>
          <div className="text-[12.5px] mt-[1px]" style={{ color: "var(--color-text-secondary)" }}>
            {userData?.email ?? "—"}
          </div>
          <div className="text-[11.5px] mt-1" style={{ color: "var(--color-muted)" }}>
            Member since {memberSince}
          </div>
        </div>
      </div>

      <Row label="Display name" description="How your name appears across the app.">
        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-[12px] font-semibold" style={{ color: "var(--color-bull)" }}>
              Saved
            </span>
          )}
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && saveName()}
            className="text-[13px] px-[11px] py-[7px] rounded-[8px] outline-none transition-colors duration-150"
            style={{
              background: "var(--color-bg)",
              border: "1px solid var(--color-border-strong)",
              color: "var(--color-text)",
              width: 170,
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--color-accent)";
              e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-accent-light)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border-strong)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
          <Btn variant="prim" onClick={saveName} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Save"}
          </Btn>
        </div>
      </Row>

      <Row label="Email" description="Your login email. Managed by Google.">
        <span className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
          {userData?.email ?? "—"}
        </span>
      </Row>

      <Row label="Sign out" description="Sign out of Lucra on this device.">
        <Btn variant="soft" onClick={signOut}>
          <Icon name="logout" size={14} /> Sign out
        </Btn>
      </Row>
    </div>
  );
}

function PrivacySection({ userData, mutate }: { userData: UserData | undefined; mutate: () => void }) {
  async function patch(key: string, value: boolean) {
    await authFetch("/api/user", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });
    mutate();
  }

  return (
    <div>
      <Head title="Privacy & Data" description="Control how Lucra uses and stores your data." />
      <Row
        label="Help improve Lucra"
        description="Allow your chats and sessions to improve AI models. You can opt out at any time."
      >
        <Toggle checked={userData?.allowDataTraining ?? true} onChange={(v) => patch("allowDataTraining", v)} />
      </Row>
      <Row label="Location metadata" description="Use coarse location (city/region) to improve market context.">
        <Toggle checked={userData?.locationMetadata ?? true} onChange={(v) => patch("locationMetadata", v)} />
      </Row>
      <Row label="Export data" description="Download a copy of your conversations, portfolio, and preferences.">
        <Btn variant="soft">
          <Icon name="download" size={14} /> Export
        </Btn>
      </Row>
      <Row
        label="Delete account"
        description="Permanently delete your account and all associated data. This cannot be undone."
        danger
      >
        <Btn variant="danger">
          <Icon name="trash" size={14} /> Delete account
        </Btn>
      </Row>
    </div>
  );
}

function BillingSection({ userData, mutate }: { userData: UserData | undefined; mutate: () => void }) {
  const plan = userData?.plan ?? "Pro";
  const feats = [
    "Unlimited research chats",
    "5 daily agent routines",
    "Multi-agent deep research",
    "Backtesting & paper trading",
  ];

  async function setPlan(p: string) {
    await authFetch("/api/user", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: p }),
    });
    mutate();
  }

  return (
    <div>
      <Head title="Billing" description="Your subscription and payment details." />

      <div
        style={{
          border: "1px solid var(--color-accent-medium)",
          borderRadius: 14,
          padding: 20,
          background: "var(--color-accent-light)",
          marginBottom: 22,
        }}
      >
        <div className="flex justify-between items-start">
          <div>
            <div className="eyebrow-label" style={{ color: "var(--color-accent)", letterSpacing: "0.18em" }}>
              Current plan
            </div>
            <div
              className="mt-1.5 text-[26px] font-bold"
              style={{ fontFamily: "var(--font-serif)", color: "var(--color-text)" }}
            >
              Lucra {plan}
            </div>
            <div className="text-[12.5px] mt-[3px]" style={{ color: "var(--color-text-secondary)" }}>
              {plan === "Pro" ? "$29/mo · renews April 14, 2026" : "Free plan"}
            </div>
          </div>
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full text-[12px] font-semibold uppercase"
            style={{
              background: "var(--color-accent-light)",
              color: "var(--color-accent)",
              border: "1px solid var(--color-accent-medium)",
            }}
          >
            {plan}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-5 mt-4">
          {feats.map((f) => (
            <div key={f} className="flex items-center gap-[9px] text-[12.5px] py-[5px]" style={{ color: "var(--color-text-secondary)" }}>
              <span style={{ color: "var(--color-bull)" }} className="flex-shrink-0">
                <Icon name="check" size={14} stroke={2.6} />
              </span>
              {f}
            </div>
          ))}
        </div>
      </div>

      <Row label="Plan" description="Upgrade, downgrade, or compare plans.">
        <Btn variant="soft" onClick={() => setPlan(plan === "Pro" ? "Free" : "Pro")}>
          Change plan
        </Btn>
      </Row>
      <Row label="Payment method" description="Visa ending 4242 · managed via Stripe.">
        <Btn variant="soft">
          <Icon name="card" size={14} /> Manage billing
        </Btn>
      </Row>
      <Row label="Auto-reload" description="Automatically add credits when your balance runs low.">
        <Btn variant="soft">Configure</Btn>
      </Row>
      <Row label="Invoices" description="Download past receipts and invoices.">
        <Btn variant="soft">View history</Btn>
      </Row>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number | string; sub: string }) {
  return (
    <div
      className="rounded-[12px] px-4 py-[15px]"
      style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}
    >
      <div
        className="text-[10px] font-bold uppercase"
        style={{ letterSpacing: "0.14em", color: "var(--color-muted)" }}
      >
        {label}
      </div>
      <div
        className="text-[30px] font-bold leading-none mt-2"
        style={{ fontFamily: "var(--font-serif)", color: "var(--color-text)" }}
      >
        {value}
      </div>
      <div className="text-[11px] mt-[5px]" style={{ color: "var(--color-text-secondary)" }}>
        {sub}
      </div>
    </div>
  );
}

function UsageSection({ userData }: { userData: UserData | undefined }) {
  const stats = userData?.stats;
  const weekly = { pct: 69, used: 690, total: 1000, resets: "Wednesday" };
  const daily = { used: 1, total: 5 };
  const activity = [4, 9, 6, 13, 8, 17, 11];
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  const max = Math.max(...activity);

  return (
    <div>
      <Head title="Usage" description="Your activity and limits this billing period." />

      <div className="grid grid-cols-3 gap-3" style={{ margin: "4px 0 22px" }}>
        <StatCard label="Conversations" value={stats?.conversations ?? "—"} sub="all time" />
        <StatCard label="Briefings" value={stats?.briefings ?? "—"} sub="generated" />
        <StatCard label="Backtests" value={19} sub="run" />
      </div>

      <Row label="Weekly model usage" description={`All models combined. Resets every ${weekly.resets}.`}>
        <div style={{ width: 200 }}>
          <div className="h-[7px] rounded-full overflow-hidden" style={{ background: "var(--color-surface-2)" }}>
            <div className="h-full rounded-full" style={{ width: `${weekly.pct}%`, background: "var(--color-accent)" }} />
          </div>
          <div className="flex justify-between text-[11px] mt-1.5" style={{ color: "var(--color-text-secondary)" }}>
            <span>
              {weekly.used} / {weekly.total} credits
            </span>
            <span style={{ fontWeight: 700, color: "var(--color-text)" }}>{weekly.pct}%</span>
          </div>
        </div>
      </Row>

      <Row label="Daily routine runs" description="Scheduled agent routines included in your plan.">
        <div className="flex items-center gap-[11px]">
          <div className="flex gap-[5px]">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="w-[22px] h-[7px] rounded-full"
                style={{ background: i < daily.used ? "var(--color-accent)" : "var(--color-surface-2)" }}
              />
            ))}
          </div>
          <span className="text-[12.5px] font-bold" style={{ color: "var(--color-text)" }}>
            {daily.used} / {daily.total}
          </span>
        </div>
      </Row>

      <Row label="Activity" description="Conversations started over the last 7 days.">
        <div className="flex flex-col items-end gap-[5px]">
          <div className="flex items-end gap-[5px]" style={{ height: 46 }}>
            {activity.map((v, i) => (
              <div
                key={i}
                className="w-[14px] rounded-t-[3px]"
                style={{
                  height: `${(v / max) * 100}%`,
                  background: v === max ? "var(--color-accent)" : "var(--color-accent-medium)",
                }}
              />
            ))}
          </div>
          <div className="flex gap-[5px]">
            {days.map((d, i) => (
              <span key={i} className="text-[10px] text-center" style={{ width: 14, color: "var(--color-muted)" }}>
                {d}
              </span>
            ))}
          </div>
        </div>
      </Row>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();
  const [active, setActive] = useState<SectionId>("general");
  const { data: userData, mutate } = useSWR<UserData>("/api/user", authFetcher);
  const contentRef = useRef<HTMLDivElement>(null);

  function exitSettings() {
    router.push("/chat");
  }

  function nav(id: SectionId) {
    setActive(id);
    contentRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }

  return (
    <div className="flex h-full" style={{ background: "var(--color-bg)" }}>
      {/* Left rail */}
      <nav
        className="flex-shrink-0 flex flex-col"
        style={{
          width: 232,
          padding: "26px 14px 14px",
          borderRight: "1px solid var(--color-border)",
          background: "var(--color-sidebar)",
        }}
      >
        <button
          onClick={exitSettings}
          className="settings-back inline-flex items-center gap-1.5 text-[12px] font-medium rounded-[7px] transition-colors duration-100"
          style={{ color: "var(--color-text-secondary)", padding: "5px 8px", margin: "0 2px 10px", alignSelf: "flex-start" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to app
        </button>
        <div
          className="text-[21px] font-bold tracking-[-0.01em]"
          style={{ fontFamily: "var(--font-serif)", color: "var(--color-text)", padding: "0 10px", marginBottom: 22 }}
        >
          Settings
        </div>
        {NAV.map((g) => (
          <div key={g.grp} className="mb-[18px]">
            <div className="eyebrow-label" style={{ padding: "0 10px 7px", letterSpacing: "0.18em", color: "var(--color-muted)" }}>
              {g.grp}
            </div>
            {g.items.map((it) => (
              <button
                key={it.id}
                onClick={() => nav(it.id)}
                className={`settings-nav-item${active === it.id ? " is-active" : ""} w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] text-[13px] font-medium text-left mb-[1px] transition-colors duration-100`}
              >
                <span className="flex-shrink-0" style={{ opacity: active === it.id ? 1 : 0.85 }}>
                  <Icon name={it.icon} size={16} stroke={1.9} />
                </span>
                {it.label}
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* Content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto">
        <div style={{ maxWidth: 624, margin: "0 auto", padding: "40px 44px 64px" }}>
          {active === "general" && <GeneralSection />}
          {active === "notifications" && <NotificationsSection />}
          {active === "connections" && <ConnectionsSection userData={userData} />}
          {active === "account" && <ProfileSection userData={userData} mutate={mutate} />}
          {active === "privacy" && <PrivacySection userData={userData} mutate={mutate} />}
          {active === "billing" && <BillingSection userData={userData} mutate={mutate} />}
          {active === "usage" && <UsageSection userData={userData} />}
        </div>
      </div>
    </div>
  );
}
