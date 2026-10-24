import { describe, expect, test } from "bun:test";
import { SLOT_BY_ID } from "../data/layout";
import { matchNavigation, matchSkus, navigationTarget, type NavLedger, type NavTarget } from "./navigate";
import { buildSeed } from "./seed";
import { freeSlotSet, planPlacement } from "./stock";
import type { BatchLike, ReservationLike } from "./types";

const NOW = Date.UTC(2026, 9, 23, 6);

function ledger(): NavLedger {
  const s = buildSeed(NOW);
  const batches: BatchLike[] = s.batches.map((b) => ({ ...b, _id: b.code, status: "active" }));
  const reservations: ReservationLike[] = s.reservations.map((r, i) => ({
    _id: `r${i}`, skuCode: r.skuCode, batchId: r.batchCode, qty: r.qty, pick: [], status: "active", label: r.label,
  }));
  return { skus: s.skus, batches, reservations, movements: s.movements, settings: { ...s.settings, seededAt: NOW } };
}

const L = ledger();
const ok = (t: NavTarget | { error: string }): NavTarget => {
  if ("error" in t) throw new Error(t.error);
  return t;
};
const where = (id: string) => SLOT_BY_ID.get(id)!;

describe("matchNavigation (offline, no model)", () => {
  const m = (text: string) => matchNavigation(text, L.skus);

  test("new stock for a category asks for placement", () => {
    expect(m("Where can I put my new sofa?")).toEqual({ category: "sofas", purpose: "place" });
  });

  test("a category on its own is shown", () => {
    expect(m("show me the sofas")).toEqual({ category: "sofas" });
  });

  test("a named model resolves to its SKU", () => {
    expect(m("Where are the oak dining chairs?")).toEqual({ sku: "CHAIR-LUMA-0410" });
    expect(m("take me to SOFA-NORDE-3301")).toEqual({ sku: "SOFA-NORDE-3301" });
  });

  test("an ambiguous word plus a stage looks at that stage for all matches", () => {
    expect(m("any mirrors ageing?")).toEqual({ stage: "ageing", search: "any mirrors ageing?", purpose: "ageing" });
  });

  test("stage words open stages", () => {
    expect(m("open the delivery quotes")).toEqual({ stage: "delivery" });
    expect(m("what needs approval")).toEqual({ stage: "approve" });
    expect(m("anything to collect?")).toEqual({ stage: "collect" });
    expect(m("verify the delivery note")).toEqual({ stage: "receive" });
    expect(m("what should I reorder")).toEqual({ stage: "replenish" });
    expect(m("有什么旧货？")).toEqual({ stage: "ageing" });
  });

  test("quantity for placement", () => {
    expect(m("where should we store 4 oatmeal sofas")).toEqual({ sku: "SOFA-NORDE-3301", purpose: "place", qty: 4 });
  });

  test("floors and zones are places, not products", () => {
    expect(m("show me floor 2 zone b")).toEqual({ zone: "B", floor: 2 });
    expect(m("go to bay a-1-03")).toEqual({ bays: ["A-1-03"] });
  });

  test("questions that aren't about a place are left alone", () => {
    expect(m("hello")).toBeNull();
    expect(m("/ageing")).toBeNull();
    expect(m("which sofas are low stock")).toBeNull();
    expect(m("today's summary")).toBeNull();
  });

  test("matchSkus keeps ties and prefers exact codes", () => {
    expect(matchSkus(L.skus, "mirror").map((s) => s.code).sort()).toEqual(["MIRR-VELA-0900", "WARD-VELA-2000"]);
    expect(matchSkus(L.skus, "floor 2").length).toBe(0);
    expect(matchSkus(L.skus, "floor lamp").map((s) => s.code)).toEqual(["LAMP-VELA-1500"]);
  });
});

describe("navigationTarget", () => {
  test("new sofa: Floor 1 · Zone A, the free bays there, chosen by planPlacement", () => {
    const t = ok(navigationTarget(L, { category: "sofas", purpose: "place" }, NOW));
    const sofa = L.skus.find((s) => s.category === "sofas")!;
    const planned = planPlacement({ ...sofa, code: "__new__" }, sofa.cap, L.batches)!;
    expect(t.floor).toBe(1);
    expect(t.zone).toBe("A");
    expect(t.slots[0]).toBe(planned[0]!.slot);
    const free = freeSlotSet(L.batches);
    expect(t.slots.length).toBeGreaterThan(0);
    for (const id of t.slots) {
      expect(free.has(id)).toBe(true);
      expect(where(id).zone).toBe("A");
    }
    expect(t.label).toBe(`Floor 1 · Zone A · ${t.slots.length} free bay${t.slots.length === 1 ? "" : "s"}`);
  });

  test("placing a quantity shows exactly the planned bays", () => {
    const sku = L.skus.find((s) => s.code === "SOFA-NORDE-3301")!;
    const t = ok(navigationTarget(L, { sku: sku.code, purpose: "place", qty: 6 }, NOW));
    expect(t.slots).toEqual(planPlacement(sku, 6, L.batches)!.map((p) => p.slot));
    expect(t.sku).toBe(sku.code);
  });

  test("no room is an error, not a guess", () => {
    expect(navigationTarget(L, { category: "sofas", purpose: "place", qty: 10_000 }, NOW)).toHaveProperty("error");
  });

  test("locating a SKU highlights its bays", () => {
    const t = ok(navigationTarget(L, { sku: "SOFA-HAVN-2140" }, NOW));
    const expected = L.batches.filter((b) => b.skuCode === "SOFA-HAVN-2140").flatMap((b) => b.locations.map((l) => l.slot)).sort();
    expect(t.slots).toEqual(expected);
    expect([t.floor, t.zone]).toEqual([1, "A"]);
    expect(t.label).toContain("L-Shaped Sofa · Grey");
  });

  test("ageing mirrors: Ageing stage and the flagged batches' bays", () => {
    const t = ok(navigationTarget(L, { stage: "ageing", search: "mirrors", purpose: "ageing" }, NOW));
    expect(t.stage).toBe("ageing");
    expect(t.slots.length).toBeGreaterThan(0);
    const codes = new Set(L.batches.filter((b) => t.slots.some((s) => b.locations.some((l) => l.slot === s))).map((b) => b.skuCode));
    for (const c of codes) expect(["MIRR-VELA-0900", "WARD-VELA-2000"]).toContain(c);
    expect(t.label).toMatch(/ageing batch/);
  });

  test("stage only: no camera move", () => {
    expect(ok(navigationTarget(L, { stage: "delivery" }, NOW))).toEqual({ stage: "delivery", floor: null, zone: null, slots: [], label: "Delivery" });
  });

  test("zone and bay codes", () => {
    expect(ok(navigationTarget(L, { zone: "2B" }, NOW))).toMatchObject({ floor: 2, zone: "B", slots: [] });
    const t = ok(navigationTarget(L, { bays: ["A-1-03"] }, NOW));
    expect(t.slots.map((s) => where(s).code)).toEqual(["A-1-03"]);
    expect(navigationTarget(L, { bays: ["Z-9-99"] }, NOW)).toHaveProperty("error");
    expect(navigationTarget(L, { sku: "NOPE-NOPE-0000" }, NOW)).toHaveProperty("error");
  });

  test("never changes the ledger", () => {
    const before = JSON.stringify(L);
    navigationTarget(L, { category: "sofas", purpose: "place" }, NOW);
    navigationTarget(L, { stage: "ageing", search: "mirror" }, NOW);
    expect(JSON.stringify(L)).toBe(before);
  });
});
