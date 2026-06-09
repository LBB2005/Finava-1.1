"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useAuth } from "@/context/AuthContext";
import { authFetcher, authFetch } from "@/lib/authFetch";
import { PLANS, PLAN_ORDER, type PlanName, type BillingCadence } from "@/lib/plans";
import { usePortfolio } from "@/hooks/usePortfolio";
import ConnectBrokerageButton from "@/components/portfolio/ConnectBrokerageButton";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";

interface UserData {
  uid: string;
  name: string | null;
  email: string | null;
  photoURL: string | null;
  createdAt: string | null;
  plan: string;
  planSource?: string;
  subscriptionStatus?: string | null;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  capabilities?: Record<string, boolean>;
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
    const stored = localStorage.getItem("finava-theme") as "light" | "dark" | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(stored ?? "light");
  }, []);

  function select(next: "light" | "dark") {
    setTheme(next);
    localStorage.setItem("finava-theme", next);
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
      <Row label="Start screen" description="Where Finava opens when you launch the app.">
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
    ["product", "Product updates", "Occasional news about new Finava features."],
  ];
  return (
    <div>
      <Head title="Notifications" description="Decide what Finava notifies you about." />
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

function ConnectionRow({
  logo,
  color,
  fg,
  border,
  name,
  status,
  live,
  children,
}: {
  logo: string;
  color: string;
  fg: string;
  border?: boolean;
  name: string;
  status: string;
  live: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center gap-[13px] py-[14px]"
      style={{ borderBottom: "1px solid var(--color-border)" }}
    >
      <div
        className="w-10 h-10 rounded-[10px] flex items-center justify-center font-extrabold text-[13px] flex-shrink-0"
        style={{ background: color, color: fg, border: `1px solid ${border ? "var(--color-border-strong)" : "transparent"}` }}
      >
        {logo}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-semibold" style={{ color: "var(--color-text)" }}>
          {name}
        </div>
        <div className="text-[12px] mt-[2px] flex items-center gap-1.5" style={{ color: "var(--color-text-secondary)" }}>
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: live ? "var(--color-bull)" : "var(--color-muted)" }} />
          {status}
        </div>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function PlaidRow() {
  const { plaidConnected, plaidInstitutions, disconnectPlaid, refresh } = usePortfolio();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const inst = plaidInstitutions[0];

  async function handleDisconnect() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    try {
      await disconnectPlaid();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const status = plaidConnected
    ? `Connected · ${inst?.name ?? "Brokerage"}${inst?.lastSyncedAt ? ` · synced ${new Date(inst.lastSyncedAt).toLocaleDateString()}` : ""}`
    : "Not connected";

  return (
    <ConnectionRow logo="◉" color="#111c2e" fg="#fff" name="Plaid" status={status} live={plaidConnected}>
      {plaidConnected ? (
        <Btn variant={confirming ? "danger" : "soft"} onClick={handleDisconnect} disabled={busy}>
          {busy ? "Disconnecting…" : confirming ? "Confirm disconnect" : "Disconnect"}
        </Btn>
      ) : (
        <ConnectBrokerageButton
          className="inline-flex items-center gap-1.5 px-[13px] py-[7px] text-[12.5px] font-semibold rounded-[8px] bg-[var(--color-accent)] text-white transition-colors duration-150"
          label="Connect"
          onLinked={refresh}
        />
      )}
    </ConnectionRow>
  );
}

function ConnectionsSection({ userData }: { userData: UserData | undefined }) {
  return (
    <div>
      <Head title="Connections" description="Brokerages and services linked to your Finava account." />
      <ConnectionRow logo="AL" color="#ffd400" fg="#0d1626" name="Alpaca" status="Connected · Paper trading" live>
        <Btn variant="soft">Manage</Btn>
      </ConnectionRow>
      <ConnectionRow
        logo="G"
        color="#fff"
        fg="#1a4b8f"
        border
        name="Google"
        status={userData?.email ? `Linked · ${userData.email}` : "Linked"}
        live
      >
        <Btn variant="soft">Manage</Btn>
      </ConnectionRow>
      <PlaidRow />
      {/* When connected, manual portfolio entry is disabled — Plaid is the source of truth. */}
      <p className="text-[11.5px] mt-3 leading-relaxed" style={{ color: "var(--color-muted)" }}>
        Connecting a brokerage replaces your portfolio with the synced holdings and turns off
        manual entry. Disconnecting keeps those holdings as editable manual positions.
      </p>
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

      <Row label="Sign out" description="Sign out of Finava on this device.">
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
      <Head title="Privacy & Data" description="Control how Finava uses and stores your data." />
      <Row
        label="Help improve Finava"
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

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function daysLeft(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));
}

/** A short human feature list derived from the plan config. */
function planFeatures(plan: PlanName): string[] {
  const c = PLANS[plan];
  const dr =
    c.deepResearchPerMonth === Infinity
      ? "Unlimited Deep Research"
      : `${c.deepResearchPerMonth} Deep Research / mo`;
  const feats = [dr];
  if (c.capabilities.plaidLinking) feats.push("Live brokerage sync");
  if (c.capabilities.weeklyBriefings) feats.push("Weekly AI briefings");
  if (c.capabilities.priorityProcessing) feats.push("Priority processing");
  if (c.capabilities.quantSuite) feats.push("Hedge-fund suite");
  feats.push(
    c.watchlistLimit === Infinity ? "Unlimited watchlists" : `${c.watchlistLimit} watchlist`
  );
  return feats;
}

function BillingSection({ userData }: { userData: UserData | undefined; mutate: () => void }) {
  const plan = (userData?.plan as PlanName) ?? "Free";
  const source = userData?.planSource;
  const status = userData?.subscriptionStatus;
  const isSubscribed = !!status && ["active", "trialing", "past_due"].includes(status);

  const [cadence, setCadence] = useState<BillingCadence>("monthly");
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function startCheckout(target: PlanName) {
    setBusy(target);
    try {
      const res = await authFetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: target, cadence }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url as string;
        return;
      }
      alert(data.error === "plan_not_purchasable"
        ? "That plan isn't available yet."
        : "Could not start checkout. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function openPortal() {
    setBusy("portal");
    try {
      const res = await authFetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url as string;
        return;
      }
      // No Stripe customer yet → send them to pick a plan instead.
      if (res.status === 404) setPicking(true);
      else alert("Could not open the billing portal. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  // Status line under the plan title.
  let statusLine: string;
  if (source === "trial") {
    statusLine = `Trial — ${daysLeft(userData?.trialEndsAt)} day${daysLeft(userData?.trialEndsAt) === 1 ? "" : "s"} left · then Free`;
  } else if (isSubscribed && userData?.currentPeriodEnd) {
    statusLine = userData?.cancelAtPeriodEnd
      ? `Cancels ${fmtDate(userData.currentPeriodEnd)}`
      : `Renews ${fmtDate(userData.currentPeriodEnd)}`;
  } else if (plan === "Free") {
    statusLine = "Free plan";
  } else {
    statusLine = PLANS[plan].price.monthly + "/mo";
  }

  const purchasable = PLAN_ORDER.filter((p) => PLANS[p].stripe.purchasable);

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
              Finava {plan}
            </div>
            <div className="text-[12.5px] mt-[3px]" style={{ color: "var(--color-text-secondary)" }}>
              {statusLine}
              {status === "past_due" && " · payment failed"}
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
          {planFeatures(plan).map((f) => (
            <div key={f} className="flex items-center gap-[9px] text-[12.5px] py-[5px]" style={{ color: "var(--color-text-secondary)" }}>
              <span style={{ color: "var(--color-bull)" }} className="flex-shrink-0">
                <Icon name="check" size={14} stroke={2.6} />
              </span>
              {f}
            </div>
          ))}
        </div>
      </div>

      {picking && (
        <div
          className="rounded-[14px] p-5 mb-5"
          style={{ border: "1px solid var(--color-border)", background: "var(--color-bg)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-[14px] font-bold" style={{ color: "var(--color-text)" }}>
              Choose a plan
            </p>
            {/* Monthly / annual toggle */}
            <div
              className="inline-flex gap-[3px] p-[3px] rounded-[8px]"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
            >
              {(["monthly", "annual"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setCadence(c)}
                  className="px-3 py-[5px] text-[12px] font-medium rounded-[5px] capitalize transition-all duration-150"
                  style={
                    cadence === c
                      ? { background: "var(--color-bg)", color: "var(--color-accent)", fontWeight: 600 }
                      : { color: "var(--color-text-secondary)" }
                  }
                >
                  {c === "annual" ? "Annual · save 2 mo" : "Monthly"}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {purchasable.map((p) => {
              const c = PLANS[p];
              const isCurrent = p === plan && isSubscribed;
              return (
                <div
                  key={p}
                  className="rounded-[12px] p-4 flex flex-col"
                  style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)" }}
                >
                  <div className="text-[15px] font-bold" style={{ color: "var(--color-text)" }}>
                    Finava {c.label}
                  </div>
                  <div className="text-[20px] font-bold mt-1" style={{ fontFamily: "var(--font-serif)", color: "var(--color-text)" }}>
                    {cadence === "monthly" ? c.price.monthly : c.price.annual}
                    <span className="text-[12px] font-normal" style={{ color: "var(--color-text-secondary)" }}>
                      {cadence === "monthly" ? " / mo" : " / yr"}
                    </span>
                  </div>
                  <div className="mt-3 mb-4 flex-1 space-y-1.5">
                    {planFeatures(p).map((f) => (
                      <div key={f} className="flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--color-text-secondary)" }}>
                        <span style={{ color: "var(--color-bull)" }}><Icon name="check" size={12} stroke={2.6} /></span>
                        {f}
                      </div>
                    ))}
                  </div>
                  <Btn
                    variant={isCurrent ? "soft" : "prim"}
                    disabled={isCurrent || busy !== null}
                    onClick={() => startCheckout(p)}
                  >
                    {isCurrent ? "Current plan" : busy === p ? "Redirecting…" : `Choose ${c.label}`}
                  </Btn>
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-[11.5px]" style={{ color: "var(--color-muted)" }}>
            Finava Quant ($100/mo · hedge-fund suite) is coming soon.
          </div>
        </div>
      )}

      <Row label="Plan" description={isSubscribed ? "Upgrade, downgrade, or switch billing period." : "Upgrade to unlock more."}>
        {isSubscribed ? (
          <Btn variant="soft" onClick={openPortal} disabled={busy !== null}>
            {busy === "portal" ? "Opening…" : "Change plan"}
          </Btn>
        ) : (
          <Btn variant="prim" onClick={() => setPicking((v) => !v)}>
            {picking ? "Hide plans" : "Upgrade"}
          </Btn>
        )}
      </Row>
      <Row label="Payment method" description="Managed securely via Stripe.">
        <Btn variant="soft" onClick={openPortal} disabled={busy !== null}>
          <Icon name="card" size={14} /> Manage billing
        </Btn>
      </Row>
      <Row label="Invoices" description="Download past receipts and invoices.">
        <Btn variant="soft" onClick={openPortal} disabled={busy !== null}>View history</Btn>
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

interface UsageMeter {
  used: number;
  limit: number | null;
  pct: number;
}
interface UsageSummary {
  plan: string;
  source?: string;
  trialEndsAt?: string | null;
  daily: UsageMeter;
  weekly: UsageMeter;
  monthly: UsageMeter;
  deepResearch: { used: number; limit: number | null };
  series: { date: string; credits: number }[];
  resets: { daily: string; weekly: string; monthly: string };
}

function fmtDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function UsageBar({ pct, used, limit }: { pct: number; used: number; limit: number | null }) {
  const unlimited = limit === null;
  const over = !unlimited && pct >= 100;
  return (
    <div style={{ width: 220 }}>
      <div className="h-[7px] rounded-full overflow-hidden" style={{ background: "var(--color-surface-2)" }}>
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: unlimited ? "100%" : `${Math.min(100, pct)}%`,
            background: over ? "var(--color-bear)" : "var(--color-accent)",
            opacity: unlimited ? 0.25 : 1,
          }}
        />
      </div>
      <div className="flex justify-between text-[11px] mt-1.5" style={{ color: "var(--color-text-secondary)" }}>
        <span>
          {unlimited ? `${Math.round(used)} credits` : `${Math.round(used)} / ${limit} credits`}
        </span>
        <span style={{ fontWeight: 700, color: over ? "var(--color-bear)" : "var(--color-text)" }}>
          {unlimited ? "Unlimited" : `${pct}%`}
        </span>
      </div>
    </div>
  );
}

interface UsageTooltipProps {
  active?: boolean;
  payload?: { value: number; payload: { date: string } }[];
}
function UsageTooltip({ active, payload }: UsageTooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div
      className="rounded-[8px] px-2.5 py-1.5 text-[11px]"
      style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", boxShadow: "var(--shadow-pop)" }}
    >
      <div style={{ color: "var(--color-muted)" }}>{fmtDay(p.payload.date)}</div>
      <div style={{ color: "var(--color-text)", fontWeight: 700 }}>{Math.round(p.value)} credits</div>
    </div>
  );
}

function meterSub(m: UsageMeter | undefined): string {
  if (!m) return "of allowance";
  if (m.limit === null) return `${Math.round(m.used)} credits · unlimited`;
  return `${Math.round(m.used)} / ${m.limit} credits`;
}

function UsageSection({ onUpgrade }: { onUpgrade: () => void }) {
  const { user } = useAuth();
  const { data } = useSWR<UsageSummary>(user ? "/api/usage" : null, authFetcher, {
    revalidateOnFocus: true,
  });

  const weekly = data?.weekly;
  const daily = data?.daily;
  const monthly = data?.monthly;
  const deep = data?.deepResearch;
  const series = data?.series ?? [];
  const hasUsage = series.some((s) => s.credits > 0);

  return (
    <div>
      <Head title="Usage" description="Your AI usage this period and your plan limits." />

      <div className="grid grid-cols-3 gap-3" style={{ margin: "4px 0 22px" }}>
        <StatCard
          label="Plan"
          value={data?.plan ?? "—"}
          sub={data?.source === "trial" ? "trial" : "current"}
        />
        <StatCard
          label="This month"
          value={monthly ? (monthly.limit === null ? "—" : `${monthly.pct}%`) : "—"}
          sub={meterSub(monthly)}
        />
        <StatCard
          label="Deep Research"
          value={deep ? (deep.limit === null ? `${deep.used}` : `${deep.used}/${deep.limit}`) : "—"}
          sub={deep?.limit === null ? "unlimited · fair use" : "runs this period"}
        />
      </div>

      <Row label="Monthly allowance" description="Cost-weighted across every model. Resets on the 1st (UTC).">
        <UsageBar pct={monthly?.pct ?? 0} used={monthly?.used ?? 0} limit={monthly?.limit ?? 0} />
      </Row>

      <Row label="Weekly allowance" description="Rolling 7-day window.">
        <UsageBar pct={weekly?.pct ?? 0} used={weekly?.used ?? 0} limit={weekly?.limit ?? 0} />
      </Row>

      <Row label="Daily allowance" description="Anti-abuse ceiling. Resets at midnight UTC.">
        <UsageBar pct={daily?.pct ?? 0} used={daily?.used ?? 0} limit={daily?.limit ?? 0} />
      </Row>

      <div className="mt-7">
        <p className="text-[13.5px] font-semibold" style={{ color: "var(--color-text)" }}>
          Usage over time
        </p>
        <p className="text-[12.5px] mt-[3px] mb-3" style={{ color: "var(--color-text-secondary)" }}>
          Credits used per day over the last 30 days.
        </p>
        <div style={{ height: 196 }}>
          {hasUsage ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 6, right: 8, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="settingsUsageArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtDay}
                  tick={{ fontSize: 10, fill: "var(--color-muted)" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={32}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--color-muted)" }}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                  allowDecimals={false}
                />
                <Tooltip content={<UsageTooltip />} cursor={{ stroke: "var(--color-border-strong)", strokeWidth: 1 }} />
                <Area type="monotone" dataKey="credits" stroke="var(--color-accent)" strokeWidth={1.8} fill="url(#settingsUsageArea)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div
              className="h-full flex items-center justify-center rounded-[12px] text-center px-6"
              style={{ border: "1px dashed var(--color-border)", color: "var(--color-muted)", fontSize: 12.5 }}
            >
              No usage yet — your AI activity will chart here as you use Finava.
            </div>
          )}
        </div>
      </div>

      <div className="mt-7">
        <Row label="Need more headroom?" description="Upgrade for a larger monthly allowance and more Deep Research.">
          <Btn variant="prim" onClick={onUpgrade}>Upgrade plan</Btn>
        </Row>
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();
  const [active, setActive] = useState<SectionId>("general");
  const [checkoutNotice, setCheckoutNotice] = useState<"success" | "cancel" | null>(null);
  const { data: userData, mutate } = useSWR<UserData>("/api/user", authFetcher);
  const contentRef = useRef<HTMLDivElement>(null);

  // Deep links like /settings?section=usage (from the sidebar usage popover and
  // the user menu) open the matching section on load.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sec = params.get("section");
    if (sec && NAV.some((g) => g.items.some((it) => it.id === sec))) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActive(sec as SectionId);
    }

    // Returning from Stripe Checkout. The webhook grants the plan, and may land
    // a beat after the browser redirect — so poll-revalidate /api/user briefly.
    const checkout = params.get("checkout");
    if (checkout === "success" || checkout === "cancel") {
      setCheckoutNotice(checkout);
      if (checkout === "success") {
        let n = 0;
        const t = setInterval(() => {
          mutate();
          if (++n >= 5) clearInterval(t);
        }, 1500);
      }
      // Strip the query so a refresh doesn't re-trigger the notice.
      window.history.replaceState({}, "", "/settings?section=billing");
    }
  }, [mutate]);

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
          {checkoutNotice && (
            <div
              className="mb-5 rounded-[10px] px-4 py-3 text-[13px] flex items-center justify-between"
              style={{
                border: `1px solid ${checkoutNotice === "success" ? "var(--color-bull)" : "var(--color-border-strong)"}`,
                background: "var(--color-surface)",
                color: "var(--color-text)",
              }}
            >
              <span>
                {checkoutNotice === "success"
                  ? "Payment received — finalizing your subscription…"
                  : "Checkout canceled. No charge was made."}
              </span>
              <button
                onClick={() => setCheckoutNotice(null)}
                className="text-[12px] font-semibold"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Dismiss
              </button>
            </div>
          )}
          {active === "general" && <GeneralSection />}
          {active === "notifications" && <NotificationsSection />}
          {active === "connections" && <ConnectionsSection userData={userData} />}
          {active === "account" && <ProfileSection userData={userData} mutate={mutate} />}
          {active === "privacy" && <PrivacySection userData={userData} mutate={mutate} />}
          {active === "billing" && <BillingSection userData={userData} mutate={mutate} />}
          {active === "usage" && <UsageSection onUpgrade={() => nav("billing")} />}
        </div>
      </div>
    </div>
  );
}
