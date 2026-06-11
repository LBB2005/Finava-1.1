/* ============================================================
   Finava · Sentiment — Reddit client + batch scorer
   ------------------------------------------------------------
   Public read access via Reddit's unauthenticated .json endpoints
   (no API key required). For a ticker we search ~10 finance subs,
   keep recent posts that clear an upvote floor, LLM-batch-score each
   post -1/0/+1, then aggregate UPVOTE-WEIGHTED per sub and average
   across subs.

   r/wallstreetbets is kept as a SEPARATE visible sub-score (mania /
   contrarian flavour) in addition to folding into the blended score.

   ⚠️ DEFAULT-OFF. Reddit blocks the public .json API from datacenter
   IPs (403) — including ALL Vercel serverless IPs — so this path
   returns no data in production. It is therefore disabled unless
   REDDIT_ENABLED=1 is set. When off, scoreRedditSentiment returns null
   immediately (no wasted HTTP) and Reddit drops out as an unavailable
   signal (confidence 0); the composite leans on its other four signals.

   To actually get Reddit data, wire a proxy-backed scraper (e.g. Apify
   reddit-scraper) into fetchSubreddit — it returns the same post shape
   this combiner already expects, so only the fetch layer changes.

   Failure-isolated: disabled, blocked, or any upstream error → null.
   ============================================================ */

import { generate } from "@/lib/llm";

// Public, unauthenticated JSON API — append .json to any Reddit path.
const PUBLIC_BASE = "https://www.reddit.com";
// A descriptive User-Agent is required; a generic one invites 429s.
const USER_AGENT = process.env.REDDIT_USER_AGENT || "web:finava-app:1.0 (sentiment)";

// 10 finance subs. The last slot is filled per-ticker (r/{TICKER}) with a fallback.
export const DEFAULT_SUBS = [
  "wallstreetbets",
  "stocks",
  "investing",
  "options",
  "SecurityAnalysis",
  "StockMarket",
  "pennystocks",
  "dividends",
  "ValueInvesting",
] as const;
const TICKER_SUB_FALLBACK = "StocksAndTrading";

const WSB = "wallstreetbets";
const PER_SUB_FETCH = 200; // coverage target per sub (paginated 100 + 100)
const UPVOTE_FLOOR = 3; // skip near-zero-signal posts before paying to score them
const PRIMARY_WINDOW_HOURS = 48;
const FALLBACK_WINDOW_HOURS = 24 * 7;
const MIN_POSTS_FOR_PRIMARY = 50; // below this in 48h, widen to 7 days
const SCORE_BATCH = 50;

interface RedditPost {
  subreddit: string;
  title: string;
  selftext: string;
  score: number; // upvotes
  createdUtc: number; // seconds
  permalink: string;
}

// ── fetch ────────────────────────────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
function mapChildren(json: any): RedditPost[] {
  const children: any[] = json?.data?.children ?? [];
  return children
    .map((c) => c?.data)
    .filter(Boolean)
    .map((d: any) => ({
      subreddit: String(d.subreddit ?? ""),
      title: String(d.title ?? ""),
      selftext: String(d.selftext ?? "").slice(0, 400),
      score: typeof d.score === "number" ? d.score : 0,
      createdUtc: typeof d.created_utc === "number" ? d.created_utc : 0,
      permalink: String(d.permalink ?? ""),
    }));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Search one sub for ticker-relevant posts (paginated up to ~200). */
async function fetchSubreddit(
  sub: string,
  ticker: string,
  windowSec: number,
  nowSec: number
): Promise<RedditPost[]> {
  const out: RedditPost[] = [];
  let after: string | undefined;
  const pages = Math.ceil(PER_SUB_FETCH / 100);
  for (let p = 0; p < pages; p++) {
    const params = new URLSearchParams({
      q: ticker,
      restrict_sr: "true",
      sort: "new",
      limit: "100",
      t: "week",
    });
    if (after) params.set("after", after);
    try {
      const res = await fetch(`${PUBLIC_BASE}/r/${sub}/search.json?${params}`, {
        signal: AbortSignal.timeout(10_000),
        headers: { "User-Agent": USER_AGENT },
      });
      if (!res.ok) break;
      const json = await res.json();
      const posts = mapChildren(json);
      out.push(...posts);
      after = json?.data?.after ?? undefined;
      if (!after || posts.length === 0) break;
    } catch {
      break;
    }
  }
  // Window + upvote floor + defensive ticker-mention filter.
  const upper = ticker.toUpperCase();
  return out.filter(
    (post) =>
      nowSec - post.createdUtc <= windowSec &&
      post.score >= UPVOTE_FLOOR &&
      `${post.title} ${post.selftext}`.toUpperCase().includes(upper)
  );
}

// ── LLM batch scoring ────────────────────────────────────────────────────────
/** Score a batch of posts to -1/0/+1. Returns a map index→score; missing = skip. */
async function scoreBatch(ticker: string, posts: RedditPost[]): Promise<Map<number, number>> {
  const numbered = posts
    .map((p, i) => `${i}. [r/${p.subreddit}] ${p.title} ${p.selftext}`.slice(0, 280))
    .join("\n");
  const out = new Map<number, number>();
  try {
    const raw = await generate({
      agent: "sentiment",
      maxTokens: 900,
      prompt: `Rate each Reddit post's sentiment toward $${ticker} as -1 (bearish), 0 (neutral/unclear), or +1 (bullish). Judge the author's stance on the stock, not general market mood.

Posts:
${numbered}

Respond with ONLY a JSON array, no prose: [{"i": <index>, "s": <-1|0|1>}, ...] covering every index.`,
    });
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      const arr = JSON.parse(match[0]) as { i: number; s: number }[];
      for (const e of arr) {
        if (typeof e?.i === "number" && (e.s === -1 || e.s === 0 || e.s === 1)) {
          out.set(e.i, e.s);
        }
      }
    }
  } catch {
    /* batch failed → those posts go unscored (treated as absent) */
  }
  return out;
}

