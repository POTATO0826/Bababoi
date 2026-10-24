import { describe, expect, test } from "bun:test";
import { SLOT_BY_ID } from "../data/layout";
import { deriveInventory } from "../data/inventory";
import { flagBatches, netSalesBySku } from "./ageing";
import { comparable, netRecovery, rankQuotes, type DealCostLike, type QuoteLike } from "./costs";
import { suggest } from "./replenish";
import { buildSeed } from "./seed";
import { applyPick, batchQty, collectionPayload, freeSlotSet, planPick, planPlacement, toSkuRecords } from "./stock";
import { DAY, type BatchLike, type MovementLike, type ReservationLike } from "./types";
import { fit, piecesFor } from "./vehicle";
import { packagesFor } from "./specs";

const NOW = Date.UTC(2026, 9, 23, 6);

function seeded() {
  const s = buildSeed(NOW);
  const batches: BatchLike[] = s.batches.map((b) => ({ ...b, _id: b.code, status: "active" }));
  const reservations: ReservationLike[] = s.reservations.map((r, i) => ({
    _id: `r${i}`,
    skuCode: r.skuCode,
    batchId: r.batchCode,
    qty: r.qty,
    pick: [],
    status: "active",
    label: r.label,
  }));
  const movements: MovementLike[] = s.movements;
  return { s, batches, reservations, movements };
}

describe("costs (§5.3)", () => {
  const deal: DealCostLike = { version: 2, priceSen: 120_000, packingSen: 2_000, unloading: "requested", freightPayer: "merchant" };
  const q = (over: Partial<QuoteLike>): QuoteLike => ({
    _id: "q",
    source: "manual",
    dealVersion: 2,
    status: "ok",
    service: "VAN",
    carrier: "C",
    totalSen: 28_000,
    expiresAt: NOW + DAY,
    unloading: "included",
    reference: "Carrier reply Q1",
    terms: "Includes transport and unloading; no other charges",
    verifiedAt: NOW,
    ...over,
  });

  test("§8 example: RM1,200 − RM280 − RM20 = RM900", () => {
    const r = netRecovery(deal, comparable(q({}), deal));
    expect(r.netSen).toBe(90_000);
    expect(r.deliverySen).toBe(28_000);
  });

  test("unknown unloading is incomplete, never zero", () => {
    const c = comparable(q({ totalSen: 22_000, unloading: "unknown" }), deal);
    expect(c.kind).toBe("incomplete");
    expect(netRecovery(deal, c).netSen).toBeNull();
  });

  test("confirmed excluded unloading is added once", () => {
    expect(comparable(q({ totalSen: 25_000, unloading: "excluded", unloadingSen: 3_000 }), deal)).toEqual({ kind: "complete", sen: 28_000 });
  });

  test("an extra already inside the total cannot be added again", () => {
    expect(() => comparable(q({ unloading: "included", unloadingSen: 3_000 }), deal)).toThrow();
  });

  test("buyer-paid freight is not deducted", () => {
    const r = netRecovery({ ...deal, freightPayer: "buyer" }, comparable(q({ unloading: "unknown" }), deal));
    expect(r.netSen).toBe(118_000);
  });

  test("ranking keeps only current, complete, real quotes", () => {
    const quotes = [
      q({ _id: "a", totalSen: 28_000 }),
      q({ _id: "b", totalSen: 22_000, unloading: "unknown" }),
      q({ _id: "c", totalSen: 30_000, expiresAt: NOW - 1 }),
      q({ _id: "d", totalSen: 10_000, source: "demo_fallback" }),
      q({ _id: "e", totalSen: 5_000, dealVersion: 1 }),
      q({ _id: "f", totalSen: 1_000, source: "lalamove_sandbox" }),
      q({ _id: "g", totalSen: 1_000, verifiedAt: undefined }),
    ];
    const r = rankQuotes(quotes, deal, NOW);
    expect(r.ranked.map((x) => x.quote._id)).toEqual(["a"]);
    expect(Object.fromEntries(r.other.map((o) => [o.quote._id, o.reason]))).toEqual({
      b: "Incomplete",
      c: "Expired",
      d: "Saved demo",
      e: "Old version",
      f: "Sandbox only",
      g: "Carrier confirmation needed",
    });
  });
});

