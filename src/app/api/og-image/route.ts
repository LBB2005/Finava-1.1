// Resolve real article images for the stock News tab.
//
// Finnhub's company-news `url` is a finnhub.io redirect, and its `image` is
// frequently a generic publication logo (every Yahoo item shares one PNG). To
// show an *accurate* per-article thumbnail we follow the redirect to the real
// article and read its OpenGraph image, returning the resolved publisher domain
// too (so the source favicon is correct rather than finnhub.io's).
//
// Implemented on node:http(s) rather than fetch because some publishers (Yahoo
// Finance) send response headers larger than undici's 16 KB cap, which makes the
// global fetch throw UND_ERR_HEADERS_OVERFLOW. The low-level client lets us raise
// maxHeaderSize. Redirects are followed manually so every hop is screened against
// an SSRF allowlist, and results are memoised so the scrape happens once per URL.
import { NextRequest, NextResponse } from "next/server";
import http from "node:http";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { rateLimitGuard } from "@/lib/rateLimit";

export const runtime = "nodejs";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const MAX_URLS = 10;
const MAX_HOPS = 5;
const PER_FETCH_TIMEOUT = 4500;
const HEAD_BYTE_CAP = 260_000;
const MAX_HEADER_SIZE = 262_144; // 256 KB — Yahoo's headers overflow the 16 KB default
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // hold a resolved image for a day
const MISS_TTL_MS = 15 * 60 * 1000; // a miss may be transient (rate limit) — retry sooner
const MAX_CACHE_ENTRIES = 1000;

interface OgResult {
  image: string | null;
  domain: string | null;
}

// Module-level memo so repeated views don't re-scrape the same articles.
const cache = new Map<string, { result: OgResult; expires: number }>();

// Reject non-http(s) schemes and obviously-internal hostnames up front. This is
// only the first gate — the authoritative SSRF check is hostIsPublic() below,
// which resolves DNS and validates the *resolved* IP (defeating a public name
// that points at a private/loopback/metadata address).
function safeUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return null;
  return u;
}

// True when `ip` falls in a private, loopback, link-local, CGNAT, or otherwise
// non-public range. Covers IPv4, IPv6, and IPv4-mapped IPv6 (::ffff:a.b.c.d).
function isPrivateIp(ip: string): boolean {
  const addr = ip.toLowerCase();
  // IPv4-mapped IPv6 — unwrap and test the embedded v4 address.
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIp(mapped[1]);

  if (addr.includes(":")) {
    // IPv6: loopback, unspecified, unique-local (fc00::/7), link-local (fe80::/10).
    if (addr === "::1" || addr === "::") return true;
    if (/^f[cd]/.test(addr)) return true; // fc00::/7
    if (/^fe[89ab]/.test(addr)) return true; // fe80::/10
    return false;
  }

  const parts = addr.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // unparseable → treat as unsafe
  }
  const [a, b] = parts;
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10.0.0.0/8
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local / cloud metadata (169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 100 && b >= 64 && b <= 127) // 100.64.0.0/10 CGNAT
  );
}

// Resolve the hostname and confirm EVERY address it maps to is public. Rejecting
// when any resolved address is private blocks DNS-rebinding-style SSRF where an
// attacker-controlled name resolves to an internal/metadata IP.
async function hostIsPublic(hostname: string): Promise<boolean> {
  try {
    const results = await lookup(hostname, { all: true });
    if (results.length === 0) return false;
    return results.every((r) => !isPrivateIp(r.address));
  } catch {
    return false; // unresolvable → refuse
  }
}

function hostLabel(u: URL): string {
  return u.hostname.replace(/^www\./, "");
}

