// Tuning harness: POST each ticker to the running dev server's finava-analysis
// route, parse the SSE, and print a compact deterministic-score table. Ignores the
// LLM narrative — we only care about the numbers the engine produced.
// Usage: node scripts/tune-scores.mjs AAPL GOOGL KO JPM NVDA F
const BASE = process.env.FINAVA_BASE || "http://localhost:3001";
const tickers = process.argv.slice(2);
if (!tickers.length) { console.error("pass tickers as args"); process.exit(1); }

const PILLARS = ["fundamentals", "valuation", "analyst", "momentum", "sentiment", "insider"];

async function score(ticker) {
  const res = await fetch(`${BASE}/api/stock/${ticker}/finava-analysis`, {
    method: "POST",
    headers: { Authorization: "Bearer dev-bypass", "Content-Type": "application/json" },
  });
  if (!res.ok) return { ticker, error: `HTTP ${res.status}` };
  const text = await res.text();
  const events = text.split("\n\n").filter((l) => l.startsWith("data:"))
    .map((l) => { try { return JSON.parse(l.slice(5).trim()); } catch { return null; } })
    .filter(Boolean);
  const pillars = {};
  let verdict = null;
  for (const e of events) {
    if (e.type === "signal") pillars[e.signal.key] = e.signal.isNoData ? "—" : e.signal.score;
    if (e.type === "verdict") verdict = e.verdict;
  }
  return { ticker, pillars, verdict };
}

const pad = (s, n) => String(s).padStart(n);
console.log(
  pad("TKR", 6) + pad("SCORE", 7) + pad("CONF", 5) + "  " +
  PILLARS.map((p) => pad(p.slice(0, 4).toUpperCase(), 5)).join("") +
  pad("PRICE", 9) + pad("FAIR", 9) + pad("DCF", 9) + pad("UP%", 8)
);
console.log("-".repeat(96));
for (const t of tickers) {
  try {
    const r = await score(t);
    if (r.error) { console.log(pad(t, 6) + "  " + r.error); continue; }
    const v = r.verdict || {};
    const cmp = v.comparison || {};
    console.log(
      pad(t, 6) + pad(v.score ?? "?", 7) + pad((v.confidence || "?").slice(0, 4), 5) + "  " +
      PILLARS.map((p) => pad(r.pillars[p] ?? "—", 5)).join("") +
      pad(v.fairValue != null ? "" : "n/a", 0) +
      pad(fmtMoney(cmpPrice(v)), 9) + pad(fmtMoney(v.fairValue), 9) +
      pad(fmtMoney(cmp.dcf), 9) + pad(v.upsidePct != null ? v.upsidePct.toFixed(0) + "%" : "n/a", 8)
    );
  } catch (e) {
    console.log(pad(t, 6) + "  ERR " + e.message);
  }
}

function fmtMoney(n) { return typeof n === "number" ? "$" + n.toFixed(0) : "n/a"; }
// price isn't on the verdict directly; derive from fairValue & upsidePct: price = fair/(1+up/100)
function cmpPrice(v) {
  if (v.fairValue != null && v.upsidePct != null) return v.fairValue / (1 + v.upsidePct / 100);
  return null;
}
