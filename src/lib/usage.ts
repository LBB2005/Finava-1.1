/**
 * Per-user AI usage metering.
 *
 * Every model call is converted from raw tokens → a normalized, cost-weighted
 * "credit" (so a heavy Claude chat counts more than a cheap Gemini screen), then
 * accumulated into a single Firestore doc per user (`userUsage/{userId}`). The
 * doc holds a date→credits map; daily and weekly figures are derived from it.
 *
 * Two things plug into this:
 *   - recordUsage(): called from the LLM choke-point (`generate()`) and the
 *     direct-Anthropic streaming paths to ADD usage. It reads the current userId
 *     from an AsyncLocalStorage store, so the ~27 `generate()` call-sites don't
 *     need a userId threaded through them — each AI route wraps its handler body
 *     in `usageStore.run({ userId }, …)`.
 *   - checkUsageLimit(): called at the top of each AI route to ENFORCE the plan
 *     allowance (hard cap) before any model spend happens.
 *
 * NOTE: MODEL_PRICING, CREDIT_USD and PLAN_LIMITS are product/billing constants.
 * The numbers below are reasonable placeholders — TUNE them before shipping.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import * as admin from "firebase-admin";
import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";

// ── Request-scoped user context ──────────────────────────────────────────────
// recordUsage() reads userId from here when the caller doesn't pass one.
export const usageStore = new AsyncLocalStorage<{ userId: string }>();

/** Run `fn` with `userId` available to any recordUsage() call inside it. */
export function withUsageContext<T>(userId: string, fn: () => T): T {
  return usageStore.run({ userId }, fn);
}

// ── Pricing ──────────────────────────────────────────────────────────────────
// USD per 1M tokens. Keyed by BOTH the OpenRouter slugs `generate()` uses and the
// direct Anthropic model ids the streaming chat/CEO paths use. TUNE to live rates.
interface Price {
  in: number;
  out: number;
}
const MODEL_PRICING: Record<string, Price> = {
  // OpenRouter slugs (src/lib/llm.ts)
  "anthropic/claude-sonnet-4.6": { in: 3, out: 15 },
  "anthropic/claude-haiku-4.5": { in: 1, out: 5 },
  "google/gemini-2.5-flash": { in: 0.3, out: 2.5 },
  "google/gemini-2.5-flash-lite": { in: 0.1, out: 0.4 },
  // Direct Anthropic ids (src/lib/anthropic.ts)
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5-20251001": { in: 1, out: 5 },
};
// Fallback for an unrecognized model — assume the most expensive tier so we never
// under-charge a user's allowance for a model we forgot to price.
const FALLBACK_PRICE: Price = { in: 3, out: 15 };

// 1 credit = a tenth of a cent of model spend. Keeps the displayed numbers
// readable (a ~2k-in / 1k-out Sonnet chat ≈ 21 credits).
export const CREDIT_USD = 0.001;
// Cached input tokens (Anthropic prompt cache) are ~10% the price of fresh input.
const CACHE_READ_MULTIPLIER = 0.1;

