// The live inventory: derived (and memoised) from the persisted stock ledger records.
import {
  CATEGORY_INFO,
  seedRows,
  type Category,
  type CategoryId,
  type FloorId,
  type Model,
  type Sku,
  type SkuRecord,
  type ZoneId,
} from "./catalog";
import { FLOOR_IDS, SLOT_BY_ID, SLOTS, ZONE_IDS, type Slot } from "./layout";

export interface Bay extends Slot {
  sku: Sku | null;
  qty: number;
  /** Batch occupying the bay, when the ledger tracks batches. */
  batchId?: string;
}

export interface Inventory {
  /** Categories that currently hold stock, in catalogue order. */
  categories: Category[];
  skus: Sku[];
  byCode: Map<string, Sku>;
  bays: Record<FloorId, Bay[]>;
  freeBays: number;
  /** Models received through the New arrivals flow, newest first. */
  newArrivals: Sku[];
  codesFor(s: Sku): { code: string; qty: number }[];
  locationText(s: Sku): string;
  skusOnFloor(floor: FloorId): Sku[];
  /** The category stored in a zone (the first SKU in fill order). */
  zoneCategory(floor: FloorId, zone: ZoneId): Category | null;
}

export const baysNeeded = (units: number, cap: number) => Math.ceil(Math.max(0, units) / Math.max(1, cap));

/** Initial ledger: the seed SKUs fill each zone's bays in order, `min(cap, remaining)` units per bay. */
export function seedRecords(): SkuRecord[] {
  const cursor = new Map<string, number>();
  return seedRows().map((row) => {
    const slots = SLOTS[row.floor][row.zone];
    const key = `${row.floor}${row.zone}`;
    const start = cursor.get(key) ?? 0;
    const n = Math.min(baysNeeded(row.onHand, row.cap), slots.length - start);
    cursor.set(key, start + n);
    return { ...row, bays: slots.slice(start, start + n).map((s) => s.id) };
  });
}

let memoKey: readonly SkuRecord[] | null = null;
let memo: Inventory | null = null;

export function deriveInventory(records: readonly SkuRecord[]): Inventory {
  if (records === memoKey && memo) return memo;

  const categories: Category[] = CATEGORY_INFO.map((c) => ({ id: c.id, name: c.name, models: [], skus: [] }));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const skus: Sku[] = [];
  for (const r of records) {
    if (r.onHand <= 0) continue;
    const category = catById.get(r.category)!;
    let model = category.models.find((m) => m.name === r.model);
    if (!model) {
      model = { name: r.model, category, doors: r.doors, skus: [] } satisfies Model;
      category.models.push(model);
    }
    const sku: Sku = { ...r, category, model };
    model.skus.push(sku);
    category.skus.push(sku);
    skus.push(sku);
  }

  // Bay contents: each SKU fills its allocated bays in order.
  const bayById = new Map<string, Bay>();
  const bays = {} as Record<FloorId, Bay[]>;
  for (const f of FLOOR_IDS) {
    bays[f] = ZONE_IDS.flatMap((z) => SLOTS[f][z]).map((slot) => {
      const b: Bay = { ...slot, sku: null, qty: 0 };
      bayById.set(slot.id, b);
      return b;
    });
  }
  for (const s of skus) {
    let remaining = s.onHand;
    for (const id of s.bays) {
      const b = bayById.get(id);
      if (!b || remaining <= 0) break;
      b.sku = s;
      b.qty = Math.min(s.slotQty?.[id] ?? s.cap, remaining);
      b.batchId = s.slotBatch?.[id];
      remaining -= b.qty;
    }
  }

  const byCode = new Map(skus.map((s) => [s.sku, s]));
  const codes = new Map<string, { code: string; qty: number }[]>();
  for (const f of FLOOR_IDS)
    for (const b of bays[f])
      if (b.sku) {
        const list = codes.get(b.sku.sku) ?? [];
        list.push({ code: b.code, qty: b.qty });
        codes.set(b.sku.sku, list);
      }
  const codesFor = (s: Sku) => codes.get(s.sku) ?? [];

  memoKey = records;
  memo = {
    categories: categories.filter((c) => c.skus.length > 0),
    skus,
    byCode,
    bays,
    freeBays: FLOOR_IDS.reduce((n, f) => n + bays[f].filter((b) => !b.sku).length, 0),
    newArrivals: skus.filter((s) => s.addedAt).sort((a, b) => b.addedAt! - a.addedAt!),
    codesFor,
    locationText(s) {
      const c = codesFor(s);
      const span = c.length ? c[0]!.code + (c.length > 1 ? ` – ${c[c.length - 1]!.code}` : "") : "—";
      return `F${s.floor} · Zone ${s.zone} · ${span}`;
    },
    skusOnFloor: (floor) => skus.filter((s) => s.floor === floor),
    zoneCategory(floor, zone) {
      const first = bays[floor].find((b) => b.zone === zone && b.sku);
      return first?.sku?.category ?? null;
    },
  };
  return memo;
}

/** Bays not allocated to any SKU. */
export function freeSlotIds(records: readonly SkuRecord[]): Set<string> {
  const used = new Set(records.filter((r) => r.onHand > 0).flatMap((r) => r.bays));
  return new Set([...SLOT_BY_ID.keys()].filter((id) => !used.has(id)));
}

/**
 * Pick free bays for `count` bays of stock. Preference: the given zone, then zones that already
 * hold the category, then any zone — trying to keep the whole delivery in one zone first.
 */
export function planBays(
  records: readonly SkuRecord[],
  category: CategoryId,
  count: number,
  prefer?: { floor: FloorId; zone: ZoneId },
): string[] {
  const zones = records.filter((r) => r.category === category && r.onHand > 0).map((r) => ({ floor: r.floor, zone: r.zone }));
  return planSlots(freeSlotIds(records), count, prefer ? [prefer, ...zones] : zones);
}

/** Pick `count` bays from `free`, trying the preferred zones first and one zone for the whole delivery. */
export function planSlots(free: ReadonlySet<string>, count: number, prefer: readonly { floor: FloorId; zone: ZoneId }[] = []): string[] {
  if (count <= 0) return [];
  const order: { floor: FloorId; zone: ZoneId }[] = [];
  const push = (floor: FloorId, zone: ZoneId) => {
    if (!order.some((o) => o.floor === floor && o.zone === zone)) order.push({ floor, zone });
  };
  for (const o of prefer) push(o.floor, o.zone);
  for (const f of FLOOR_IDS) for (const z of ZONE_IDS) push(f, z);

  const freeIn = (o: { floor: FloorId; zone: ZoneId }) => SLOTS[o.floor][o.zone].filter((s) => free.has(s.id)).map((s) => s.id);
  const whole = order.find((o) => freeIn(o).length >= count);
  if (whole) return freeIn(whole).slice(0, count);
  return order.flatMap(freeIn).slice(0, count);
}

export function slotLabel(ids: readonly string[]) {
  const slots = ids.map((id) => SLOT_BY_ID.get(id)!).filter(Boolean);
  if (!slots.length) return "—";
  const first = slots[0]!;
  const last = slots[slots.length - 1]!;
  return `F${first.floor} · Zone ${first.zone} · ${first.code}${slots.length > 1 ? ` – ${last.code}` : ""}`;
}
