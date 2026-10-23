// Pure derivations from one persisted warehouse snapshot. Every quantity, position and pending
// delivery the UI, the 3D scene and Jarvis show comes from here — never from seed modules.
// A new Inventory object is built only when the snapshot revision changes, so React/R3F memos keyed
// on it recompute exactly when the ledger changed.
import { GEOMETRY_BY_ID, GEOMETRY_VERSION, slotIndex, type Rect } from "@/data/layout";
import {
  FLOOR_IDS,
  available,
  isLow,
  type CategoryId,
  type FloorId,
  type LocationSnapshot,
  type PendingReceivingSummary,
  type ProductSnapshot,
  type WarehouseInfo,
  type WarehouseSnapshot,
  type ZoneId,
} from "@/shared/contracts";

export { available, isLow };

export interface LocationView extends LocationSnapshot {
  rect: Rect;
}

export interface ProductView extends ProductSnapshot {
  categoryName: string;
  /** Actual positions holding this SKU, in floor/zone/slot order. */
  locations: LocationView[];
}

export interface ModelView {
  name: string;
  skus: ProductView[];
}

export interface CategoryView {
  id: CategoryId;
  name: string;
  models: ModelView[];
  skus: ProductView[];
}

export interface Totals {
  skus: number;
  onHand: number;
  reserved: number;
  available: number;
  /** null where incoming is not attributable (per floor: purchases have no planned destination). */
  incoming: number | null;
}

export interface Inventory {
  revision: number;
  asOf: string;
  warehouse: WarehouseInfo;
  products: ProductView[];
  bySku: ReadonlyMap<string, ProductView>;
  categories: CategoryView[];
  locations: LocationView[];
  byLocationId: ReadonlyMap<string, LocationView>;
  byFloor: Record<FloorId, LocationView[]>;
  totals: Totals;
  floorTotals: Record<FloorId, Totals & { units: number; occupied: number; bays: number }>;
  pending: PendingReceivingSummary[];
  pendingUnits: number;
}

export class GeometryMismatchError extends Error {}

const order = (a: { floor: number; zone: string; row: number; index: number }, b: typeof a) =>
  a.floor - b.floor || a.zone.localeCompare(b.zone) || slotIndex(a) - slotIndex(b);

export function buildInventory(s: WarehouseSnapshot): Inventory {
  if (s.warehouse.geometryVersion !== GEOMETRY_VERSION)
    throw new GeometryMismatchError(`Server geometry ${s.warehouse.geometryVersion} does not match this client (${GEOMETRY_VERSION}).`);
  const locations: LocationView[] = s.locations.map((l) => {
    const g = GEOMETRY_BY_ID.get(l.id);
    if (!g || g.floor !== l.floor || g.code !== l.code) throw new GeometryMismatchError(`Unknown or changed bay ${l.id}.`);
    return { ...l, rect: g.rect };
  });
  locations.sort(order);
  const byLocationId = new Map(locations.map((l) => [l.id, l]));
  const catName = new Map(s.categories.map((c) => [c.id, c.name]));

  const products: ProductView[] = s.products.map((p) => ({
    ...p,
    categoryName: catName.get(p.categoryId) ?? p.categoryId,
    locations: locations.filter((l) => l.sku === p.sku),
  }));
  const bySku = new Map(products.map((p) => [p.sku, p]));

  const categories: CategoryView[] = s.categories.map((c) => {
    const skus = products.filter((p) => p.categoryId === c.id);
    const models: ModelView[] = [];
    for (const p of skus) {
      const m = models.find((x) => x.name === p.modelName);
      if (m) m.skus.push(p);
      else models.push({ name: p.modelName, skus: [p] });
    }
    return { id: c.id, name: c.name, models, skus };
  });

  const byFloor = { 1: locations.filter((l) => l.floor === 1), 2: locations.filter((l) => l.floor === 2) } as Record<FloorId, LocationView[]>;
  const floorTotals = Object.fromEntries(
    FLOOR_IDS.map((f) => {
      const ls = byFloor[f];
      const onHand = ls.reduce((a, l) => a + l.quantity, 0);
      const reserved = ls.reduce((a, l) => a + l.reserved, 0);
      const skus = new Set(ls.filter((l) => l.sku).map((l) => l.sku)).size;
      return [f, { skus, onHand, reserved, available: onHand - reserved, incoming: null, units: onHand, occupied: ls.filter((l) => l.sku).length, bays: ls.length }];
    }),
  ) as Inventory["floorTotals"];

  return {
    revision: s.revision,
    asOf: s.asOf,
    warehouse: s.warehouse,
    products,
    bySku,
    categories,
    locations,
    byLocationId,
    byFloor,
    totals: totalsOf(products),
    floorTotals,
    pending: s.pendingReceivings,
    pendingUnits: s.pendingReceivings.reduce((a, r) => a + r.totalQuantity, 0),
  };
}

