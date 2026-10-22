// Warehouse geometry, ported from WareTwin docs/layout/gen_layout.py (see docs/design-handoff.md).
// World units are metres: x along the 100 m floor, z along the 70 m floor, y up.
import { SKUS, type FloorId, type Sku, type ZoneId } from "./catalog";

/** [x0, z0, x1, z1] */
export type Rect = readonly [number, number, number, number];

export const FLOOR_W = 100;
export const FLOOR_D = 70;
export const FLOOR_CENTER = [FLOOR_W / 2, FLOOR_D / 2] as const;
export const ZONE_IDS: readonly ZoneId[] = ["A", "B", "C", "D"];

export const ZONES: Record<ZoneId, Rect> = {
  A: [4, 10, 46, 32],
  B: [54, 10, 96, 32],
  C: [4, 38, 46, 62],
  D: [54, 38, 96, 62],
};

export const AREAS = {
  walkway: [0, 8, 100, 10],
  centralAisle: [46, 10, 54, 62],
  crossAisle: [0, 32, 100, 38],
  inbound: [20, 0, 46, 8],
  outbound: [54, 0, 80, 8],
  inboundLine: [20, 7.6, 46, 8],
  outboundLine: [54, 7.6, 80, 8],
  staging: [40, 63, 60, 68],
} satisfies Record<string, Rect>;

export const LIFTS: readonly Rect[] = [
  [49.4, 42.4, 52.6, 45.6],
  [49.4, 54.4, 52.6, 57.6],
];
export const LIFT_H = 3;

const ROWS = 3;
const BAYS_PER_ROW = 6;
export const BAY_W = 5.8;
export const BAY_D = 2.6;
const PITCH_X = 6.9;
const PITCH_Z = 7;
const OFFSET_X = 0.9;
const OFFSET_Z = 2.5;

export interface Bay {
  id: string;
  floor: FloorId;
  zone: ZoneId;
  row: number;
  index: number;
  code: string; // {zone}-{row}-{bay:02}, e.g. A-2-03
  rect: Rect;
  sku: Sku | null;
  qty: number;
}

export function bayRect(zone: ZoneId, row: number, index: number): Rect {
  const [x0, z0] = ZONES[zone];
  const bx = x0 + OFFSET_X + index * PITCH_X;
  const bz = z0 + OFFSET_Z + row * PITCH_Z;
  return [bx, bz, bx + BAY_W, bz + BAY_D];
}

/** SKUs fill bays in order, `min(cap, remaining)` units per bay. */
function buildBays(floor: FloorId): Bay[] {
  const out: Bay[] = [];
  for (const zone of ZONE_IDS) {
    const slots: [number, number][] = [];
    for (let r = 0; r < ROWS; r++) for (let b = 0; b < BAYS_PER_ROW; b++) slots.push([r, b]);
    let i = 0;
    const make = (row: number, index: number, sku: Sku | null, qty: number): Bay => ({
      id: `${floor}${zone}${row}${index}`,
      floor,
      zone,
      row,
      index,
      code: `${zone}-${row + 1}-${String(index + 1).padStart(2, "0")}`,
      rect: bayRect(zone, row, index),
      sku,
      qty,
    });
    for (const s of SKUS.filter((x) => x.floor === floor && x.zone === zone)) {
      let remaining = s.onHand;
      while (remaining > 0 && i < slots.length) {
        const qty = Math.min(s.cap, remaining);
        const [r, b] = slots[i++]!;
        out.push(make(r, b, s, qty));
        remaining -= qty;
      }
    }
    while (i < slots.length) {
      const [r, b] = slots[i++]!;
      out.push(make(r, b, null, 0));
    }
  }
  return out;
}

export const BAYS: Record<FloorId, Bay[]> = { 1: buildBays(1), 2: buildBays(2) };

export interface RackRow {
  zone: ZoneId;
  row: number;
  /** Span of the whole row of bays. */
  rect: Rect;
}

export const RACK_ROWS: readonly RackRow[] = ZONE_IDS.flatMap((zone) =>
  Array.from({ length: ROWS }, (_, row) => {
    const first = bayRect(zone, row, 0);
    const last = bayRect(zone, row, BAYS_PER_ROW - 1);
    return { zone, row, rect: [first[0], first[1], last[2], last[3]] as Rect };
  }),
);
export const BAY_GAP = PITCH_X - BAY_W;

export function codesFor(s: Sku): { code: string; qty: number }[] {
  return BAYS[s.floor].filter((b) => b.sku === s).map((b) => ({ code: b.code, qty: b.qty }));
}

export function locationText(s: Sku) {
  const codes = codesFor(s);
  const span = codes.length
    ? codes[0]!.code + (codes.length > 1 ? ` – ${codes[codes.length - 1]!.code}` : "")
    : "—";
  return `F${s.floor} · Zone ${s.zone} · ${span}`;
}
