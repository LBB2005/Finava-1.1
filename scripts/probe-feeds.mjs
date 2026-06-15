// One-off, read-only probe: which Finnhub feeds actually return data on the
// current key? Prints an availability matrix only — never the key itself.
import { readFileSync } from "node:fs";

function loadKey() {
  for (const f of [".env.local", ".env"]) {
    try {
      const m = readFileSync(f, "utf8").match(/^FINNHUB_API_KEY\s*=\s*"?([^"\n\r]+)"?/m);
      if (m) return m[1].trim();
    } catch {}
  }
  throw new Error("No FINNHUB_API_KEY found");
}

const KEY = loadKey();
const BASE = "https://finnhub.io/api/v1";
const TICKERS = ["AAPL", "GOOGL", "MSFT", "NVDA", "PLTR"];

// endpoint label -> path builder + "has data" predicate
const ENDPOINTS = [
  ["recommendation", (t) => `/stock/recommendation?symbol=${t}`, (d) => Array.isArray(d) && d.length > 0],
  ["price-target", (t) => `/stock/price-target?symbol=${t}`, (d) => d && typeof d.targetMean === "number" && d.targetMean > 0],
  ["eps-estimate", (t) => `/stock/eps-estimate?symbol=${t}&freq=quarterly`, (d) => d && Array.isArray(d.data) && d.data.length > 0],
  ["revenue-estimate", (t) => `/stock/revenue-estimate?symbol=${t}&freq=quarterly`, (d) => d && Array.isArray(d.data) && d.data.length > 0],
  ["earnings(surprise)", (t) => `/stock/earnings?symbol=${t}&limit=8`, (d) => Array.isArray(d) && d.length > 0],
  ["peers", (t) => `/stock/peers?symbol=${t}`, (d) => Array.isArray(d) && d.length > 0],
  ["metric=all", (t) => `/stock/metric?symbol=${t}&metric=all`, (d) => d && d.metric && Object.keys(d.metric).length > 5],
];

async function hit(path) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${BASE}${path}${sep}token=${KEY}`, { signal: AbortSignal.timeout(10000) });
  return { status: res.status, body: res.status === 200 ? await res.json().catch(() => null) : null };
}

const pad = (s, n) => String(s).padEnd(n);
console.log(pad("endpoint", 20) + TICKERS.map((t) => pad(t, 9)).join("") + "  notes");
console.log("-".repeat(20 + TICKERS.length * 9 + 8));

for (const [label, build, ok] of ENDPOINTS) {
  const cells = [];
  let note = "";
  for (const t of TICKERS) {
    try {
      const { status, body } = await hit(build(t));
      if (status === 200) cells.push(ok(body) ? "DATA" : "empty");
      else { cells.push(String(status)); if (status === 403) note = "premium-gated"; if (status === 429) note = "rate-limited"; }
    } catch {
      cells.push("ERR");
    }
    await new Promise((r) => setTimeout(r, 350)); // stay under 60/min
  }
  console.log(pad(label, 20) + cells.map((c) => pad(c, 9)).join("") + "  " + note);
}
