// Batch ledger → per-SKU records for the 3D map, plus pick / placement planning.
import type { Movement, SkuRecord } from "../data/catalog";
import { planSlots } from "../data/inventory";
import { SLOT_BY_ID } from "../data/layout";
import { DAY, type BatchLike, type Loc, type MovementLike, type PurchaseOrderLike, type ReservationLike, type SkuLike } from "./types";

export interface LedgerLike {
  skus: SkuLike[];
  /** Active batches only. */
  batches: BatchLike[];
  /** Active reservations only. */
  reservations: ReservationLike[];
  /** Open purchase orders only. */
  purchaseOrders: PurchaseOrderLike[];
  /** Recent movements, newest first. */
  movements: MovementLike[];
}

const slotOrder = (id: string) => {
  const s = SLOT_BY_ID.get(id);
  return s ? (s.floor * 4 + "ABCD".indexOf(s.zone)) * 100 + s.row * 10 + s.index : 1e6;
};

export const batchQty = (b: Pick<BatchLike, "locations">) => b.locations.reduce((a, l) => a + l.qty, 0);

/** Bays held by active batches. */
export function occupiedSlots(batches: readonly BatchLike[]): Map<string, BatchLike> {
  const m = new Map<string, BatchLike>();
  for (const b of batches) if (b.status === "active") for (const l of b.locations) if (l.qty > 0) m.set(l.slot, b);
  return m;
}

export function freeSlotSet(batches: readonly BatchLike[]): Set<string> {
  const used = occupiedSlots(batches);
  return new Set([...SLOT_BY_ID.keys()].filter((id) => !used.has(id)));
}

/** Bays for `units` of a SKU: its existing zones first, then its home zone, then anywhere. */
export function planPlacement(sku: SkuLike, units: number, batches: readonly BatchLike[]): Loc[] | null {
  const need = Math.ceil(units / Math.max(1, sku.cap));
  const zones = batches
    .filter((b) => b.skuCode === sku.code && b.status === "active")
    .flatMap((b) => b.locations.map((l) => SLOT_BY_ID.get(l.slot)))
    .filter((s) => !!s)
    .map((s) => ({ floor: s.floor, zone: s.zone }));
  const slots = planSlots(freeSlotSet(batches), need, [...zones, { floor: sku.homeFloor, zone: sku.homeZone }]);
  if (slots.length < need) return null;
  let left = units;
  return slots.map((slot) => {
    const qty = Math.min(sku.cap, left);
    left -= qty;
    return { slot, qty };
  });
}

/** Which bays to take `qty` units from: whole bays first (so they free up), in bay order. */
export function planPick(locations: readonly Loc[], qty: number): Loc[] {
  if (!Number.isSafeInteger(qty) || qty <= 0) throw new Error("Pick quantity must be a positive whole number.");
  const sorted = [...locations].filter((l) => l.qty > 0).sort((a, b) => slotOrder(a.slot) - slotOrder(b.slot));
  const take = new Map<string, number>();
  let left = qty;
  for (const l of sorted) {
    if (left <= 0) break;
    if (l.qty <= left) {
      take.set(l.slot, l.qty);
      left -= l.qty;
    }
  }
  for (const l of sorted) {
    if (left <= 0) break;
    const already = take.get(l.slot) ?? 0;
    const more = Math.min(l.qty - already, left);
    if (more > 0) {
      take.set(l.slot, already + more);
      left -= more;
    }
  }
  if (left > 0) throw new Error(`Only ${qty - left} of ${qty} units in this batch.`);
  return sorted.filter((l) => take.has(l.slot)).map((l) => ({ slot: l.slot, qty: take.get(l.slot)! }));
}

/** Remove picked units from a batch's bays; empty bays drop out (and so become free). */
export function applyPick(locations: readonly Loc[], pick: readonly Loc[]): Loc[] {
  const seen = new Set<string>();
  for (const p of pick) {
    if (seen.has(p.slot) || !Number.isSafeInteger(p.qty) || p.qty <= 0) throw new Error("Invalid or repeated pick bay.");
    if (!locations.some((l) => l.slot === p.slot)) throw new Error(`Bay ${p.slot} is not in this allocation.`);
    seen.add(p.slot);
  }
  return locations
    .map((l) => {
      const p = pick.find((x) => x.slot === l.slot);
      if (p && p.qty > l.qty) throw new Error(`Bay ${l.slot} holds ${l.qty}, cannot take ${p.qty}.`);
      return { slot: l.slot, qty: l.qty - (p?.qty ?? 0) };
    })
    .filter((l) => l.qty > 0);
}

export const slotCode = (id: string) => SLOT_BY_ID.get(id)?.code ?? id;

function timeLabel(at: number, now: number) {
  const d = new Date(at);
  const days = Math.floor(now / DAY) - Math.floor(at / DAY);
  if (days <= 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

export function movementLine(m: MovementLike, now: number): Movement {
  const sign = m.kind === "receive" ? "+" : "−";
  const what =
    m.reason === "sale"
      ? "Dispatched"
      : m.reason === "supplier_receipt"
        ? "Received"
        : m.reason === "customer_return"
          ? "Returned"
          : m.reason === "transfer"
            ? "Transferred"
            : "Corrected";
  return { t: timeLabel(m.at, now), text: m.ref ? `${what} · ${m.ref}` : what, d: `${sign}${m.qty}` };
}

/** The 3D map and lists read `SkuRecord[]`; build them from the batch ledger. */
export function toSkuRecords(l: LedgerLike, now: number): SkuRecord[] {
  const batchesBySku = new Map<string, BatchLike[]>();
  for (const b of l.batches) {
    if (b.status !== "active") continue;
    const list = batchesBySku.get(b.skuCode) ?? [];
    list.push(b);
    batchesBySku.set(b.skuCode, list);
  }
  const sum = <T>(list: readonly T[], code: string, key: (x: T) => string, qty: (x: T) => number) =>
    list.reduce((a, x) => (key(x) === code ? a + qty(x) : a), 0);

  return l.skus.map((s) => {
    const batches = (batchesBySku.get(s.code) ?? []).sort((a, b) => a.receivedAt - b.receivedAt);
    const locs = batches.flatMap((b) =>
      [...b.locations].sort((x, y) => slotOrder(x.slot) - slotOrder(y.slot)).map((loc) => ({ ...loc, batch: b._id })),
    );
    const first = SLOT_BY_ID.get(locs[0]?.slot ?? "");
    return {
      sku: s.code,
      variant: s.variant,
      color: s.color,
      floor: first?.floor ?? s.homeFloor,
      zone: first?.zone ?? s.homeZone,
      onHand: locs.reduce((a, x) => a + x.qty, 0),
      reserved: sum(l.reservations, s.code, (r) => (r.status === "active" ? r.skuCode : ""), (r) => r.qty),
      incoming: sum(l.purchaseOrders, s.code, (p) => (p.status === "open" ? p.skuCode : ""), (p) => p.qty - p.qtyReceived),
      category: s.category,
      model: s.model,
      kind: s.kind,
      cap: s.cap,
      doors: s.doors,
      bays: locs.map((x) => x.slot),
      slotQty: Object.fromEntries(locs.map((x) => [x.slot, x.qty])),
      slotBatch: Object.fromEntries(locs.map((x) => [x.slot, x.batch])),
      addedAt: s.addedAt,
      icon: s.icon,
      iconStatus: s.iconStatus,
      movements: l.movements
        .filter((m) => m.skuCode === s.code)
        .slice(0, 8)
        .map((m) => movementLine(m, now)),
    } satisfies SkuRecord;
  });
}
