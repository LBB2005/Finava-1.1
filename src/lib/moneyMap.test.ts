import { describe, expect, it } from "vitest";
import {
  applyEvent,
  compactShares,
  compactUsd,
  emptyMoneyMap,
  intensities,
  layoutRadial,
  parseJsonObject,
  parseSupplyChainRelations,
  relationId,
  relationsFromOwnership,
  relationsFromPeers,
  slugifyName,
  sortByIntensity,
  type MoneyRelation,
} from "./moneyMap";

function rel(over: Partial<MoneyRelation> = {}): MoneyRelation {
  return {
    id: "peer:AMD",
    kind: "peer",
    name: "AMD",
    ticker: "AMD",
    weightPct: null,
    intensity: 0.5,
    direction: "none",
    confidence: "verified",
    source: "finnhub",
    ...over,
  };
}

describe("slugifyName", () => {
  it("lowercases and dashes non-alphanumerics", () => {
    expect(slugifyName("Vanguard Group, Inc.")).toBe("vanguard-group-inc");
  });
  it("falls back to 'unknown' for empty-ish input", () => {
    expect(slugifyName("!!!")).toBe("unknown");
  });
});

describe("relationId", () => {
  it("prefers the uppercased ticker", () => {
    expect(relationId("customer", "msft", "Microsoft")).toBe("customer:MSFT");
  });
  it("falls back to the slugged name when no ticker", () => {
    expect(relationId("owner", null, "BlackRock Inc")).toBe("owner:blackrock-inc");
  });
});

describe("intensities", () => {
  it("normalizes against the max and floors small values", () => {
    const r = intensities([100, 50, 1]);
    expect(r[0]).toBe(1);
    expect(r[1]).toBe(0.5);
    expect(r[2]).toBeGreaterThanOrEqual(0.12); // floored, never invisible
  });
  it("uses the fallback for missing/zero weights", () => {
    expect(intensities([null, undefined, 0], 0.4)).toEqual([0.4, 0.4, 0.4]);
  });
  it("mixes real and missing weights", () => {
    const r = intensities([10, null]);
    expect(r[0]).toBe(1);
    expect(r[1]).toBe(0.4);
  });
});

describe("compactUsd", () => {
  it("formats trillions/billions/millions", () => {
    expect(compactUsd(2.94e12)).toBe("$2.9T");
    expect(compactUsd(8.1e9)).toBe("$8.1B");
    expect(compactUsd(5e6)).toBe("$5.0M");
  });
  it("returns an em dash for non-numbers", () => {
    expect(compactUsd(null)).toBe("—");
    expect(compactUsd(Number.NaN)).toBe("—");
  });
});

describe("compactShares", () => {
  it("formats large share counts", () => {
    expect(compactShares(1.24e9)).toBe("1.2B shares");
    expect(compactShares(3.5e6)).toBe("3.5M shares");
  });
  it("returns undefined for non-positive/invalid", () => {
    expect(compactShares(0)).toBeUndefined();
    expect(compactShares(null)).toBeUndefined();
  });
});

describe("relationsFromPeers", () => {
  it("drops self, dupes, and non-strings, caps at 8", () => {
    const out = relationsFromPeers(["NVDA", "AMD", "amd", "INTC", 5, ""], "nvda");
    expect(out.map((r) => r.ticker)).toEqual(["AMD", "INTC"]);
    expect(out.every((r) => r.kind === "peer" && r.confidence === "verified")).toBe(true);
  });
  it("returns [] for non-array input", () => {
    expect(relationsFromPeers(null, "NVDA")).toEqual([]);
  });
});

