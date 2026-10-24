import { describe, expect, test } from "bun:test";
import { SLOT_BY_ID } from "../data/layout";
import { commitments, replenishmentPlan, type ReplenishLedger } from "./replenish";
import { DAY, type BatchLike, type MovementLike } from "./types";

const NOW = Date.UTC(2026, 9, 24, 8);
const SLOTS = [...SLOT_BY_ID.keys()];
const rule = { windowDays: 30, coverageDays: 30, budgetSen: 500 };

/** Fill every bay except `free` with stock of an item outside the catalogue under test. */
function filler(free: number): BatchLike[] {
  return SLOTS.slice(free).map((slot, i) => ({ _id: `f${i}`, code: `F${i}`, skuCode: "FILL-XX-0000", receivedAt: NOW - 200 * DAY, qtyReceived: 1, locations: [{ slot, qty: 1 }], status: "active" }));
}
const sales = (skuCode: string, qty: number, daysAgo = 5): MovementLike => ({ at: NOW - daysAgo * DAY, skuCode, kind: "dispatch", reason: "sale", qty, lines: [], actor: { role: "sales", name: "Test" } });
const sku = (code: string, unitCostSen = 500, cap = 1) => ({ code, model: code, variant: "test", cap, price: { unitCostSen } });

function ledger(over: Partial<ReplenishLedger> & { free?: number } = {}): ReplenishLedger {
  return {
    settings: { replenish: rule, demoMode: false, seededAt: NOW - 120 * DAY },
    skus: [], batches: filler(over.free ?? 1), reservations: [], purchaseOrders: [], movements: [],
    ...over,
  };
}

