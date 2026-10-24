import { describe, expect, test } from "bun:test";
import { buildSeed } from "../domain/seed";
import { freeSlotSet } from "../domain/stock";
import { navigateOf } from "./agent";
import { showInWarehouseView, warehouseTools, type Snapshot } from "./warehouse-tools";

const NOW = Date.UTC(2026, 9, 23, 6);

/** The seeded ledger in the shape the tools read (synthetic data, no Convex). */
function snapshot(): Snapshot {
  const s = buildSeed(NOW);
  return {
    settings: { ...s.settings, seededAt: NOW },
    skus: s.skus,
    batches: s.batches.map((b) => ({ ...b, _id: b.code, status: "active" })),
    reservations: s.reservations.map((r, i) => ({ _id: `r${i}`, skuCode: r.skuCode, batchId: r.batchCode, qty: r.qty, pick: [], status: "active", label: r.label })),
    purchaseOrders: [],
    movements: s.movements,
    receipts: [],
    deals: [],
  } as unknown as Snapshot;
}

describe("show_in_warehouse", () => {
  test("new sofa → Floor 1 · Zone A free bays, without changing data", () => {
    const s = snapshot();
    const before = JSON.stringify(s);
    const r = showInWarehouseView(s, { category: "sofas", purpose: "place" }, NOW);
    if ("error" in r) throw new Error(r.error);
    expect(r.navigate.floor).toBe(1);
    expect(r.navigate.zone).toBe("A");
    const free = freeSlotSet(s.batches);
    expect(r.navigate.slots.every((id) => free.has(id))).toBe(true);
    expect(r.navigate.label).toMatch(/^Floor 1 · Zone A · \d+ free bays?$/);
    expect(JSON.stringify(s)).toBe(before);
  });

  test("unknown SKU is an error the model can read", () => {
    expect(showInWarehouseView(snapshot(), { sku: "NOPE-NOPE-0000" }, NOW)).toEqual({ error: "No item NOPE-NOPE-0000 in the catalogue." });
  });

  test("the Pi tool returns the target in details, which becomes a navigate event", async () => {
    const tool = warehouseTools(async () => snapshot(), () => NOW).find((t) => t.name === "show_in_warehouse")!;
    expect(tool).toBeDefined();
    const res = await tool.execute("call-1", { stage: "delivery" }, undefined, undefined, undefined as never);
    expect(res.details).toMatchObject({ navigate: { stage: "delivery", floor: null, zone: null, slots: [] } });
    expect(navigateOf("show_in_warehouse", false, res.details)).toMatchObject({ stage: "delivery", slots: [] });
  });

  test("no navigate event for errors or other tools", () => {
    const target = { floor: 1, zone: "A", slots: ["1A00"], label: "x" };
    expect(navigateOf("get_inventory", false, { navigate: target })).toBeNull();
    expect(navigateOf("show_in_warehouse", true, { navigate: target })).toBeNull();
    expect(navigateOf("show_in_warehouse", false, { error: "No bay" })).toBeNull();
  });
});
