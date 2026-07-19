import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  investmentsHoldingsGet: vi.fn(),
  itemDocs: [] as Array<{ data: () => Record<string, unknown> }>,
  existingHoldingDocs: [] as Array<{ ref: Record<string, unknown> }>,
  settingsExists: true,
  batchDelete: vi.fn(),
  batchSet: vi.fn(),
  batchCommit: vi.fn(),
  settingsGet: vi.fn(),
  settingsUpdate: vi.fn(),
  settingsSet: vi.fn(),
}));

vi.mock("@/lib/plaid", () => ({
  plaidClient: {
    investmentsHoldingsGet: deps.investmentsHoldingsGet,
  },
}));

vi.mock("@/lib/firebase-admin", () => ({
  db: {
    batch: vi.fn(() => ({
      delete: deps.batchDelete,
      set: deps.batchSet,
      commit: deps.batchCommit,
    })),
    collection: vi.fn((name: string) => {
      if (name !== "users") throw new Error(`unexpected collection ${name}`);
      return {
        doc: vi.fn((userId: string) => ({
          id: userId,
          collection: vi.fn((sub: string) => {
            if (sub === "plaidItems") {
              return {
                get: vi.fn(async () => ({ docs: deps.itemDocs })),
              };
            }
            if (sub === "holdings") {
              return {
                get: vi.fn(async () => ({ docs: deps.existingHoldingDocs })),
                doc: vi.fn((ticker: string) => ({ path: `users/${userId}/holdings/${ticker}` })),
              };
            }
            if (sub === "portfolioSettings") {
              return {
                doc: vi.fn((id: string) => ({
                  path: `users/${userId}/portfolioSettings/${id}`,
                  get: deps.settingsGet,
                  update: deps.settingsUpdate,
                  set: deps.settingsSet,
                })),
              };
            }
            throw new Error(`unexpected subcollection ${sub}`);
          }),
        })),
      };
    }),
  },
}));

import { rebuildHoldings } from "./plaidSync";

function item(accessToken?: string) {
  return { data: () => ({ accessToken }) };
}

function plaidResponse(holdings: unknown[], securities: unknown[]) {
  return Promise.resolve({ data: { holdings, securities } });
}

beforeEach(() => {
  vi.clearAllMocks();
  deps.itemDocs = [item("access_one")];
  deps.existingHoldingDocs = [{ ref: { path: "old/aapl" } }, { ref: { path: "old/msft" } }];
  deps.settingsExists = true;
  deps.settingsGet.mockImplementation(async () => ({ exists: deps.settingsExists }));
  deps.settingsUpdate.mockResolvedValue(undefined);
  deps.settingsSet.mockResolvedValue(undefined);
  deps.batchCommit.mockResolvedValue(undefined);
  deps.investmentsHoldingsGet.mockImplementation(({ access_token }) =>
    plaidResponse(
      [
        {
          security_id: `${access_token}_aapl`,
          quantity: 2,
          cost_basis: 150,
          institution_price: 160,
        },
        {
          security_id: `${access_token}_aapl_2`,
          quantity: 3,
          cost_basis: null,
          institution_price: 170,
        },
        {
          security_id: `${access_token}_cash`,
          quantity: 1,
          institution_value: 2500,
        },
        {
          security_id: `${access_token}_option`,
          quantity: 1,
          institution_price: 1,
        },
        {
          security_id: `${access_token}_missing`,
          quantity: 1,
        },
        {
          security_id: `${access_token}_zero`,
          quantity: 0,
          institution_price: 100,
        },
      ],
      [
        {
          security_id: `${access_token}_aapl`,
          ticker_symbol: " aapl ",
          type: "equity",
          name: "Apple Inc.",
        },
        {
          security_id: `${access_token}_aapl_2`,
          ticker_symbol: "AAPL",
          type: "etf",
          name: "Apple ETF",
        },
        {
          security_id: `${access_token}_cash`,
          type: "cash",
          name: "Cash",
        },
        {
          security_id: `${access_token}_option`,
          ticker_symbol: "AAPL240621C00100000",
          type: "derivative",
          name: "Option",
        },
        {
          security_id: `${access_token}_zero`,
          ticker_symbol: "MSFT",
          type: "equity",
          name: "Microsoft",
        },
      ]
    )
  );
});