function extractOg(html: string, base: URL): string | null {
  const meta: Record<string, string> = {};
  for (const tag of html.match(/<meta[^>]+>/gi) ?? []) {
    const key = tag.match(/(?:property|name)=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
    if (key && content && !(key in meta)) meta[key] = content;
  }
  const raw =
    meta["og:image:secure_url"] ||
    meta["og:image:url"] ||
    meta["og:image"] ||
    meta["twitter:image"] ||
    meta["twitter:image:src"] ||
    null;
  if (!raw) return null;
  try {
    const abs = new URL(raw.trim(), base).href; // resolve protocol-relative / relative paths
    return /^https?:\/\//i.test(abs) ? abs : null;
  } catch {
    return null;
  }
}

// One GET. Redirects return their Location without a body; HTML pages return the
// <head> region only (capped). Never rejects on a slow/broken body — resolves
// with whatever was read so a partial head can still yield og:image.
function getOnce(u: URL): Promise<{ status: number; location: string | null; body: string }> {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === "https:" ? https : http;
    let settled = false;
    const done = (v: { status: number; location: string | null; body: string }) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const req = lib.get(
      u,
      {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,*/*",
          "Accept-Language": "en-US,en;q=0.9",
        },
        maxHeaderSize: MAX_HEADER_SIZE,
        timeout: PER_FETCH_TIMEOUT,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = typeof res.headers.location === "string" ? res.headers.location : null;
        if (status >= 300 && status < 400 && location) {
          res.resume();
          done({ status, location, body: "" });
          return;
        }
        const ct = String(res.headers["content-type"] ?? "");
        if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
          res.resume();
          done({ status, location: null, body: "" });
          return;
        }
        let body = "";
        let received = 0;
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          received += Buffer.byteLength(chunk);
          body += chunk;
          if (received >= HEAD_BYTE_CAP || body.includes("</head>")) res.destroy();
        });
        res.on("end", () => done({ status, location: null, body }));
        res.on("close", () => done({ status, location: null, body }));
        res.on("error", () => done({ status, location: null, body }));
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

async function resolveUncached(startUrl: string): Promise<OgResult> {
  let current = startUrl;
  let lastDomain: string | null = null;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const u = safeUrl(current);
    if (!u) return { image: null, domain: lastDomain };
    lastDomain = hostLabel(u);
    // Authoritative SSRF gate: resolve and reject if the host maps to any
    // private/loopback/metadata IP. Re-checked on every redirect hop.
    if (!(await hostIsPublic(u.hostname))) return { image: null, domain: lastDomain };
    let r: { status: number; location: string | null; body: string };
    try {
      r = await getOnce(u);
    } catch {
      return { image: null, domain: lastDomain };
    }
    if (r.status >= 300 && r.status < 400 && r.location) {
      try {
        current = new URL(r.location, u).href;
      } catch {
        return { image: null, domain: lastDomain };
      }
      continue;
    }
    if (r.status < 200 || r.status >= 300 || !r.body) return { image: null, domain: lastDomain };
    return { image: extractOg(r.body, u), domain: lastDomain };
  }
  return { image: null, domain: lastDomain };
}

async function resolve(startUrl: string): Promise<OgResult> {
  const hit = cache.get(startUrl);
  const now = Date.now();
  if (hit && hit.expires > now) return hit.result;
  const result = await resolveUncached(startUrl);
  if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!); // evict oldest
  cache.set(startUrl, { result, expires: now + (result.image ? CACHE_TTL_MS : MISS_TTL_MS) });
  return result;
}

export async function POST(req: NextRequest) {
  // Server-side fetch primitive — throttle per client so it can't be used as a
  // high-volume scanning/SSRF probe even within the resolved-IP allowlist.
  const limited = await rateLimitGuard(req, "og-image", { capacity: 20, refillPerSec: 1 });
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const urls: string[] = Array.isArray(body?.urls)
    ? body.urls.filter((u: unknown): u is string => typeof u === "string").slice(0, MAX_URLS)
    : [];

  const entries = await Promise.all(urls.map(async (url) => [url, await resolve(url)] as const));

  return NextResponse.json(
    { results: Object.fromEntries(entries) },
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } }
  );
}