describe("one shared budget and space allowance", () => {
  test("review reproduction: two SKUs each needing one 500-sen unit, one bay and 500 sen → only one is recommended", () => {
    const plan = replenishmentPlan(ledger({ skus: [sku("A-AA-0001"), sku("B-BB-0002")], movements: [sales("A-AA-0001", 1), sales("B-BB-0002", 1)] }), NOW);
    const recommended = plan.rows.filter((r) => r.s.suggested > 0);
    expect(recommended.map((r) => r.code)).toEqual(["A-AA-0001"]);
    expect(plan.totals).toMatchObject({ units: 1, costSen: 500, bays: 1, budgetLeftAfterSen: 0, baysLeftAfter: 0, limitedLines: 1 });
    const second = plan.rows.find((r) => r.code === "B-BB-0002")!;
    expect(second).toMatchObject({ candidateQty: 1, priority: 2, budgetBeforeSen: 0, baysBefore: 0 });
    expect(second.s.suggested).toBe(0);
    expect(second.s.lines.at(-1)).toContain("RM0.00 budget and 0 bays left");
  });

  test("the least-covered SKU claims first; ties break by shortfall then code (deterministic)", () => {
    const l = ledger({
      free: 10, settings: { replenish: { ...rule, budgetSen: 1_500 }, demoMode: false, seededAt: NOW - 120 * DAY },
      skus: [sku("C-CC-0003"), sku("A-AA-0001"), sku("B-BB-0002")],
      movements: [sales("A-AA-0001", 3), sales("B-BB-0002", 3), sales("C-CC-0003", 3)],
      batches: [...filler(10), { _id: "c", code: "C", skuCode: "C-CC-0003", receivedAt: NOW - DAY, qtyReceived: 1, locations: [{ slot: SLOTS[0]!, qty: 1 }], status: "active" }],
    });
    const plan = replenishmentPlan(l, NOW);
    const order = plan.rows.filter((r) => r.priority).sort((a, b) => a.priority! - b.priority!).map((r) => [r.code, r.s.suggested]);
    // A and B have zero cover (tie → larger shortfall → code); C has 1 unit on hand.
    expect(order).toEqual([["A-AA-0001", 3], ["B-BB-0002", 0], ["C-CC-0003", 0]]);
    expect(replenishmentPlan(l, NOW)).toEqual(plan);
  });

  test("open orders reserve budget at their own recorded cost, not the catalogue cost", () => {
    const l = ledger({ free: 5, settings: { replenish: { ...rule, budgetSen: 2_000 }, demoMode: false, seededAt: NOW - 120 * DAY }, skus: [sku("A-AA-0001", 500)], purchaseOrders: [{ code: "PO-1", skuCode: "A-AA-0001", qty: 2, qtyReceived: 0, unitCostSen: 900 }], movements: [sales("A-AA-0001", 10)] });
    const c = commitments(l);
    expect(c).toMatchObject({ openOrderSen: 1_800, budgetLeftSen: 200, estimatedOrders: [], unknownCostOrders: [] });
    expect(replenishmentPlan(l, NOW).rows[0]!.s).toMatchObject({ suggested: 0, limitedBy: "budget" });
  });

  test("an order without its own cost is estimated from the catalogue and labelled; with no cost at all the budget is unknown", () => {
    const estimated = commitments(ledger({ skus: [sku("A-AA-0001", 400)], purchaseOrders: [{ code: "PO-2", skuCode: "A-AA-0001", qty: 1, qtyReceived: 0 }] }));
    expect(estimated).toMatchObject({ openOrderSen: 400, estimatedOrders: ["PO-2"], budgetLeftSen: 100 });
    const l = ledger({ free: 5, skus: [sku("A-AA-0001", 500), sku("Z-ZZ-0009", 0)], purchaseOrders: [{ code: "PO-3", skuCode: "Z-ZZ-0009", qty: 1, qtyReceived: 0 }], movements: [sales("A-AA-0001", 2)] });
    const plan = replenishmentPlan(l, NOW);
    expect(plan.commitments).toMatchObject({ openOrderSen: null, budgetLeftSen: null, unknownCostOrders: ["PO-3"] });
    expect(plan.totals.units).toBe(0);
    expect(plan.rows.find((r) => r.code === "A-AA-0001")!.s).toMatchObject({ status: "insufficient", suggested: 0 });
    expect(plan.notes[0]).toContain("PO-3 has no recorded unit cost");
  });

  test("bays promised to incoming orders are not offered again", () => {
    const l = ledger({ free: 3, settings: { replenish: { ...rule, budgetSen: 100_000 }, demoMode: false, seededAt: NOW - 120 * DAY }, skus: [sku("A-AA-0001", 500, 2), sku("B-BB-0002", 500, 1)], purchaseOrders: [{ code: "PO-4", skuCode: "A-AA-0001", qty: 3, qtyReceived: 0, unitCostSen: 500 }], movements: [sales("A-AA-0001", 4), sales("B-BB-0002", 5)] });
    const plan = replenishmentPlan(l, NOW);
    expect(plan.commitments).toMatchObject({ freeBays: 3, incomingBays: 2, baysLeft: 1 });
    expect(plan.totals.bays).toBeLessThanOrEqual(1);
    expect(plan.totals.baysLeftAfter).toBeGreaterThanOrEqual(0);
  });

  test("unknown item cost and short history give an explanation, not a number", () => {
    const short = replenishmentPlan(ledger({ free: 5, settings: { replenish: { ...rule, budgetSen: 10_000 }, demoMode: false, seededAt: NOW - 10 * DAY }, skus: [sku("A-AA-0001")], movements: [sales("A-AA-0001", 4)] }), NOW);
    expect(short.rows[0]!.s).toMatchObject({ status: "insufficient", suggested: 0, lines: ["Only 10 days of history (the rule needs 30)"] });
    const unknown = replenishmentPlan(ledger({ free: 5, settings: { replenish: { ...rule, budgetSen: 10_000 }, demoMode: false, seededAt: NOW - 90 * DAY }, skus: [sku("A-AA-0001", 0)], movements: [sales("A-AA-0001", 4)] }), NOW);
    expect(unknown.rows[0]!.s).toMatchObject({ status: "insufficient", suggested: 0 });
    expect(unknown.rows[0]!.s.lines[0]).toContain("Record the purchase unit cost");
    expect(unknown.rows[0]!.priority).toBeNull();
  });

  test("every plan is jointly feasible", () => {
    for (let free = 0; free < 6; free++) {
      for (const budgetSen of [0, 700, 2_000, 50_000]) {
        const l = ledger({ free, settings: { replenish: { ...rule, budgetSen }, demoMode: false, seededAt: NOW - 120 * DAY }, skus: [sku("A-AA-0001", 300, 2), sku("B-BB-0002", 450, 3), sku("C-CC-0003", 700, 1)], movements: [sales("A-AA-0001", 9), sales("B-BB-0002", 7), sales("C-CC-0003", 4)] });
        const plan = replenishmentPlan(l, NOW);
        expect(plan.totals.costSen).toBeLessThanOrEqual(budgetSen);
        expect(plan.totals.bays).toBeLessThanOrEqual(free);
        expect(plan.rows.reduce((a, r) => a + r.costSen, 0)).toBe(plan.totals.costSen);
      }
    }
  });
});
