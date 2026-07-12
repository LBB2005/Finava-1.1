import { describe, it, expect, vi, beforeEach } from "vitest";

const generate = vi.fn(async () => "INSIDER ANALYSIS");
vi.mock("@/lib/llm", () => ({ generate: (o: unknown) => generate(o) }));
vi.mock("@/agents/skills", () => ({ getSkillsPrompt: () => "skill prompt" }));

const getInsiderTransactions = vi.fn();
vi.mock("@/lib/finnhub", () => ({ getInsiderTransactions: (...a: unknown[]) => getInsiderTransactions(...a) }));

const searchRecentForm4 = vi.fn();
vi.mock("@/lib/edgar", () => ({ searchRecentForm4: (...a: unknown[]) => searchRecentForm4(...a) }));

const lastPrompt = () => (generate.mock.calls.at(-1)![0] as { prompt: string }).prompt;

beforeEach(() => {
  generate.mockClear().mockResolvedValue("INSIDER ANALYSIS");
  searchRecentForm4.mockReset().mockResolvedValue([]); // no Form 4 filings → no fetch needed
  getInsiderTransactions.mockReset().mockResolvedValue({ data: [] });
});

describe("runInsiderAgent", () => {
  it("reports no qualifying purchases and folds in Finnhub history", async () => {
    getInsiderTransactions.mockResolvedValue({
      data: [
        { name: "Jane CEO", change: 1000, transactionPrice: 50, transactionCode: "P", transactionDate: "2026-05-01", share: 1000 },
        { name: "Bob CFO", change: -500, transactionPrice: 60, transactionCode: "S", transactionDate: "2026-05-02", share: 500 },
      ],
    });
    const { runInsiderAgent } = await import("./insider-agent");
    const out = await runInsiderAgent({ tickers: ["AAPL"] });
    expect(out).toBe("INSIDER ANALYSIS");
    const p = lastPrompt();
    expect(p).toContain("No qualifying insider purchases");
    expect(p).toContain("FINNHUB");
    expect(p).toContain("AAPL");
  });

  it("flags EDGAR as UNAVAILABLE (not empty) when every lookup fails", async () => {
    searchRecentForm4.mockRejectedValue(new Error("SEC unreachable"));
    const { runInsiderAgent } = await import("./insider-agent");
    await runInsiderAgent({ tickers: ["AAPL", "MSFT"] });
    const p = lastPrompt();
    expect(p).toContain("UNAVAILABLE");
    expect(p).toContain("do not treat this as an absence of purchases");
  });

  it("degrades gracefully when Finnhub insider data errors", async () => {
    getInsiderTransactions.mockRejectedValue(new Error("rate limited"));
    const { runInsiderAgent } = await import("./insider-agent");
    await runInsiderAgent({ tickers: ["AAPL"] });
    expect(lastPrompt()).toContain("Could not fetch Finnhub insider data");
    expect(generate).toHaveBeenCalled(); // still synthesizes
  });
});

// ── Form 4 XML parsing (parseForm4Purchases) ─────────────────────────────────
// searchRecentForm4 returns filing stubs; the agent then fetches the EDGAR Atom
// index (browse-edgar) to find the primary XML, fetches that XML, and parses the
// non-derivative transactions. We stub global fetch for both hops.

const FILING = {
  accessionNo: "0000320193-25-000001",
  cik: "320193",
  filedAt: "2026-07-10",
  periodOfReport: "2026-07-09",
  entityName: "Filing Entity",
};

const atomWithXmlLink = `<?xml version="1.0"?><feed>
  <entry><link rel="alternate" type="text/html"
    href="https://www.sec.gov/Archives/edgar/data/320193/000032019325000001/form4.xml"/></entry>
</feed>`;

/** A Form 4 XML with one non-derivative transaction. */
function form4Xml(opts: {
  code: string;          // transactionCode (P=purchase, S=sale)
  acquired: string;      // A=acquired, D=disposed
  shares: string;
  price: string;
  ownedAfter: string;
  title?: string;
  name?: string;
}) {
  return `<ownershipDocument>
    <reportingOwner><rptOwnerName>${opts.name ?? "Jane Insider"}</rptOwnerName></reportingOwner>
    ${opts.title ? `<reportingOwnerRelationship><officerTitle>${opts.title}</officerTitle></reportingOwnerRelationship>` : ""}
    <nonDerivativeTable>
      <nonDerivativeTransaction>
        <transactionCoding><transactionCode>${opts.code}</transactionCode></transactionCoding>
        <transactionAmounts>
          <transactionShares><value>${opts.shares}</value></transactionShares>
          <transactionPricePerShare><value>${opts.price}</value></transactionPricePerShare>
          <transactionAcquiredDisposedCode><value>${opts.acquired}</value></transactionAcquiredDisposedCode>
        </transactionAmounts>
        <postTransactionAmounts>
          <sharesOwnedFollowingTransaction><value>${opts.ownedAfter}</value></sharesOwnedFollowingTransaction>
        </postTransactionAmounts>
      </nonDerivativeTransaction>
    </nonDerivativeTable>
  </ownershipDocument>`;
}

