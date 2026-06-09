import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { db } from "@/lib/firebase-admin";
import { parseMarkovOutput, isMarkovDataValid, type MarkovData } from "@/lib/markov";
import { requireAuth } from "@/lib/requireAuth";
import { requireEntitlement } from "@/lib/entitlements";
import os from "os";
import path from "path";

const execAsync = promisify(exec);

// Tickers are interpolated into a shell command, so they must be strictly validated
// to prevent command injection. Allow letters, digits, dot and hyphen only.
const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

// Cache is considered fresh for 20 hours — nightly cron refreshes it
const CACHE_TTL_MS = 20 * 60 * 60 * 1000;

async function runMarkov(ticker: string, years: number): Promise<MarkovData> {
  const skillDir = process.env.MARKOV_SKILL_PATH
    ?? path.join(os.homedir(), ".claude/skills/markov-hedge-fund-method");
  const uvPath = process.env.UV_PATH
    ?? path.join(os.homedir(), ".local/bin/uv");

  if (!TICKER_RE.test(ticker)) {
    throw new Error(`Invalid ticker symbol: ${ticker}`);
  }
  const safeYears = Number.isFinite(years) && years > 0 && years <= 50 ? Math.floor(years) : 5;

  const { stdout } = await execAsync(
    `"${uvPath}" run python -m markov_hedge_fund_method.run --ticker ${ticker} --years ${safeYears}`,
    { cwd: skillDir, timeout: 120_000 }
  );

  const data = parseMarkovOutput(stdout, ticker, safeYears);
  if (!isMarkovDataValid(data)) {
    throw new Error(`Markov parse failed for ${ticker} — unexpected script output`);
  }
  return data;
}

// GET /api/markov?tickers=SPY,QQQ,DIA&years=5&force=1
export async function GET(request: Request) {
  const { userId, error } = await requireAuth();
  if (error) return error;
  const gate = await requireEntitlement(userId, "quantSuite");
  if (gate) return gate;

  const { searchParams } = new URL(request.url);
  const tickersParam = searchParams.get("tickers") ?? "SPY,QQQ,DIA";
  const years = parseInt(searchParams.get("years") ?? "5");
  const force = searchParams.get("force") === "1";

  const tickers = tickersParam.split(",").map((t) => t.trim().toUpperCase());

  const results: Record<string, MarkovData> = {};
  const errors: Record<string, string> = {};

  await Promise.all(
    tickers.map(async (ticker) => {
      try {
        // Check cache first
        const cacheDocId = `${ticker}_${years}`;
        const cacheRef = db.collection("markovResults").doc(cacheDocId);
        if (!force) {
          const cached = await cacheRef.get();
          if (cached.exists) {
            const cacheData = cached.data()!;
            const createdAt = typeof cacheData.createdAt === "string"
              ? cacheData.createdAt
              : cacheData.createdAt?.toDate?.().toISOString() ?? "";
            const age = Date.now() - new Date(createdAt).getTime();
            if (age < CACHE_TTL_MS) {
              results[ticker] = JSON.parse(cacheData.result) as MarkovData;
              return;
            }
          }
        }

        // Run the Python script
        const data = await runMarkov(ticker, years);

        // Upsert into DB
        const now = new Date().toISOString();
        await cacheRef.set({ ticker, years, result: JSON.stringify(data), createdAt: now });

        results[ticker] = data;
      } catch (err) {
        errors[ticker] = err instanceof Error ? err.message : "Unknown error";
      }
    })
  );

  return NextResponse.json({ results, errors, generatedAt: new Date().toISOString() });
}