export function totalsOf(list: readonly ProductSnapshot[]): Totals {
  const t: Totals = { skus: list.length, onHand: 0, reserved: 0, available: 0, incoming: 0 };
  for (const p of list) {
    t.onHand += p.onHand;
    t.reserved += p.reserved;
    t.available += available(p);
    t.incoming = (t.incoming ?? 0) + p.incoming;
  }
  return t;
}

export const skuTitle = (p: Pick<ProductView, "modelName" | "variant">) => `${p.modelName} · ${p.variant}`;

export const matchesQuery = (p: ProductView, q: string) => `${p.sku} ${p.modelName} ${p.variant} ${p.categoryName}`.toLowerCase().includes(q);

/** Floors where the SKU actually is; a SKU with no stock falls back to its seeded home floor for navigation. */
export const floorsOf = (p: ProductView): FloorId[] =>
  p.locations.length ? [...new Set(p.locations.map((l) => l.floor))].sort() : [p.homeFloor];

/** SKUs that physically sit on a floor (or belong there for navigation when out of stock). */
export const productsOnFloor = (inv: Inventory, floor: FloorId) => inv.products.filter((p) => floorsOf(p).includes(floor));

/** Deterministic default focus: the SKU's first occupied position, else its home floor/zone. */
export function focusOf(p: ProductView): { floor: FloorId; zone: ZoneId } {
  const first = p.locations[0];
  return first ? { floor: first.floor, zone: first.zone } : { floor: p.homeFloor, zone: p.homeZone };
}

/** Categories present in a zone, most bays first. A zone may hold several categories. */
export function zoneCategories(inv: Inventory, floor: FloorId, zone: ZoneId): CategoryView[] {
  const counts = new Map<CategoryId, number>();
  for (const l of inv.byFloor[floor]) {
    if (l.zone !== zone || !l.sku) continue;
    const c = inv.bySku.get(l.sku)?.categoryId;
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => inv.categories.find((c) => c.id === id)!);
}

/** "Sofas", "Tables + Sofas", or a neutral "Mixed stock" label. */
export function zoneLabel(inv: Inventory, floor: FloorId, zone: ZoneId): string | null {
  const cats = zoneCategories(inv, floor, zone);
  if (!cats.length) return null;
  if (cats.length <= 2) return cats.map((c) => c.name).join(" + ");
  return "Mixed stock";
}

/** Runs of adjacent bays (same floor and zone, consecutive slots). Non-contiguous positions stay separate. */
export function locationRuns(locs: readonly LocationView[]): { floor: FloorId; zone: ZoneId; first: LocationView; last: LocationView; quantity: number }[] {
  const sorted = [...locs].sort(order);
  const runs: { floor: FloorId; zone: ZoneId; first: LocationView; last: LocationView; quantity: number }[] = [];
  for (const l of sorted) {
    const r = runs.at(-1);
    if (r && r.floor === l.floor && r.zone === l.zone && slotIndex(l) === slotIndex(r.last) + 1) {
      r.last = l;
      r.quantity += l.quantity;
    } else runs.push({ floor: l.floor, zone: l.zone, first: l, last: l, quantity: l.quantity });
  }
  return runs;
}

const runText = (r: ReturnType<typeof locationRuns>[number], sep: string) => (r.first === r.last ? r.first.code : `${r.first.code}${sep}${r.last.code}`);

/** Compact label for lists, e.g. "F1 · A-1-01–A-1-06, B-3-04–B-3-05". */
export function locationText(p: ProductView): string {
  if (!p.locations.length) return "No stock in any bay";
  const byFloor = new Map<FloorId, string[]>();
  for (const r of locationRuns(p.locations)) byFloor.set(r.floor, [...(byFloor.get(r.floor) ?? []), runText(r, "–")]);
  return [...byFloor].map(([f, runs]) => `F${f} · ${runs.join(", ")}`).join(" · ");
}

/** Spoken form, e.g. "Floor 1, bays A-1-01 to A-1-06 and B-3-04 to B-3-05". */
export function spokenLocations(p: ProductView): string {
  if (!p.locations.length) return "no bay currently holds it";
  const byFloor = new Map<FloorId, string[]>();
  for (const r of locationRuns(p.locations)) byFloor.set(r.floor, [...(byFloor.get(r.floor) ?? []), runText(r, " to ")]);
  const join = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0]!);
  return [...byFloor]
    .map(([f, runs]) => {
      const single = runs.length === 1 && !runs[0]!.includes(" to ");
      return `Floor ${f}, ${single ? "bay" : "bays"} ${join(runs)}`;
    })
    .join("; ");
}

/** Zones that hold the SKU, e.g. "F1 · Zones A, B". */
export function zonesText(p: ProductView): string {
  if (!p.locations.length) return `Home F${p.homeFloor} · Zone ${p.homeZone} · no stock`;
  const byFloor = new Map<FloorId, Set<ZoneId>>();
  for (const l of p.locations) byFloor.set(l.floor, (byFloor.get(l.floor) ?? new Set()).add(l.zone));
  return [...byFloor]
    .map(([f, zs]) => `Floor ${f} · ${zs.size > 1 ? "Zones" : "Zone"} ${[...zs].sort().join(", ")}`)
    .join(" · ");
}
