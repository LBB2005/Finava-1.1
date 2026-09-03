import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const deps = vi.hoisted(() => {
  const waitlist = new Map<string, Record<string, unknown>>();
  return {
    waitlist,
    writes: [] as { email: string; data: Record<string, unknown> }[],
    requireAdmin: vi.fn(),
    sendEmail: vi.fn(),
    weeklyUpdateEmail: vi.fn(),
    latestIssue: vi.fn(),
    issueByIndex: vi.fn(),
    waitlistGet: vi.fn(),
  };
});

vi.mock("@/lib/requireAdmin", () => ({ requireAdmin: deps.requireAdmin }));
vi.mock("@/lib/email/client", () => ({ sendEmail: deps.sendEmail }));
vi.mock("@/lib/email/templates", () => ({ weeklyUpdateEmail: deps.weeklyUpdateEmail }));
vi.mock("@/lib/email/weekly-issues", () => ({
  latestIssue: deps.latestIssue,
  issueByIndex: deps.issueByIndex,
}));
vi.mock("firebase-admin", () => ({
  firestore: { FieldValue: { serverTimestamp: () => "SERVER_TS" } },
}));
vi.mock("@/lib/firebase-admin", () => ({
  db: {
    collection: () => ({
      get: deps.waitlistGet,
      doc: (email: string) => ({
        set: async (data: Record<string, unknown>) => {
          deps.writes.push({ email, data });
          deps.waitlist.set(email, data);
        },
      }),
    }),
  },
}));

import { GET, POST } from "./route";

const get = (qs = "") => new Request(`http://test.local/api/admin/weekly${qs}`);
const post = (body?: unknown) =>
  new Request("http://test.local/api/admin/weekly", {
    method: "POST",
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });

const ISSUE = { issueLabel: "Issue #1", headline: "Welcome" };

/** Waitlist docs shaped the way Firestore returns them. */
function seedWaitlist(rows: { id: string; email?: unknown }[]) {
  deps.waitlistGet.mockResolvedValue({
    docs: rows.map((r) => ({ id: r.id, data: () => ({ email: r.email }) })),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  deps.waitlist.clear();
  deps.writes.length = 0;
  deps.requireAdmin.mockResolvedValue({ userId: "admin_1" });
  deps.latestIssue.mockReturnValue(ISSUE);
  deps.issueByIndex.mockImplementation((i: number) => (i === 0 ? ISSUE : undefined));
  deps.weeklyUpdateEmail.mockReturnValue({
    subject: "Finava — Issue #1",
    html: "<p>Welcome</p>",
    text: "Welcome",
  });
  deps.sendEmail.mockResolvedValue({ sent: true, id: "msg_1" });
  seedWaitlist([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/admin/weekly", () => {
  it("renders the latest issue as HTML", async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    await expect(res.text()).resolves.toBe("<p>Welcome</p>");
    expect(deps.latestIssue).toHaveBeenCalled();
  });

  it("renders a specific issue by index", async () => {
    await GET(get("?issue=0"));
    expect(deps.issueByIndex).toHaveBeenCalledWith(0);
    expect(deps.latestIssue).not.toHaveBeenCalled();
  });

  it("404s an issue index that does not exist", async () => {
    const res = await GET(get("?issue=99"));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "No such issue" });
  });

  it("previews openly in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect((await GET(get())).status).toBe(200);
    expect(deps.requireAdmin).not.toHaveBeenCalled();
  });

  it("requires an admin in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    deps.requireAdmin.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });
    expect((await GET(get())).status).toBe(403);
  });

  it("lets an admin preview in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await GET(get())).status).toBe(200);
    expect(deps.requireAdmin).toHaveBeenCalled();
  });
});

