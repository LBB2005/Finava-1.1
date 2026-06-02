const EDGAR_BASE = "https://data.sec.gov";
const USER_AGENT = "Lucra App liamblackshawbrown@gmail.com";

async function edgarFetch(url: string) {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10_000),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`EDGAR ${res.status}: ${url}`);
  return res.json();
}

// In-memory CIK cache — loaded once from SEC's static company tickers file
let CIK_CACHE: Record<string, string> | null = null;

async function getCikMap(): Promise<Record<string, string>> {
  if (CIK_CACHE) return CIK_CACHE;
  try {
    const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: 86400 }, // refresh daily
    });
    if (!res.ok) throw new Error(`company_tickers.json ${res.status}`);
    const data = await res.json();
    // { "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." }, ... }
    const map: Record<string, string> = {};
    for (const entry of Object.values(data) as Array<{ cik_str: number; ticker: string }>) {
      map[entry.ticker.toUpperCase()] = String(entry.cik_str).padStart(10, "0");
    }
    CIK_CACHE = map;
    return map;
  } catch (err) {
    console.error("[edgar] Failed to load company tickers:", err);
    return {};
  }
}

// Resolve ticker → zero-padded 10-digit CIK string
export async function getCikByTicker(ticker: string): Promise<string | null> {
  const map = await getCikMap();
  return map[ticker.toUpperCase()] ?? null;
}

// Alias used by some modules
export const lookupCik = getCikByTicker;

export async function getCompanyFacts(cik: string) {
  const padded = cik.toString().padStart(10, "0");
  return edgarFetch(`${EDGAR_BASE}/api/xbrl/companyfacts/CIK${padded}.json`);
}

export async function getRecentFilings(cik: string) {
  const padded = cik.toString().padStart(10, "0");
  return edgarFetch(`${EDGAR_BASE}/submissions/CIK${padded}.json`);
}

// Extract most-recent single value for a GAAP key
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickLatestAnnual(us: any, key: string): number | null {
  const units = us[key]?.units?.USD ?? us[key]?.units?.shares ?? [];
  const annual = units.filter(
    (u: { form: string; frame?: string }) =>
      u.form === "10-K" && (!u.frame || /^CY\d{4}$/.test(u.frame) || u.frame.endsWith("I"))
  );
  return annual.at(-1)?.val ?? null;
}

// Extract key financial metrics from company facts (single period — used by DCF agent)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractFinancialMetrics(facts: any) {
  const us = facts?.facts?.["us-gaap"] ?? {};
  return {
    revenue: pickLatestAnnual(us, "Revenues") ?? pickLatestAnnual(us, "RevenueFromContractWithCustomerExcludingAssessedTax"),
    netIncome: pickLatestAnnual(us, "NetIncomeLoss"),
    totalAssets: pickLatestAnnual(us, "Assets"),
    totalDebt: pickLatestAnnual(us, "LongTermDebt"),
    cash:
      pickLatestAnnual(us, "CashAndCashEquivalentsAtCarryingValue") ??
      pickLatestAnnual(us, "CashCashEquivalentsAndShortTermInvestments"),
    operatingCashFlow: pickLatestAnnual(us, "NetCashProvidedByUsedInOperatingActivities"),
    // Capex is reported as a positive outflow under PaymentsToAcquire…; subtract it
    // from operating cash flow to get free cash flow. Absent for many filers — the
    // DCF route falls back to operating cash flow and flags it as a proxy.
    capex: pickLatestAnnual(us, "PaymentsToAcquirePropertyPlantAndEquipment"),
    sharesOutstanding: pickLatestAnnual(us, "CommonStockSharesOutstanding"),
  };
}

// ── Multi-year time series ─────────────────────────────────────────────────────

export interface YearlyMetric {
  year: number;
  value: number;
}

