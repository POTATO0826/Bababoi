// Warehouse geometry, ported from WareTwin docs/layout/gen_layout.py (see docs/design-handoff.md).
// World units are metres: x along the 100 m floor, z along the 70 m floor, y up.
import type { FloorId, ZoneId } from "./catalog";

/** [x0, z0, x1, z1] */
export type Rect = readonly [number, number, number, number];

export const FLOOR_W = 100;
export const FLOOR_D = 70;
export const FLOOR_IDS: readonly FloorId[] = [1, 2];
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
export const BAY_GAP = PITCH_X - BAY_W;

/** A physical bay position. What it holds is derived from the stock ledger (./inventory). */
export interface Slot {
  id: string;
  floor: FloorId;
  zone: ZoneId;
  row: number;
  index: number;
  code: string; // {zone}-{row}-{bay:02}, e.g. A-2-03
  rect: Rect;
}

export function bayRect(zone: ZoneId, row: number, index: number): Rect {
  const [x0, z0] = ZONES[zone];
  const bx = x0 + OFFSET_X + index * PITCH_X;
  const bz = z0 + OFFSET_Z + row * PITCH_Z;
  return [bx, bz, bx + BAY_W, bz + BAY_D];
}

function slotsFor(floor: FloorId, zone: ZoneId): Slot[] {
  const out: Slot[] = [];
  for (let row = 0; row < ROWS; row++)
    for (let index = 0; index < BAYS_PER_ROW; index++)
      out.push({
        id: `${floor}${zone}${row}${index}`,
        floor,
        zone,
        row,
        index,
        code: `${zone}-${row + 1}-${String(index + 1).padStart(2, "0")}`,
        rect: bayRect(zone, row, index),
      });
  return out;
}

/** Every bay, per floor and zone, in fill order (row by row). */
export const SLOTS: Record<FloorId, Record<ZoneId, Slot[]>> = {
  1: { A: slotsFor(1, "A"), B: slotsFor(1, "B"), C: slotsFor(1, "C"), D: slotsFor(1, "D") },
  2: { A: slotsFor(2, "A"), B: slotsFor(2, "B"), C: slotsFor(2, "C"), D: slotsFor(2, "D") },
};
export const SLOT_BY_ID = new Map(
  FLOOR_IDS.flatMap((f) => ZONE_IDS.flatMap((z) => SLOTS[f][z])).map((s) => [s.id, s]),
);

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
