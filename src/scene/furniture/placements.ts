// Packs each bay's units into the bay rect. Every placement is one instance of a template.
// Input is the persisted occupancy (bay → SKU, quantity) and the pending receiving drafts from the
// current snapshot; nothing here recomputes positions from SKU totals.
import { AREAS } from "@/data/layout";
import type { Inventory, LocationView, ProductView } from "@/lib/inventory";
import type { FloorId, FurnitureKind } from "@/shared/contracts";
import type { TemplateId } from "./templates";

export interface Placement {
  tpl: TemplateId;
  x: number;
  y: number;
  z: number;
  ry: number;
  scale?: readonly [number, number, number];
  /** Material colour (hex). */
  color: string;
  /** Bay id, or "pending" for the receiving-dock delivery. */
  owner: string;
}

/** Deterministic 0..1 noise so the stock looks hand-placed without changing between renders. */
function hash(s: string, i: number) {
  let h = 2166136261 ^ i;
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

interface Grid {
  tpl: TemplateId;
  cols: number;
  rows: number;
  px: number;
  pz: number;
}

const GRIDS: Partial<Record<FurnitureKind, Grid>> = {
  sofa: { tpl: "sofa", cols: 2, rows: 2, px: 2.8, pz: 1.2 },
  recliner: { tpl: "recliner", cols: 2, rows: 2, px: 2.4, pz: 1.2 },
  sofaL: { tpl: "sofaL", cols: 2, rows: 1, px: 2.8, pz: 0 },
  table: { tpl: "table", cols: 3, rows: 1, px: 1.85, pz: 0 },
  glass: { tpl: "glass", cols: 3, rows: 1, px: 1.85, pz: 0 },
  tableRound: { tpl: "tableRound", cols: 3, rows: 1, px: 1.85, pz: 0 },
  coffee: { tpl: "coffee", cols: 3, rows: 1, px: 1.85, pz: 0 },
  side: { tpl: "side", cols: 3, rows: 1, px: 1.85, pz: 0 },
  console: { tpl: "console", cols: 3, rows: 1, px: 1.85, pz: 0 },
  desk: { tpl: "desk", cols: 3, rows: 1, px: 1.85, pz: 0 },
  chair: { tpl: "chair", cols: 3, rows: 2, px: 1.85, pz: 1.15 },
  kids: { tpl: "kids", cols: 3, rows: 2, px: 1.85, pz: 1.15 },
  stool: { tpl: "stool", cols: 3, rows: 2, px: 1.85, pz: 1.15 },
  armchair: { tpl: "armchair", cols: 3, rows: 2, px: 1.85, pz: 1.15 },
  office: { tpl: "office", cols: 3, rows: 2, px: 1.85, pz: 1.15 },
  lounge: { tpl: "lounge", cols: 3, rows: 2, px: 1.85, pz: 1.15 },
  rocking: { tpl: "rocking", cols: 3, rows: 2, px: 1.85, pz: 1.15 },
  cabinet: { tpl: "cabinet", cols: 2, rows: 1, px: 2.7, pz: 0 },
  bed: { tpl: "bed", cols: 2, rows: 1, px: 2.75, pz: 0 },
  bedSingle: { tpl: "bedSingle", cols: 2, rows: 1, px: 2.75, pz: 0 },
  bunk: { tpl: "bunk", cols: 2, rows: 1, px: 2.75, pz: 0 },
  daybed: { tpl: "daybed", cols: 2, rows: 1, px: 2.75, pz: 0 },
  lamp: { tpl: "lamp", cols: 5, rows: 1, px: 1.0, pz: 0 },
};

const PALLET_H = 0.122;

function placeBay(bay: LocationView, s: ProductView): Placement[] {
  const n = bay.quantity;
  const [x0, z0, x1, z1] = bay.rect;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const out: Placement[] = [];
  const add = (tpl: TemplateId, x: number, y: number, z: number, jitter = 1, scale?: readonly [number, number, number], color = s.color) => {
    const k = out.length;
    out.push({
      tpl,
      x: x + (hash(bay.id, k * 3) - 0.5) * 0.06 * jitter,
      y,
      z: z + (hash(bay.id, k * 3 + 1) - 0.5) * 0.06 * jitter,
      ry: (hash(bay.id, k * 3 + 2) - 0.5) * 0.05 * jitter,
      scale,
      color,
      owner: bay.id,
    });
  };

  const kind = s.kind === "wardrobe" ? null : s.kind;
  const grid = kind ? GRIDS[kind] : undefined;
  if (grid) {
    for (let i = 0; i < Math.min(n, grid.cols * grid.rows); i++) {
      const col = i % grid.cols;
      const row = Math.floor(i / grid.cols);
      add(grid.tpl, cx + (col - (grid.cols - 1) / 2) * grid.px, 0, cz + (row - (grid.rows - 1) / 2) * grid.pz);
    }
    return out;
  }

  switch (s.kind) {
    case "wardrobe": {
      const tpl: TemplateId = s.doors >= 3 ? "wardrobe3" : "wardrobe2";
      for (let i = 0; i < Math.min(n, 2); i++) add(tpl, cx + (i - 0.5) * 2.7, 0, cz, 0.5);
      break;
    }
    case "mattress": {
      const stacks = n > 3 ? 2 : 1;
      for (let j = 0; j < stacks; j++) {
        const sx = stacks === 1 ? cx : cx + (j - 0.5) * 2.7;
        add("pallet", sx, 0, cz, 0.6, [2.1 / 1.2, 1, 1.7 / 1.0], "#000000");
        const count = Math.ceil((n - j) / stacks);
        for (let k = 0; k < count; k++) add("mattress", sx, PALLET_H + k * 0.26, cz, 0.25);
      }
      break;
    }
    case "rug": {
      const bottom = Math.min(n, 3);
      for (let i = 0; i < bottom; i++) add("rugRoll", cx, 0, cz + (i - (bottom - 1) / 2) * 0.42, 0.4);
      const top = Math.min(Math.max(n - 3, 0), 2);
      for (let j = 0; j < top; j++) add("rugRoll", cx + 0.05, 0.345, cz + (j - (top - 1) / 2) * 0.42, 0.4);
      break;
    }
    case "mirror": {
      const pallets = n > 3 ? 2 : 1;
      for (let j = 0; j < pallets; j++) {
        const px = pallets === 1 ? cx : cx + (j - 0.5) * 2.4;
        add("pallet", px, 0, cz, 0.5, undefined, "#000000");
        const count = Math.ceil((n - j) / pallets);
        for (let k = 0; k < count; k++) add("mirrorCrate", px, PALLET_H, cz + (k - (count - 1) / 2) * 0.17, 0.15);
      }
      break;
    }
    default: {
      // Cartons on pallets: up to three on the floor, two more stacked on top.
      const bottom = Math.min(n, 3);
      for (let i = 0; i < bottom; i++) {
        const x = cx + (i - 1) * 1.85;
        add("pallet", x, 0, cz, 0.5, [1.55 / 1.2, 1, 1.4 / 1.0], "#000000");
        add("carton", x, PALLET_H, cz, 0.4);
      }
      const top = Math.min(Math.max(n - 3, 0), 2);
      for (let j = 0; j < top; j++) add("cartonTop", cx + (j - 1) * 1.85, PALLET_H + 1.0, cz, 0.5);
    }
  }
  return out;
}

/** Wrapped units drawn in the inbound dock at most; the hover card always states the exact total. */
export const MAX_PENDING_MESHES = 8;

/** Receiving drafts not yet posted: wrapped units waiting in the inbound dock, not on hand. */
function pendingDelivery(units: number): Placement[] {
  const n = Math.min(units, MAX_PENDING_MESHES);
  const [x0, , x1] = AREAS.inbound;
  const mid = (x0 + x1) / 2;
  return Array.from({ length: n }, (_, i) => ({
    tpl: "wrapped" as const,
    x: mid + (i - (n - 1) / 2) * 3.0,
    y: 0,
    z: 4.1 + (i % 2) * 0.25,
    ry: (hash("pending", i) - 0.5) * 0.08,
    color: "#000000",
    owner: "pending",
  }));
}

/** Footprint of the pending units in the dock, or null when nothing is pending. */
export function pendingRect(units: number) {
  if (units <= 0) return null;
  const xs = pendingDelivery(units).map((p) => p.x);
  return [Math.min(...xs) - 1.6, 3.3, Math.max(...xs) + 1.6, 5.2] as const;
}

export function placementsFor(floor: FloorId, inv: Inventory): Placement[] {
  const out: Placement[] = [];
  for (const bay of inv.byFloor[floor]) {
    if (!bay.sku || bay.quantity <= 0) continue;
    const product = inv.bySku.get(bay.sku);
    if (product) out.push(...placeBay(bay, product));
  }
  // The inbound dock is on floor 1.
  if (floor === 1) out.push(...pendingDelivery(inv.pendingUnits));
  return out;
}