describe("replenishment (§7)", () => {
  test("§8 example suggests 4", () => {
    const r = suggest({
      netSales: 12,
      historyDays: 90,
      onHand: 5,
      reserved: 2,
      incoming: 2,
      freeBays: 10,
      cap: 4,
      unitCostSen: 52_000,
      budgetLeftSen: 2_000_000,
      rule: { windowDays: 30, coverageDays: 21, budgetSen: 2_000_000 },
    });
    expect(r.target).toBe(9);
    expect(r.suggested).toBe(4);
  });

  test("space and budget bound the number", () => {
    const base = { netSales: 30, historyDays: 90, onHand: 0, reserved: 0, incoming: 0, cap: 2, unitCostSen: 10_000 };
    const rule = { windowDays: 30, coverageDays: 30, budgetSen: 0 };
    expect(suggest({ ...base, freeBays: 2, budgetLeftSen: 1e9, rule }).limitedBy).toBe("space");
    expect(suggest({ ...base, freeBays: 99, budgetLeftSen: 50_000, rule }).suggested).toBe(5);
  });

  test("no sales history gives an explanation, not a number", () => {
    const r = suggest({ netSales: 0, historyDays: 90, onHand: 1, reserved: 0, incoming: 0, freeBays: 9, cap: 2, unitCostSen: 1, budgetLeftSen: 1, rule: { windowDays: 30, coverageDays: 21, budgetSen: 1 } });
    expect(r.status).toBe("insufficient");
  });
});

describe("stock", () => {
  test("a collection retry compares equal regardless of client key and line order", () => {
    const sent = collectionPayload([{ slot: "1A01", qty: 1 }, { slot: "1A00", qty: 2 }], 1_700_000_000_000, true);
    const reordered = collectionPayload([{ qty: 2, slot: "1A00" }, { qty: 1, slot: "1A01" }], 1_700_000_000_000, true);
    expect(reordered).toBe(sent);
    expect(collectionPayload([{ slot: "1A00", qty: 1 }], 1_700_000_000_000, true)).not.toBe(sent);
  });

  test("pick frees whole bays first (§8: A-1-01 freed, A-1-02 kept)", () => {
    const locs = [
      { slot: "1A00", qty: 2 },
      { slot: "1A01", qty: 2 },
    ];
    const pick = planPick(locs, 2);
    expect(pick).toEqual([{ slot: "1A00", qty: 2 }]);
    expect(applyPick(locs, pick)).toEqual([{ slot: "1A01", qty: 2 }]);
  });

  test("pick refuses more than the batch holds", () => {
    expect(() => planPick([{ slot: "1A00", qty: 1 }], 2)).toThrow();
  });

  test("placement never reuses an occupied bay", () => {
    const { s, batches } = seeded();
    const chair = s.skus.find((x) => x.code === "CHAIR-LUMA-0410")!;
    const place = planPlacement(chair, 4, batches)!;
    const used = new Set(batches.flatMap((b) => b.locations.map((l) => l.slot)));
    expect(place.every((l) => !used.has(l.slot))).toBe(true);
    expect(SLOT_BY_ID.get(place[0]!.slot)!.zone).toBe("C");
  });
});