describe("relationsFromOwnership", () => {
  it("maps holders, normalizes intensity by share, keeps names without tickers", () => {
    const out = relationsFromOwnership({
      ownership: [
        { name: "Vanguard Group", share: 1_000_000_000 },
        { name: "BlackRock", share: 500_000_000 },
        { name: "", share: 1 },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[0].ticker).toBeNull();
    expect(out[0].intensity).toBe(1);
    expect(out[1].intensity).toBe(0.5);
    expect(out[0].note).toBe("1.0B shares");
    expect(out[0].direction).toBe("in");
  });
  it("returns [] when ownership is missing", () => {
    expect(relationsFromOwnership({})).toEqual([]);
  });
});

describe("parseJsonObject", () => {
  it("extracts JSON from a fenced response", () => {
    expect(parseJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("returns null on junk", () => {
    expect(parseJsonObject("no json here")).toBeNull();
  });
});

describe("parseSupplyChainRelations", () => {
  const raw = JSON.stringify({
    customers: [
      { name: "Microsoft", ticker: "MSFT", weightPct: 20, note: "Azure GPUs" },
      { name: "Meta", ticker: "meta", weightPct: 10 },
    ],
    suppliers: [
      { name: "TSMC", ticker: "TSM", weightPct: 40 },
      { name: "Private Co", weightPct: null },
    ],
  });

  it("splits customers/suppliers and tags them estimated/ai-10k", () => {
    const out = parseSupplyChainRelations(raw, "anthropic/claude-sonnet-4.6");
    const customers = out.filter((r) => r.kind === "customer");
    const suppliers = out.filter((r) => r.kind === "supplier");
    expect(customers).toHaveLength(2);
    expect(suppliers).toHaveLength(2);
    expect(out.every((r) => r.confidence === "estimated" && r.source === "ai-10k")).toBe(true);
    expect(out.every((r) => r.model === "anthropic/claude-sonnet-4.6")).toBe(true);
  });

  it("normalizes intensity within each kind and resolves directions", () => {
    const out = parseSupplyChainRelations(raw);
    const msft = out.find((r) => r.ticker === "MSFT")!;
    const meta = out.find((r) => r.name === "Meta")!;
    expect(msft.intensity).toBe(1); // 20 is the max customer weight
    expect(meta.intensity).toBe(0.5); // 10/20
    expect(msft.direction).toBe("in");
    expect(out.find((r) => r.name === "TSMC")!.direction).toBe("out");
  });

  it("uppercases tickers and leaves unlisted names null", () => {
    const out = parseSupplyChainRelations(raw);
    expect(out.find((r) => r.name === "Meta")!.ticker).toBe("META");
    expect(out.find((r) => r.name === "Private Co")!.ticker).toBeNull();
  });

  it("returns [] for unparseable input", () => {
    expect(parseSupplyChainRelations("not json")).toEqual([]);
  });
});

describe("layoutRadial", () => {
  const relations: MoneyRelation[] = [
    rel({ id: "customer:MSFT", kind: "customer", ticker: "MSFT", intensity: 1 }),
    rel({ id: "supplier:TSM", kind: "supplier", ticker: "TSM", intensity: 0.8 }),
    rel({ id: "owner:vanguard", kind: "owner", ticker: null, name: "Vanguard", intensity: 1 }),
    rel({ id: "peer:AMD", kind: "peer", ticker: "AMD", intensity: 0.45 }),
  ];

  it("anchors each kind to its compass direction", () => {
    const { cx, cy, nodes } = layoutRadial(relations);
    const at = (k: string) => nodes.find((n) => n.relation.kind === k)!;
    expect(at("customer").y).toBeLessThan(cy); // top
    expect(at("supplier").y).toBeGreaterThan(cy); // bottom
    expect(at("owner").x).toBeLessThan(cx); // left
    expect(at("peer").x).toBeGreaterThan(cx); // right
  });

  it("keeps every node inside the viewBox", () => {
    const { width, height, nodes } = layoutRadial(relations);
    for (const n of nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(width);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(height);
    }
  });

  it("caps each cluster at maxPerKind, strongest first", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      rel({ id: `customer:C${i}`, kind: "customer", ticker: `C${i}`, intensity: i / 10 })
    );
    const { nodes } = layoutRadial(many, { maxPerKind: 4 });
    expect(nodes).toHaveLength(4);
    // strongest (intensity 0.9) must survive the cap
    expect(nodes[0].relation.intensity).toBe(0.9);
  });
});

describe("sortByIntensity", () => {
  it("orders strongest links first without mutating input", () => {
    const input = [rel({ intensity: 0.2 }), rel({ intensity: 0.9 }), rel({ intensity: 0.5 })];
    const out = sortByIntensity(input);
    expect(out.map((r) => r.intensity)).toEqual([0.9, 0.5, 0.2]);
    expect(input[0].intensity).toBe(0.2); // original untouched
  });
});

describe("applyEvent", () => {
  it("sets self, accumulates + dedups relations, and resolves terminal states", () => {
    let e = emptyMoneyMap();
    e = applyEvent(e, { type: "self", self: { ticker: "NVDA", name: "Nvidia", sector: "Semis", marketCap: 2.9e12 } });
    expect(e.status).toBe("streaming");
    expect(e.map.self?.ticker).toBe("NVDA");

    e = applyEvent(e, { type: "relation", relation: rel({ id: "peer:AMD", intensity: 0.4 }) });
    e = applyEvent(e, { type: "relation", relation: rel({ id: "peer:AMD", intensity: 0.9 }) }); // same id → replace
    expect(e.map.relations).toHaveLength(1);
    expect(e.map.relations[0].intensity).toBe(0.9);

    e = applyEvent(e, { type: "done", generatedAt: "2026-06-19T00:00:00Z" });
    expect(e.status).toBe("done");
  });

  it("captures error events", () => {
    const e = applyEvent(emptyMoneyMap(), { type: "error", message: "boom" });
    expect(e.status).toBe("error");
    expect(e.error).toBe("boom");
  });
});