/**
 * Extract a multi-year annual time series, merging across the provided GAAP
 * concepts. When several `keys` are given, the concept whose data extends to the
 * most recent year is the base, and earlier-ending concepts only back-fill years
 * it doesn't cover. This stitches together issuers that switched tags mid-history
 * (e.g. Apple's `Revenues` → `RevenueFromContractWithCustomerExcludingAssessedTax`)
 * into one continuous series, rather than returning the first — possibly stale — tag.
 * Returns entries deduplicated by fiscal year, sorted ascending.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractAnnualSeries(us: any, ...keys: string[]): YearlyMetric[] {
  const perKey: YearlyMetric[][] = [];
  for (const key of keys) {
    const units = us[key]?.units?.USD ?? us[key]?.units?.shares ?? [];
    // Exclude quarterly-period frames (e.g. "CY2024Q4") — 10-Ks include supplemental
    // quarterly figures under the same form type, which corrupts annual time series.
    // Keep: no frame, pure calendar-year frames ("CY2024"), and instantaneous snapshots ("CY2024Q4I").
    const annual: { end: string; val: number; form: string; filed: string; frame?: string }[] = units.filter(
      (u: { form: string; frame?: string }) =>
        u.form === "10-K" && (!u.frame || /^CY\d{4}$/.test(u.frame) || u.frame.endsWith("I"))
    );
    if (!annual.length) continue;

    // Deduplicate by fiscal year (use end date year), keep latest filing per year
    const byYear = new Map<number, number>();
    for (const entry of annual) {
      const year = new Date(entry.end).getFullYear();
      byYear.set(year, entry.val); // later entries overwrite earlier ones
    }
    perKey.push(Array.from(byYear, ([year, value]) => ({ year, value })));
  }
  if (perKey.length === 0) return [];

  // Freshest-ending concept first, so it wins on overlapping years; others back-fill.
  perKey.sort((a, b) => Math.max(...b.map((d) => d.year)) - Math.max(...a.map((d) => d.year)));
  const merged = new Map<number, number>();
  for (const series of perKey) {
    for (const { year, value } of series) {
      if (!merged.has(year)) merged.set(year, value);
    }
  }
  return Array.from(merged, ([year, value]) => ({ year, value })).sort((a, b) => a.year - b.year);
}

export interface FundamentalTimeSeries {
  revenue: YearlyMetric[];
  netIncome: YearlyMetric[];
  operatingIncome: YearlyMetric[];
  rAndD: YearlyMetric[];
  operatingCashFlow: YearlyMetric[];
  totalDebt: YearlyMetric[];
  cash: YearlyMetric[];
}

/**
 * Extract multi-year fundamental time series from EDGAR XBRL company facts.
 * Trims to the most recent `years` annual data points.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractFundamentalTimeSeries(facts: any, years = 5): FundamentalTimeSeries {
  const us = facts?.facts?.["us-gaap"] ?? {};
  const trim = (arr: YearlyMetric[]) => arr.slice(-years);

  return {
    revenue: trim(extractAnnualSeries(us, "Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax")),
    netIncome: trim(extractAnnualSeries(us, "NetIncomeLoss")),
    operatingIncome: trim(extractAnnualSeries(us, "OperatingIncomeLoss")),
    rAndD: trim(extractAnnualSeries(us, "ResearchAndDevelopmentExpense")),
    operatingCashFlow: trim(extractAnnualSeries(us, "NetCashProvidedByUsedInOperatingActivities")),
    totalDebt: trim(extractAnnualSeries(us, "LongTermDebt", "LongTermDebtNoncurrent")),
    cash: trim(extractAnnualSeries(us, "CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsAndShortTermInvestments")),
  };
}

// ── EDGAR full-text search for Form 4 filings ─────────────────────────────────

export interface Form4Filing {
  entityName: string;
  filedAt: string;
  periodOfReport: string;
  accessionNo: string;
  cik: string;
}

/**
 * Search EDGAR full-text search for recent Form 4 filings mentioning a ticker.
 * Returns up to `limit` results filed within the last `daysBack` days.
 */
export async function searchRecentForm4(ticker: string, daysBack = 3, limit = 10): Promise<Form4Filing[]> {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - daysBack);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const url = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(ticker)}%22&forms=4&startdt=${fmt(from)}&enddt=${fmt(today)}`;

  // Deliberately NOT swallowing fetch errors: an empty array must mean "no
  // filings in the window," not "the lookup failed." The caller relies on a
  // thrown error to tell those apart so it never reports a network failure as
  // "no insider activity."
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`EDGAR FTS ${res.status}`);
  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hits: any[] = data.hits?.hits ?? [];
  return hits.slice(0, limit).map((hit) => {
    const src = hit._source ?? {};
    const names: string[] = Array.isArray(src.display_names) ? src.display_names : [];
    const ciks: string[] = Array.isArray(src.ciks) ? src.ciks : [];
    // For a Form 4, display_names[0]/ciks[0] are the reporting owner (the
    // insider); the issuer is the second entry. Strip the "(CIK …)" suffix
    // EDGAR appends to display names.
    const insiderName = (names[0] ?? "").replace(/\s*\(CIK\s+\d+\)\s*$/i, "").trim();
    return {
      entityName: insiderName,
      filedAt: src.file_date ?? "",
      periodOfReport: src.period_ending ?? "",
      accessionNo: src.adsh ?? (typeof hit._id === "string" ? hit._id.split(":")[0] : ""),
      cik: ciks[0] ?? "",
    };
  });
}