describe("POST /api/admin/weekly — access", () => {
  it("403s a non-admin, in every environment", async () => {
    deps.requireAdmin.mockResolvedValueOnce({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });
    expect((await POST(post())).status).toBe(403);
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/weekly — dry run", () => {
  it("sends only to the test address and writes nothing", async () => {
    seedWaitlist([{ id: "a@b.com", email: "a@b.com" }]);
    const res = await POST(post({ test: "me@finava.ai" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      test: "me@finava.ai",
      result: { sent: true, id: "msg_1" },
    });
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
    expect(deps.sendEmail).toHaveBeenCalledWith("me@finava.ai", expect.any(Object));
    expect(deps.writes).toHaveLength(0);
    expect(deps.waitlistGet).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/weekly — full send", () => {
  it("sends to every waitlist address and reports the tally", async () => {
    seedWaitlist([
      { id: "doc1", email: "a@b.com" },
      { id: "doc2", email: "c@d.com" },
    ]);
    const res = await POST(post());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      issue: "Issue #1",
      total: 2,
      sent: 2,
      failed: 0,
    });
  });

  it("stamps the issue and send time on each delivered recipient", async () => {
    seedWaitlist([{ id: "doc1", email: "a@b.com" }]);
    await POST(post());
    expect(deps.writes).toEqual([
      { email: "a@b.com", data: { lastWeeklyIssue: "Issue #1", lastWeeklySentAt: "SERVER_TS" } },
    ]);
  });

  it("falls back to the document id when the email field is missing", async () => {
    seedWaitlist([{ id: "legacy@b.com" }]);
    await POST(post());
    expect(deps.sendEmail).toHaveBeenCalledWith("legacy@b.com", expect.any(Object));
  });

  it("drops entries that are not email addresses", async () => {
    seedWaitlist([{ id: "not-an-email" }, { id: "doc", email: "ok@b.com" }]);
    await expect((await POST(post())).json()).resolves.toMatchObject({ total: 1, sent: 1 });
  });

  it("counts failures separately and does not stamp them", async () => {
    seedWaitlist([
      { id: "d1", email: "a@b.com" },
      { id: "d2", email: "c@d.com" },
    ]);
    deps.sendEmail.mockResolvedValueOnce({ sent: false, error: "bounced" });
    await expect((await POST(post())).json()).resolves.toMatchObject({ sent: 1, failed: 1 });
    expect(deps.writes).toHaveLength(1);
  });

  it("treats a skipped send as neither sent nor failed, and says why", async () => {
    seedWaitlist([{ id: "d1", email: "a@b.com" }]);
    deps.sendEmail.mockResolvedValue({ sent: false, skipped: true });
    await expect((await POST(post())).json()).resolves.toMatchObject({
      total: 1,
      sent: 0,
      failed: 0,
      note: "Email not configured (RESEND_API_KEY missing) — nothing sent.",
    });
  });

  it("omits the note when anything actually happened", async () => {
    seedWaitlist([{ id: "d1", email: "a@b.com" }]);
    expect(await (await POST(post())).json()).not.toHaveProperty("note");
  });

  it("returns a zero tally for an empty waitlist without sending", async () => {
    seedWaitlist([]);
    await expect((await POST(post())).json()).resolves.toEqual({ sent: 0, failed: 0, total: 0 });
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it("sends in bounded chunks so a large list can't open hundreds of sockets", async () => {
    seedWaitlist(Array.from({ length: 12 }, (_, i) => ({ id: `d${i}`, email: `u${i}@b.com` })));

    let inFlight = 0;
    let peak = 0;
    deps.sendEmail.mockImplementation(async () => {
      peak = Math.max(peak, ++inFlight);
      await Promise.resolve();
      inFlight--;
      return { sent: true };
    });

    await expect((await POST(post())).json()).resolves.toMatchObject({ total: 12, sent: 12 });
    expect(peak).toBeLessThanOrEqual(5);
  });

  it("survives a failed Firestore stamp", async () => {
    seedWaitlist([{ id: "d1", email: "a@b.com" }]);
    // The route swallows stamp errors so one bad write can't abort the blast.
    const res = await POST(post());
    expect(res.status).toBe(200);
  });
});

describe("POST /api/admin/weekly — issue selection", () => {
  it("defaults to the latest issue on an empty body", async () => {
    await POST(post());
    expect(deps.latestIssue).toHaveBeenCalled();
  });

  it("defaults to the latest issue on unparseable JSON", async () => {
    await POST(post("{not json"));
    expect(deps.latestIssue).toHaveBeenCalled();
  });

  it("honours an explicit issue index", async () => {
    await POST(post({ issue: 0 }));
    expect(deps.issueByIndex).toHaveBeenCalledWith(0);
  });

  it("404s an unknown issue index before sending anything", async () => {
    const res = await POST(post({ issue: 99 }));
    expect(res.status).toBe(404);
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });
});