/** Stub global fetch: Atom index first, then the Form 4 XML body. */
function stubEdgarFetch(atom: string | { status: number }, xml: string | { status: number }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("browse-edgar")) {
        if (typeof atom !== "string") return new Response("err", { status: atom.status });
        return new Response(atom);
      }
      // The XML document hop.
      if (typeof xml !== "string") return new Response("err", { status: xml.status });
      return new Response(xml);
    }),
  );
}

describe("runInsiderAgent — Form 4 purchase parsing", () => {
  beforeEach(() => {
    searchRecentForm4.mockResolvedValue([FILING]);
    getInsiderTransactions.mockResolvedValue({ data: [] });
  });

  it("surfaces a qualifying >$100K purchase as a NEW POSITION with formatted value", async () => {
    // 5,000 @ $50 = $250K; owned-after == shares bought → treated as a new position.
    stubEdgarFetch(
      atomWithXmlLink,
      form4Xml({ code: "P", acquired: "A", shares: "5000", price: "50.00", ownedAfter: "5000", title: "Chief Executive Officer" }),
    );
    const { runInsiderAgent } = await import("./insider-agent");
    await runInsiderAgent({ tickers: ["AAPL"] });
    const p = lastPrompt();
    expect(p).toContain("Purchases >$100K");
    expect(p).toContain("Jane Insider (Chief Executive Officer)");
    expect(p).toContain("BOUGHT 5,000 shares @ $50.00 = $250,000");
    expect(p).toContain("[NEW POSITION]");
  });

  it("marks a top-up buy as an ADDITION and formats million-dollar values", async () => {
    // 30,000 @ $60 = $1.8M into a 200,000-share stake → an addition, not new.
    stubEdgarFetch(
      atomWithXmlLink,
      form4Xml({ code: "P", acquired: "A", shares: "30000", price: "60.00", ownedAfter: "200000" }),
    );
    const { runInsiderAgent } = await import("./insider-agent");
    await runInsiderAgent({ tickers: ["AAPL"] });
    const p = lastPrompt();
    expect(p).toContain("= $1.80M");
    expect(p).toContain("[ADDITION]");
  });

  it("filters out sub-$100K purchases", async () => {
    // 100 @ $10 = $1,000 — below the threshold.
    stubEdgarFetch(
      atomWithXmlLink,
      form4Xml({ code: "P", acquired: "A", shares: "100", price: "10.00", ownedAfter: "100" }),
    );
    const { runInsiderAgent } = await import("./insider-agent");
    await runInsiderAgent({ tickers: ["AAPL"] });
    expect(lastPrompt()).toContain("No qualifying insider purchases");
  });

  it("filters out disposals/sales", async () => {
    // A large sale (code S, disposed D) must never show up as a purchase.
    stubEdgarFetch(
      atomWithXmlLink,
      form4Xml({ code: "S", acquired: "D", shares: "5000", price: "50.00", ownedAfter: "0" }),
    );
    const { runInsiderAgent } = await import("./insider-agent");
    await runInsiderAgent({ tickers: ["AAPL"] });
    expect(lastPrompt()).toContain("No qualifying insider purchases");
  });

  it("returns no purchases when the Atom index has no XML link", async () => {
    stubEdgarFetch("<feed>no links here</feed>", "unused");
    const { runInsiderAgent } = await import("./insider-agent");
    await runInsiderAgent({ tickers: ["AAPL"] });
    expect(lastPrompt()).toContain("No qualifying insider purchases");
  });

  it("returns no purchases when the index lookup returns an HTTP error", async () => {
    stubEdgarFetch({ status: 503 }, "unused");
    const { runInsiderAgent } = await import("./insider-agent");
    await runInsiderAgent({ tickers: ["AAPL"] });
    // A failed index hop is swallowed inside parseForm4Purchases (returns []),
    // which is distinct from searchRecentForm4 failing (→ "UNAVAILABLE").
    expect(lastPrompt()).toContain("No qualifying insider purchases");
    expect(lastPrompt()).not.toContain("UNAVAILABLE");
  });

  it("returns no purchases when the XML document fetch fails", async () => {
    stubEdgarFetch(atomWithXmlLink, { status: 500 });
    const { runInsiderAgent } = await import("./insider-agent");
    await runInsiderAgent({ tickers: ["AAPL"] });
    expect(lastPrompt()).toContain("No qualifying insider purchases");
  });
});
