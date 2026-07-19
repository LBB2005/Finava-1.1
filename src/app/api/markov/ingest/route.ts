import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { secretMatches } from "@/lib/secretMatches";
import { parseMarkovOutput, isMarkovDataValid } from "@/lib/markov";

export const runtime = "nodejs";

// Same constraint the GET route enforces — keeps cache doc ids well-formed.
const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

// POST /api/markov/ingest
// Body: { ticker: string, years: number, stdout: string }
// Header: x-ingest-secret: <MARKOV_INGEST_SECRET>
//
// The Markov skill is a local Python program that cannot run on Vercel. An
// external scheduled job (GitHub Actions) runs it, captures stdout, and POSTs it
// here so we can parse + warm the Firestore cache the GET route reads from.
export async function POST(request: Request) {
  if (!secretMatches(request.headers.get("x-ingest-secret"), process.env.MARKOV_INGEST_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { ticker?: unknown; years?: unknown; stdout?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ticker = typeof body.ticker === "string" ? body.ticker.toUpperCase() : "";
  const years = Number(body.years);
  const stdout = typeof body.stdout === "string" ? body.stdout : "";

  if (!TICKER_RE.test(ticker)) {
    return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  }
  const safeYears = Number.isFinite(years) && years > 0 && years <= 50 ? Math.floor(years) : 5;
  if (!stdout) {
    return NextResponse.json({ error: "Missing stdout" }, { status: 400 });
  }

  const data = parseMarkovOutput(stdout, ticker, safeYears);
  if (!isMarkovDataValid(data)) {
    // Reject drift/garbage so we never overwrite a good cache with an all-zero
    // matrix that would read as a real (flat) regime signal.
    return NextResponse.json(
      { error: "Parsed output failed validation — not cached" },
      { status: 422 }
    );
  }

  const cacheDocId = `${ticker}_${safeYears}`;
  const now = new Date().toISOString();
  await db.collection("markovResults").doc(cacheDocId).set({
    ticker,
    years: safeYears,
    result: JSON.stringify(data),
    createdAt: now,
  });

  return NextResponse.json({ ok: true, ticker, years: safeYears, cachedAt: now });
}