describe("rebuildHoldings", () => {
  it("replaces holdings with normalized Plaid positions and updates cash", async () => {
    const summary = await rebuildHoldings("user_123");

    expect(summary).toEqual({ imported: 1, skipped: 3, cash: 2500 });
    expect(deps.investmentsHoldingsGet).toHaveBeenCalledWith({ access_token: "access_one" });
    expect(deps.batchDelete).toHaveBeenCalledTimes(2);
    expect(deps.batchSet).toHaveBeenCalledWith(
      { path: "users/user_123/holdings/AAPL" },
      expect.objectContaining({
        userId: "user_123",
        ticker: "AAPL",
        companyName: "Apple Inc.",
        shares: 5,
        avgCost: 162,
        sector: null,
        source: "plaid",
      })
    );
    expect(deps.batchCommit).toHaveBeenCalledTimes(1);
    expect(deps.settingsUpdate).toHaveBeenCalledWith({
      cashBalance: 2500,
      updatedAt: expect.any(String),
    });
    expect(deps.settingsSet).not.toHaveBeenCalled();
  });

  it("merges the same ticker across multiple linked items", async () => {
    deps.itemDocs = [item("access_one"), item("access_two")];
    deps.investmentsHoldingsGet
      .mockResolvedValueOnce({
        data: {
          holdings: [{ security_id: "one_msft", quantity: 1, cost_basis: 300 }],
          securities: [{ security_id: "one_msft", ticker_symbol: "MSFT", type: "equity", name: "Microsoft" }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          holdings: [{ security_id: "two_msft", quantity: 3, cost_basis: 330 }],
          securities: [{ security_id: "two_msft", ticker_symbol: "MSFT", type: "mutual fund", name: null }],
        },
      });

    const summary = await rebuildHoldings("user_123");

    expect(summary).toEqual({ imported: 1, skipped: 0, cash: null });
    expect(deps.batchSet).toHaveBeenCalledWith(
      { path: "users/user_123/holdings/MSFT" },
      expect.objectContaining({
        ticker: "MSFT",
        companyName: "Microsoft",
        shares: 4,
        avgCost: 322.5,
      })
    );
    expect(deps.settingsUpdate).not.toHaveBeenCalled();
  });

  it("creates portfolio settings when cash exists but no settings document exists", async () => {
    deps.settingsExists = false;

    const summary = await rebuildHoldings("user_123");

    expect(summary.cash).toBe(2500);
    expect(deps.settingsSet).toHaveBeenCalledWith({
      cashBalance: 2500,
      updatedAt: expect.any(String),
    });
    expect(deps.settingsUpdate).not.toHaveBeenCalled();
  });

  it("skips plaid items without an access token and does not wipe the book", async () => {
    deps.itemDocs = [item(undefined)];

    const summary = await rebuildHoldings("user_123");

    expect(summary).toEqual({ imported: 0, skipped: 0, cash: null, skippedEmptyRebuild: true });
    expect(deps.investmentsHoldingsGet).not.toHaveBeenCalled();
    expect(deps.batchSet).not.toHaveBeenCalled();
    expect(deps.batchDelete).not.toHaveBeenCalled();
    expect(deps.batchCommit).not.toHaveBeenCalled();
  });

  it("refuses to wipe the existing book when a linked item returns no positions", async () => {
    // Transient/empty Plaid response: a valid token, but holdings come back empty
    // (and no cash). The existing 2-holding book must be preserved, not wiped.
    deps.itemDocs = [item("access_one")];
    deps.investmentsHoldingsGet.mockResolvedValue({ data: { holdings: [], securities: [] } });

    const summary = await rebuildHoldings("user_123");

    expect(summary).toEqual({ imported: 0, skipped: 0, cash: null, skippedEmptyRebuild: true });
    expect(deps.batchDelete).not.toHaveBeenCalled();
    expect(deps.batchCommit).not.toHaveBeenCalled();
    expect(deps.settingsUpdate).not.toHaveBeenCalled();
  });

  it("still clears equity positions when the account moves fully to cash", async () => {
    // combined is empty but Plaid reports cash → a live, valid response (moved to
    // all cash), so the equity book SHOULD be replaced (emptied) and cash updated.
    deps.itemDocs = [item("access_one")];
    deps.investmentsHoldingsGet.mockResolvedValue({
      data: {
        holdings: [{ security_id: "c", quantity: 1, institution_value: 5000 }],
        securities: [{ security_id: "c", type: "cash", name: "Cash" }],
      },
    });

    const summary = await rebuildHoldings("user_123");

    expect(summary).toEqual({ imported: 0, skipped: 0, cash: 5000 });
    expect(deps.batchDelete).toHaveBeenCalledTimes(2); // old aapl + msft removed
    expect(deps.batchCommit).toHaveBeenCalledTimes(1);
    expect(deps.settingsUpdate).toHaveBeenCalledWith({
      cashBalance: 5000,
      updatedAt: expect.any(String),
    });
  });
});
