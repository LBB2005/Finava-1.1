// Money Map — shared types, SSE protocol, and the pure logic behind the stock
// page's relationship-web tab.
//
// The company sits at the centre; four kinds of relationship orbit it:
//   customer → company   (revenue in)     · verified peers/owners come from Finnhub
//   company  → supplier   (money out)     · suppliers/customers are AI-estimated
//   owner    → company   (capital in)       from the latest 10-K and clearly badged
//   peer     ·  company   (competition)
//
// Everything in this file is pure (no React, no network, no firebase) so the API
// route, the client store, and the unit tests can all share it. The route/store/
// agent are thin shells around these functions; keeping the logic here is what
// keeps them testable.

// ── Types ────────────────────────────────────────────────────────────────────

export type RelationKind = "customer" | "supplier" | "owner" | "peer";
export type RelationSource = "finnhub" | "ai-10k";
export type FlowDirection = "in" | "out" | "none";
export type Confidence = "verified" | "estimated";

export interface MoneyRelation {
  /** Stable dedup key: `${kind}:${ticker ?? slug(name)}`. */
  id: string;
  kind: RelationKind;
  name: string;
  /** Resolved symbol → clickable node; null = private / unlisted / a fund. */
  ticker: string | null;
  /** Revenue-exposure % (customer/supplier) or null when we only have magnitude. */
  weightPct: number | null;
  /** 0..1, normalized within the kind → edge thickness + heat shade. */
  intensity: number;
  direction: FlowDirection;
  confidence: Confidence;
  source: RelationSource;
  /** ≤1 line rationale shown on hover / in the list. */
  note?: string;
  /** OpenRouter slug for AI-estimated links → drives the ModelBadge. */
  model?: string;
}

export interface MoneyMapSelf {
  ticker: string;
  name: string;
  sector: string | null;
  /** Absolute USD market cap (already converted from Finnhub's millions). */
  marketCap: number | null;
}

export interface MoneyMap {
  self: MoneyMapSelf | null;
  relations: MoneyRelation[];
}

// ── SSE wire protocol ────────────────────────────────────────────────────────
// The POST /api/stock/[ticker]/money-map route streams these as `data:` lines;
// moneyMapStore parses them back into a MoneyMap via applyEvent().

export type MoneyMapEvent =
  | { type: "self"; self: MoneyMapSelf }
  | { type: "relation"; relation: MoneyRelation }
  | { type: "done"; generatedAt: string }
  | { type: "error"; message: string };

// ── Kind metadata ────────────────────────────────────────────────────────────

export const KIND_ORDER: RelationKind[] = ["customer", "supplier", "owner", "peer"];

export const KIND_LABELS: Record<RelationKind, string> = {
  customer: "Customers",
  supplier: "Suppliers",
  owner: "Owners",
  peer: "Peers",
};

/** Money-flow direction relative to the company at the centre. */
export const KIND_DIRECTION: Record<RelationKind, FlowDirection> = {
  customer: "in",
  supplier: "out",
  owner: "in",
  peer: "none",
};

// ── Small pure helpers ───────────────────────────────────────────────────────

/** Normalize a company/fund name into a stable slug for dedup ids. */
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "unknown";
}

/** Stable id for a relation — prefer the ticker, fall back to the slugged name. */
export function relationId(kind: RelationKind, ticker: string | null, name: string): string {
  return `${kind}:${ticker ? ticker.toUpperCase() : slugifyName(name)}`;
}

/**
 * Map a list of magnitudes to 0..1 intensities relative to the largest in the
 * list. Missing magnitudes fall back to `fallback` so a node with no weight still
 * draws a visible (but thin) edge. An all-missing list returns all `fallback`.
 */
export function intensities(weights: Array<number | null | undefined>, fallback = 0.4): number[] {
  const valid = weights.filter((w): w is number => typeof w === "number" && Number.isFinite(w) && w > 0);
  const max = valid.length ? Math.max(...valid) : 0;
  return weights.map((w) =>
    typeof w === "number" && Number.isFinite(w) && w > 0 && max > 0
      ? Math.max(0.12, Math.min(1, w / max))
      : fallback
  );
}