/** Upvote-weighted mean of scored posts → [-1,+1], plus the count scored. */
function aggregate(posts: RedditPost[], scores: Map<number, number>): { score: number; n: number } {
  let num = 0;
  let den = 0;
  let n = 0;
  posts.forEach((post, i) => {
    const s = scores.get(i);
    if (s === undefined) return;
    const w = Math.max(1, post.score); // upvotes as weight (min 1)
    num += s * w;
    den += w;
    n++;
  });
  return { score: den > 0 ? num / den : 0, n };
}

export interface RedditSentiment {
  /** Blended upvote-weighted score across all subs, [-1,+1]. */
  score: number;
  /** Total posts actually scored (drives the caller's confidence). */
  scoredPosts: number;
  /** Posts fetched after window/upvote filtering, before scoring. */
  candidatePosts: number;
  windowHours: number;
  detail: string;
  /** WSB-only read, kept separate as a mania/contrarian flag. */
  wsb: { score: number; n: number; detail: string } | null;
}

/**
 * Full Reddit sentiment for a ticker. Returns null if Reddit is unavailable
 * (no creds, no token, or zero usable posts) so the caller drops the signal.
 */
export async function scoreRedditSentiment(
  ticker: string,
  companyName?: string
): Promise<RedditSentiment | null> {
  // Default-off: the public JSON API is 403-blocked on datacenter/Vercel
  // IPs. Opt in only when a working (proxy-backed) fetch layer is wired.
  if (process.env.REDDIT_ENABLED !== "1") return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const subs = [...DEFAULT_SUBS, ticker.toUpperCase()]; // 10th = ticker sub attempt

  // First pass: 48h window.
  let windowHours = PRIMARY_WINDOW_HOURS;
  const fetchAll = async (winHours: number) => {
    const winSec = winHours * 3600;
    const perSub = await Promise.all(
      subs.map(async (sub) => {
        let posts = await fetchSubreddit(sub, ticker, winSec, nowSec);
        // 10th slot: if the ticker sub yielded nothing, try the generic fallback.
        if (sub === ticker.toUpperCase() && posts.length === 0) {
          posts = await fetchSubreddit(TICKER_SUB_FALLBACK, ticker, winSec, nowSec);
        }
        return { sub, posts };
      })
    );
    return perSub;
  };

  let perSub = await fetchAll(windowHours);
  let totalCandidates = perSub.reduce((a, p) => a + p.posts.length, 0);
  if (totalCandidates < MIN_POSTS_FOR_PRIMARY) {
    windowHours = FALLBACK_WINDOW_HOURS;
    perSub = await fetchAll(windowHours);
    totalCandidates = perSub.reduce((a, p) => a + p.posts.length, 0);
  }
  if (totalCandidates === 0) return null;

  // Score every sub's posts (batched), aggregate upvote-weighted per sub.
  const subResults = await Promise.all(
    perSub.map(async ({ sub, posts }) => {
      if (posts.length === 0) return { sub, score: 0, n: 0 };
      const scores = new Map<number, number>();
      for (let i = 0; i < posts.length; i += SCORE_BATCH) {
        const batch = posts.slice(i, i + SCORE_BATCH);
        const batchScores = await scoreBatch(companyName ? `${ticker} (${companyName})` : ticker, batch);
        batchScores.forEach((s, idx) => scores.set(i + idx, s));
      }
      const { score, n } = aggregate(posts, scores);
      return { sub, score, n };
    })
  );

  const withData = subResults.filter((r) => r.n > 0);
  const scoredPosts = withData.reduce((a, r) => a + r.n, 0);
  if (scoredPosts === 0) return null;

  // Blend across subs by how many posts each contributed (a quiet sub shouldn't
  // swing the read as hard as an active one).
  let num = 0;
  let den = 0;
  for (const r of withData) {
    num += r.score * r.n;
    den += r.n;
  }
  const blended = den > 0 ? num / den : 0;

  const wsbRes = subResults.find((r) => r.sub === WSB) ?? null;
  const wsb =
    wsbRes && wsbRes.n > 0
      ? {
          score: wsbRes.score,
          n: wsbRes.n,
          detail: `r/wallstreetbets: ${wsbRes.score >= 0 ? "+" : ""}${wsbRes.score.toFixed(
            2
          )} across ${wsbRes.n} posts${
            Math.abs(wsbRes.score) >= 0.6 ? " — EXTREME (possible contrarian signal)" : ""
          }`,
        }
      : null;

  const topSubs = [...withData]
    .sort((a, b) => b.n - a.n)
    .slice(0, 4)
    .map((r) => `r/${r.sub} ${r.score >= 0 ? "+" : ""}${r.score.toFixed(2)} (${r.n})`)
    .join(", ");

  return {
    score: blended,
    scoredPosts,
    candidatePosts: totalCandidates,
    windowHours,
    detail: `${scoredPosts} posts scored across ${withData.length} subs over ${windowHours}h. Top: ${topSubs}.`,
    wsb,
  };
}