function priceFor(model: string): Price {
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  // Tolerate slug/id drift (e.g. an "anthropic/" prefix or a date suffix).
  const stripped = model.replace(/^anthropic\//, "");
  for (const key of Object.keys(MODEL_PRICING)) {
    if (key.replace(/^anthropic\//, "") === stripped) return MODEL_PRICING[key];
  }
  console.warn(`[usage] no price for model "${model}" — using fallback`);
  return FALLBACK_PRICE;
}

/** Convert a single call's token counts into cost-weighted credits. */
export function creditsFor(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0
): number {
  const p = priceFor(model);
  const freshInput = Math.max(0, inputTokens - cacheReadTokens);
  const usd =
    (freshInput * p.in +
      cacheReadTokens * p.in * CACHE_READ_MULTIPLIER +
      outputTokens * p.out) /
    1_000_000;
  return Math.round((usd / CREDIT_USD) * 100) / 100;
}

// ── Plan allowances (in credits) ─────────────────────────────────────────────
// Hard caps: a request is blocked when EITHER the daily or weekly figure is
// already at/over the limit. TUNE these to real product tiers.
export type PlanName = "Free" | "Pro";
interface Limits {
  daily: number;
  weekly: number;
}
export const PLAN_LIMITS: Record<PlanName, Limits> = {
  Free: { daily: 150, weekly: 500 },
  Pro: { daily: 1200, weekly: 5000 },
};
function limitsForPlan(plan: string | undefined): Limits {
  return PLAN_LIMITS[(plan as PlanName) ?? "Pro"] ?? PLAN_LIMITS.Pro;
}

// ── Date helpers (UTC day buckets) ───────────────────────────────────────────
const MS_PER_DAY = 86_400_000;
/** UTC date key, e.g. "2026-06-09". */
function dayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}
function sumLastNDays(days: Record<string, number>, n: number): number {
  const now = Date.now();
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += days[dayKey(new Date(now - i * MS_PER_DAY))] ?? 0;
  }
  return Math.round(sum * 100) / 100;
}

interface UsageDoc {
  days?: Record<string, number>;
  totalCredits?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  updatedAt?: string;
}

// ── Recording ────────────────────────────────────────────────────────────────
export interface RecordUsageInput {
  /** Routable agent name, for debugging/logging only. */
  agent?: string;
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  /** Anthropic cache_read_input_tokens, if any (billed at a fraction of input). */
  cacheRead?: number | null;
  /** Explicit userId; falls back to the AsyncLocalStorage store when omitted. */
  userId?: string;
}

/**
 * Add one model call's usage to the user's running totals. Fire-and-forget: it
 * returns the Firestore write promise (so a caller may await the big captures),
 * but it never throws — a metering failure must never break a user's request.
 * No-ops when there is no userId in scope (e.g. unauthenticated/cron calls).
 */
export function recordUsage(input: RecordUsageInput): Promise<void> {
  const userId = input.userId ?? usageStore.getStore()?.userId;
  if (!userId) return Promise.resolve();

  const inputTokens = input.inputTokens ?? 0;
  const outputTokens = input.outputTokens ?? 0;
  const cacheRead = input.cacheRead ?? 0;
  if (inputTokens <= 0 && outputTokens <= 0) return Promise.resolve();

  const credits = creditsFor(input.model, inputTokens, outputTokens, cacheRead);
  const key = dayKey();
  const inc = admin.firestore.FieldValue.increment;

  return db
    .collection("userUsage")
    .doc(userId)
    .set(
      {
        days: { [key]: inc(credits) },
        totalCredits: inc(credits),
        totalInputTokens: inc(inputTokens),
        totalOutputTokens: inc(outputTokens),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    )
    .then(() => undefined)
    .catch((e) => {
      console.error("[usage] record failed:", e);
    });
}

// ── Enforcement ──────────────────────────────────────────────────────────────
/**
 * Hard cap. Returns a 429 NextResponse when the user is already at/over their
 * daily or weekly allowance, or null when they're clear to proceed. Call this
 * right after requireAuth() in every route that initiates model spend.
 */
export async function checkUsageLimit(
  userId: string
): Promise<NextResponse | null> {
  let plan = "Pro";
  let days: Record<string, number> = {};
  try {
    const [usageSnap, settingsSnap] = await Promise.all([
      db.collection("userUsage").doc(userId).get(),
      db.collection("userSettings").doc(userId).get(),
    ]);
    plan = (settingsSnap.data()?.plan as string) ?? "Pro";
    days = ((usageSnap.data() as UsageDoc | undefined)?.days ?? {}) as Record<
      string,
      number
    >;
  } catch (e) {
    // Fail OPEN: a Firestore read error must not lock users out of the product.
    console.error("[usage] limit check failed (allowing request):", e);
    return null;
  }

  const limits = limitsForPlan(plan);
  const today = days[dayKey()] ?? 0;
  const week = sumLastNDays(days, 7);

  const over =
    today >= limits.daily
      ? { scope: "daily" as const, limit: limits.daily, used: today }
      : week >= limits.weekly
      ? { scope: "weekly" as const, limit: limits.weekly, used: week }
      : null;
  if (!over) return null;

  return NextResponse.json(
    {
      error: "limit_reached",
      scope: over.scope,
      used: over.used,
      limit: over.limit,
      plan,
      resetsAt: over.scope === "daily" ? nextUtcMidnight() : "rolling",
    },
    { status: 429 }
  );
}

function nextUtcMidnight(): string {
  const d = new Date();
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
  ).toISOString();
}

// ── Summary for the UI ───────────────────────────────────────────────────────
export interface UsageSummary {
  plan: string;
  daily: { used: number; limit: number; pct: number };
  weekly: { used: number; limit: number; pct: number };
  /** Last 30 UTC days, ascending — drives the sparkline + Settings chart. */
  series: { date: string; credits: number }[];
  resets: { daily: string; weekly: string };
}

function pct(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

export async function getUsageSummary(userId: string): Promise<UsageSummary> {
  const [usageSnap, settingsSnap] = await Promise.all([
    db.collection("userUsage").doc(userId).get(),
    db.collection("userSettings").doc(userId).get(),
  ]);
  const plan = (settingsSnap.data()?.plan as string) ?? "Pro";
  const data = usageSnap.data() as UsageDoc | undefined;
  const days = (data?.days ?? {}) as Record<string, number>;
  const limits = limitsForPlan(plan);

  const today = Math.round((days[dayKey()] ?? 0) * 100) / 100;
  const week = sumLastNDays(days, 7);

  const now = Date.now();
  const series: { date: string; credits: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const key = dayKey(new Date(now - i * MS_PER_DAY));
    series.push({ date: key, credits: Math.round((days[key] ?? 0) * 100) / 100 });
  }

  // Best-effort prune: drop day-buckets older than 35 days so the doc stays small.
  void pruneOldDays(userId, days, now);

  return {
    plan,
    daily: { used: today, limit: limits.daily, pct: pct(today, limits.daily) },
    weekly: { used: week, limit: limits.weekly, pct: pct(week, limits.weekly) },
    series,
    resets: { daily: nextUtcMidnight(), weekly: "rolling" },
  };
}

function pruneOldDays(
  userId: string,
  days: Record<string, number>,
  now: number
): Promise<void> {
  const cutoff = dayKey(new Date(now - 35 * MS_PER_DAY));
  const stale = Object.keys(days).filter((k) => k < cutoff);
  if (stale.length === 0) return Promise.resolve();
  const del = admin.firestore.FieldValue.delete();
  const patch: Record<string, unknown> = {};
  for (const k of stale) patch[`days.${k}`] = del;
  return db
    .collection("userUsage")
    .doc(userId)
    .update(patch)
    .then(() => undefined)
    .catch((e) => console.error("[usage] prune failed:", e));
}
