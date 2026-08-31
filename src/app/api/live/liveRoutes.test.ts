// Guard tests for every /api/live/* route.
//
// These routes are reachable from the public internet and one of them places
// orders, so the three properties tested here — refuse when unconfigured, refuse
// a bad secret, refuse work out of order — matter more than their happy paths.
// The happy paths need the whole crew; the guards must hold with nothing running.

import { describe, it, expect, beforeEach, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, Record<string, unknown>>());

function mergeDoc(prior: Record<string, unknown> | undefined, next: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...(prior ?? {}) };
  for (const [k, v] of Object.entries(next)) {
    const e = out[k];
    out[k] =
      v && typeof v === "object" && !Array.isArray(v) && e && typeof e === "object" && !Array.isArray(e)
        ? mergeDoc(e as Record<string, unknown>, v as Record<string, unknown>)
        : v;
  }
  return out;
}

vi.mock("@/lib/firebase-admin", () => {
  const query = (col: string) => ({
    where: () => query(col),
    orderBy: () => query(col),
    limit: () => query(col),
    get: async () => ({ empty: true, size: 0, docs: [] }),
    doc: (id: string) => ({
      path: `${col}/${id}`,
      get: async () => ({ exists: store.has(`${col}/${id}`), data: () => store.get(`${col}/${id}`) }),
      set: async (d: Record<string, unknown>) =>
        void store.set(`${col}/${id}`, mergeDoc(store.get(`${col}/${id}`), d)),
    }),
  });
  return {
    db: {
      collection: query,
      runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          get: async (r: { path: string }) => ({
            exists: store.has(r.path),
            data: () => store.get(r.path),
          }),
          set: (r: { path: string }, d: Record<string, unknown>) =>
            void store.set(r.path, mergeDoc(store.get(r.path), d)),
          create: (r: { path: string }, d: Record<string, unknown>) => void store.set(r.path, d),
        }),
    },
  };
});

vi.mock("@/lib/requireAdmin", () => ({
  requireAdmin: async () => ({ error: new Response("forbidden", { status: 403 }) }),
}));

// The crew never runs in these tests — a guard that only holds when the agents
// are importable is not a guard.
vi.mock("@/agents/ceo", () => ({ runCeoAgent: vi.fn(), agentDispatch: {}, agentTimeoutMs: () => 1, withTimeout: vi.fn(), critiqueAndRevise: vi.fn() }));
vi.mock("@/agents/discovery", () => ({ runDiscoveryWave: vi.fn(), runDiscoverySynthesis: vi.fn() }));
vi.mock("@/agents/sub-agents/scout-agent", () => ({ runScoutAgent: vi.fn() }));
vi.mock("@/lib/factorUniverse", () => ({ getFactorUniverse: vi.fn(async () => ({ stocks: [] })) }));
vi.mock("@/lib/alpacaTrading", async () => {
  const actual = await vi.importActual<typeof import("@/lib/alpacaTrading")>("@/lib/alpacaTrading");
  return { ...actual, alpacaTradingConfigured: () => alpacaOk.value };
});
const alpacaOk = vi.hoisted(() => ({ value: true }));

import { POST as sessionOpen } from "./session/open/route";
import { POST as reconcile } from "./reconcile/route";
import { POST as scout } from "./discover/scout/route";
import { POST as wave } from "./discover/wave/route";
import { POST as synthesize } from "./discover/synthesize/route";
import { POST as debate } from "./debate/route";
import { POST as decide } from "./decide/route";
import { GET as exportRun } from "./run/[runId]/export/route";

const SECRET = "harness-secret-value-1234";

const ROUTES: [string, (req: Request) => Promise<Response>, string, unknown][] = [
  ["session/open", sessionOpen, "https://f.ai/api/live/session/open", {}],
  ["reconcile", reconcile, "https://f.ai/api/live/reconcile", {}],
  ["discover/scout", scout, "https://f.ai/api/live/discover/scout", {}],
  ["discover/wave", wave, "https://f.ai/api/live/discover/wave", { waveIndex: 0 }],
  ["discover/synthesize", synthesize, "https://f.ai/api/live/discover/synthesize", {}],
  ["debate", debate, "https://f.ai/api/live/debate", { ticker: "NVDA", mode: "entry" }],
  ["decide", decide, "https://f.ai/api/live/decide", {}],
  ["run/export", exportRun, "https://f.ai/api/live/run/2026-09-08/export", undefined],
];

function call(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  store.clear();
  process.env.LIVE_HARNESS_SECRET = SECRET;
  process.env.LIVE_DAILY_CREDIT_CAP = "10000";
  alpacaOk.value = true;
});

describe.each(ROUTES)("%s", (_name, handler, url, body) => {
  it("503s when Finava Live is not configured on this deployment", async () => {
    delete process.env.LIVE_HARNESS_SECRET;
    const res = await handler(call(url, body, { "x-live-secret": SECRET }));
    expect(res.status).toBe(503);
  });

  it("401s without credentials", async () => {
    expect((await handler(call(url, body))).status).toBe(401);
  });

  it("401s on a wrong secret", async () => {
    const res = await handler(call(url, body, { "x-live-secret": "wrong-secret-value-1234" }));
    expect(res.status).toBe(401);
  });
});

const auth = { "x-live-secret": SECRET };

describe("ordering guards", () => {
  it("refuses a wave before the scout has run", async () => {
    const res = await wave(call("https://f.ai/api/live/discover/wave", { waveIndex: 0 }, auth));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("out_of_order");
  });

  it("refuses synthesis before the scout has run", async () => {
    const res = await synthesize(call("https://f.ai/api/live/discover/synthesize", {}, auth));
    expect(res.status).toBe(409);
  });

  it("refuses to decide before reconciling", async () => {
    const res = await decide(call("https://f.ai/api/live/decide", {}, auth));
    expect(res.status).toBe(409);
  });

  it("404s an export for a run that never happened", async () => {
    const res = await exportRun(call("https://f.ai/api/live/run/2026-09-08/export", undefined, auth));
    expect(res.status).toBe(404);
  });

  it("rejects an export runId that is not a trading day", async () => {
    const res = await exportRun(call("https://f.ai/api/live/run/latest/export", undefined, auth));
    expect(res.status).toBe(400);
  });
});

describe("validation", () => {
  it("rejects a negative waveIndex", async () => {
    const res = await wave(call("https://f.ai/api/live/discover/wave", { waveIndex: -1 }, auth));
    expect(res.status).toBe(400);
  });

  it("rejects a debate with no ticker", async () => {
    const res = await debate(call("https://f.ai/api/live/debate", { mode: "entry" }, auth));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown debate mode", async () => {
    const res = await debate(
      call("https://f.ai/api/live/debate", { ticker: "NVDA", mode: "guess" }, auth)
    );
    expect(res.status).toBe(400);
  });
});

describe("broker configuration", () => {
  it("503s the session when Alpaca is not on the paper sandbox", async () => {
    // The paper guard is the reason this deployment cannot place a real order,
    // so an unconfigured broker must stop the run rather than degrade quietly.
    alpacaOk.value = false;
    const res = await sessionOpen(call("https://f.ai/api/live/session/open", {}, auth));
    expect(res.status).toBe(503);
  });

  it("503s reconcile too", async () => {
    alpacaOk.value = false;
    const res = await reconcile(call("https://f.ai/api/live/reconcile", {}, auth));
    expect(res.status).toBe(503);
  });
});