/** Compact USD formatter: 2.94e12 → "$2.9T". */
export function compactUsd(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

/** Compact share-count formatter: 1_240_000_000 → "1.2B shares". */
export function compactShares(n: number | null | undefined): string | undefined {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return undefined;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B shares`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M shares`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K shares`;
  return `${Math.round(n)} shares`;
}

/** All relations, strongest money links first (for the flows list). */
export function sortByIntensity(relations: MoneyRelation[]): MoneyRelation[] {
  return [...relations].sort((a, b) => b.intensity - a.intensity);
}

// ── Verified-data mappers (Finnhub) ──────────────────────────────────────────

/** Finnhub /stock/peers returns a flat ticker array. */
export function relationsFromPeers(peers: unknown, selfTicker: string): MoneyRelation[] {
  const list = Array.isArray(peers) ? peers : [];
  const self = selfTicker.toUpperCase();
  const seen = new Set<string>();
  const out: MoneyRelation[] = [];
  for (const p of list) {
    if (typeof p !== "string") continue;
    const t = p.trim().toUpperCase();
    if (!t || t === self || seen.has(t)) continue;
    seen.add(t);
    out.push({
      id: relationId("peer", t, t),
      kind: "peer",
      name: t,
      ticker: t,
      weightPct: null,
      intensity: 0.45, // peers carry no money weight — uniform, thin edges
      direction: "none",
      confidence: "verified",
      source: "finnhub",
      note: "Industry peer",
    });
    if (out.length >= 8) break;
  }
  return out;
}

interface FinnhubHolder {
  name?: unknown;
  share?: unknown;
  change?: unknown;
}

/**
 * Map a Finnhub ownership response ({ ownership: [{ name, share, change }] }) into
 * owner relations. We don't have shares-outstanding here, so intensity is the
 * holder's share count relative to the largest holder, and the absolute count
 * goes in the note. Funds/institutions have no ticker → non-clickable nodes.
 */
export function relationsFromOwnership(raw: unknown, source = "institutional"): MoneyRelation[] {
  const holders = Array.isArray((raw as { ownership?: unknown })?.ownership)
    ? ((raw as { ownership: FinnhubHolder[] }).ownership)
    : [];
  const cleaned = holders
    .map((h) => ({
      name: typeof h.name === "string" ? h.name.trim() : "",
      share: typeof h.share === "number" && Number.isFinite(h.share) ? h.share : null,
    }))
    .filter((h) => h.name.length > 0)
    .slice(0, 8);
  const ints = intensities(cleaned.map((h) => h.share), 0.5);
  const seen = new Set<string>();
  const out: MoneyRelation[] = [];
  cleaned.forEach((h, i) => {
    const id = relationId("owner", null, h.name);
    if (seen.has(id)) return;
    seen.add(id);
    out.push({
      id,
      kind: "owner",
      name: h.name,
      ticker: null,
      weightPct: null,
      intensity: ints[i],
      direction: "in",
      confidence: "verified",
      source: "finnhub",
      note: compactShares(h.share) ?? `${source} holder`,
    });
  });
  return out;
}

// ── AI-estimated mapper (10-K extraction) ────────────────────────────────────

interface RawSupplyEntry {
  name?: unknown;
  ticker?: unknown;
  weightPct?: unknown;
  note?: unknown;
}

/** Pull the first JSON object out of a model response, tolerating code fences. */
export function parseJsonObject(raw: string): Record<string, unknown> | null {
  const fenced = raw.replace(/```(?:json)?/gi, "");
  const match = fenced.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toEntries(v: unknown): RawSupplyEntry[] {
  return Array.isArray(v) ? (v as RawSupplyEntry[]) : [];
}

/**
 * Turn the supply-chain agent's JSON ({ suppliers:[], customers:[] }) into
 * estimated relations, normalized per kind. `model` is the slug for the badge.
 * Ticker resolution happens later (async) in the agent; entries may already
 * carry a `ticker` the model was confident about.
 */
export function parseSupplyChainRelations(raw: string, model?: string): MoneyRelation[] {
  const parsed = parseJsonObject(raw);
  if (!parsed) return [];
  const out: MoneyRelation[] = [];
  for (const kind of ["customer", "supplier"] as const) {
    const key = kind === "customer" ? "customers" : "suppliers";
    const entries = toEntries(parsed[key])
      .map((e) => ({
        name: typeof e.name === "string" ? e.name.trim() : "",
        ticker:
          typeof e.ticker === "string" && /^[A-Z.\-]{1,10}$/i.test(e.ticker.trim())
            ? e.ticker.trim().toUpperCase()
            : null,
        weightPct:
          typeof e.weightPct === "number" && Number.isFinite(e.weightPct)
            ? Math.max(0, Math.min(100, e.weightPct))
            : null,
        note: typeof e.note === "string" ? e.note.trim().slice(0, 120) : undefined,
      }))
      .filter((e) => e.name.length > 0)
      .slice(0, 6);
    const ints = intensities(entries.map((e) => e.weightPct), 0.4);
    const seen = new Set<string>();
    entries.forEach((e, i) => {
      const id = relationId(kind, e.ticker, e.name);
      if (seen.has(id)) return;
      seen.add(id);
      out.push({
        id,
        kind,
        name: e.name,
        ticker: e.ticker,
        weightPct: e.weightPct,
        intensity: ints[i],
        direction: KIND_DIRECTION[kind],
        confidence: "estimated",
        source: "ai-10k",
        note: e.note,
        model,
      });
    });
  }
  return out;
}

// ── Radial layout (the graph geometry) ───────────────────────────────────────

export interface PositionedNode {
  relation: MoneyRelation;
  x: number;
  y: number;
  angle: number; // radians from centre
}

export interface RadialLayout {
  width: number;
  height: number;
  cx: number;
  cy: number;
  centerR: number;
  nodes: PositionedNode[];
}

export interface LayoutOptions {
  width?: number;
  height?: number;
  ring?: number;
  maxPerKind?: number;
}

// Each kind anchors to one compass direction (SVG y grows downward).
const KIND_ANGLE: Record<RelationKind, number> = {
  customer: -Math.PI / 2, // up
  supplier: Math.PI / 2, // down
  owner: Math.PI, // left
  peer: 0, // right
};

/**
 * Position relations around the centre: customers top, suppliers bottom, owners
 * left, peers right. Within a cluster, nodes fan across an arc (strongest first)
 * and alternate radius to reduce label collisions. Capped at `maxPerKind` per
 * cluster for legibility — the flows list shows the full set.
 */
export function layoutRadial(relations: MoneyRelation[], opts: LayoutOptions = {}): RadialLayout {
  const width = opts.width ?? 680;
  const height = opts.height ?? 460;
  const ring = opts.ring ?? 150;
  const maxPerKind = opts.maxPerKind ?? 6;
  const cx = width / 2;
  const cy = height / 2;
  const nodes: PositionedNode[] = [];

  for (const kind of KIND_ORDER) {
    const group = relations
      .filter((r) => r.kind === kind)
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, maxPerKind);
    const base = KIND_ANGLE[kind];
    const m = group.length;
    // Fan width grows with count but is capped so clusters never wrap onto each
    // other (max ~120°).
    const fan = m <= 1 ? 0 : Math.min((Math.PI * 2) / 3, 0.32 * (m - 1));
    group.forEach((r, i) => {
      const t = m === 1 ? 0 : i / (m - 1) - 0.5; // -0.5 .. 0.5
      const angle = base + t * fan;
      const rr = ring + (i % 2 === 0 ? 0 : 24); // stagger alternate nodes outward
      nodes.push({
        relation: r,
        x: cx + rr * Math.cos(angle),
        y: cy + rr * Math.sin(angle),
        angle,
      });
    });
  }

  return { width, height, cx, cy, centerR: 46, nodes };
}

// ── Store reducer (pure) ─────────────────────────────────────────────────────

export type MoneyMapStatus = "idle" | "streaming" | "done" | "error";

export interface MoneyMapEntry {
  status: MoneyMapStatus;
  map: MoneyMap;
  error: string | null;
}

export function emptyMoneyMap(): MoneyMapEntry {
  return { status: "idle", map: { self: null, relations: [] }, error: null };
}

/** Fold one streamed event into the current entry. Dedups relations by id. */
export function applyEvent(entry: MoneyMapEntry, event: MoneyMapEvent): MoneyMapEntry {
  switch (event.type) {
    case "self":
      return { ...entry, status: "streaming", map: { ...entry.map, self: event.self } };
    case "relation": {
      const relations = entry.map.relations
        .filter((r) => r.id !== event.relation.id)
        .concat(event.relation);
      return { ...entry, status: "streaming", map: { ...entry.map, relations } };
    }
    case "done":
      return { ...entry, status: "done" };
    case "error":
      return { ...entry, status: "error", error: event.message };
  }
}