describe("seed", () => {
  test("§8 anchors", () => {
    const { s, batches, reservations, movements } = seeded();
    const a = batches.find((b) => b.code === "B-2140-A")!;
    expect(a.locations).toEqual([
      { slot: "1A00", qty: 2 },
      { slot: "1A01", qty: 2 },
    ]);
    const recs = toSkuRecords({ skus: s.skus, batches, reservations, purchaseOrders: s.purchaseOrders.map((p) => ({ ...p, qtyReceived: 0, status: "open" as const })), movements }, NOW);
    const r3301 = recs.find((r) => r.sku === "SOFA-NORDE-3301")!;
    expect([r3301.onHand, r3301.reserved, r3301.incoming]).toEqual([5, 2, 2]);
    expect(netSalesBySku(movements, NOW - 30 * DAY).get("SOFA-NORDE-3301")).toBe(12);
  });

  test("free space: at least 2 free bays in every zone", () => {
    const { batches } = seeded();
    const free = freeSlotSet(batches);
    expect(free.size).toBeGreaterThanOrEqual(30);
    for (const f of [1, 2] as const)
      for (const z of ["A", "B", "C", "D"] as const) {
        expect([...free].filter((id) => id.startsWith(`${f}${z}`)).length).toBeGreaterThanOrEqual(2);
      }
  });

  test("ageing flags the 120-day sofa batch but not its 18-day sibling", () => {
    const { batches, reservations, movements } = seeded();
    const flags = flagBatches({ batches, reservations, movements, rule: { minAgeDays: 90, windowDays: 30, maxSales: 0 }, now: NOW, historyFrom: NOW - 90 * DAY });
    const byCode = new Map(flags.map((f) => [f.batch.code, f]));
    expect(byCode.get("B-2140-A")!.flagged).toBe(true);
    expect(byCode.get("B-2140-A")!.ageDays).toBe(120);
    expect(byCode.get("B-2140-B")!.flagged).toBe(false);
    expect(flags.filter((f) => f.flagged).length).toBe(5);
  });

  test("the 3D map sees per-bay quantities from batches", () => {
    const { s, batches, reservations, movements } = seeded();
    const inv = deriveInventory(toSkuRecords({ skus: s.skus, batches, reservations, purchaseOrders: [], movements }, NOW));
    const a101 = inv.bays[1].find((b) => b.code === "A-1-01")!;
    expect(a101.sku?.sku).toBe("SOFA-HAVN-2140");
    expect(a101.qty).toBe(2);
    expect(a101.batchId).toBe("B-2140-A");
    expect(inv.skus.reduce((a, x) => a + x.onHand, 0)).toBe(batches.reduce((a, b) => a + batchQty(b), 0));
  });
});

describe("vehicle fit", () => {
  const van = { key: "VAN", label: "Van", loadKg: 600, lengthCm: 240, widthCm: 150, heightCm: 130 };
  test("two L-sofas fit a van", () => {
    expect(fit(piecesFor(packagesFor("sofaL"), 2), van).status).not.toBe("no");
  });
  test("overweight is refused", () => {
    expect(fit(piecesFor(packagesFor("sofaL"), 8), van).status).toBe("no");
  });
  test("missing data is unknown", () => {
    expect(fit([], van).status).toBe("unknown");
  });
});

describe("lalamove", () => {
  test("signature matches node:crypto HMAC over the documented raw string", async () => {
    const { createHmac } = await import("node:crypto");
    const { signature, quotationBody, parseQuotation } = await import("./lalamove");
    const body = quotationBody({ service: "VAN", specialRequests: [], stops: [{ lat: 3.07, lng: 101.5, address: "A" }, { lat: 3.1, lng: 101.6, address: "B" }] });
    const ts = "1545880607433";
    const expected = createHmac("sha256", "sk_test_x").update(`${ts}\r\nPOST\r\n/v3/quotations\r\n\r\n${body}`).digest("hex");
    expect(await signature("sk_test_x", ts, "POST", "/v3/quotations", body)).toBe(expected);
    expect(JSON.parse(body).data.stops[0].coordinates.lat).toBe("3.07");
    const q = parseQuotation({ data: { quotationId: "151", expiresAt: "2026-10-23T07:23:39.00Z", priceBreakdown: { total: "50.5", currency: "MYR" } } });
    expect(q?.totalSen).toBe(5050);
    expect(q?.expiresAt).toBe(Date.parse("2026-10-23T07:23:39.00Z"));
  });
});
