// Warehouse geometry, ported from WareTwin docs/layout/gen_layout.py (see docs/design-handoff.md).
// World units are metres: x along the 100 m floor, z along the 70 m floor, y up.
// Geometry is immutable for this version. Which SKU sits in which bay is persisted stock state,
// read from GET /api/warehouse — it is never recomputed here from SKU totals.
import { FLOOR_IDS, ZONE_IDS as ZONES_ORDER, type FloorId, type ZoneId } from "@/shared/contracts";

/** Bumped whenever bay IDs, codes or rectangles change; the server stores the version it was seeded with. */
export const GEOMETRY_VERSION = "waretwin-gen-layout-v1";

/** [x0, z0, x1, z1] */
export type Rect = readonly [number, number, number, number];

export const FLOOR_W = 100;
export const FLOOR_D = 70;
export const FLOOR_CENTER = [FLOOR_W / 2, FLOOR_D / 2] as const;
export const ZONE_IDS: readonly ZoneId[] = ZONES_ORDER;

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

/** A storage bay (location). `id` is the stable legacy bay ID, e.g. "1B23"; `code` repeats across floors. */
export interface BayGeometry {
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

export const bayId = (floor: FloorId, zone: ZoneId, row: number, index: number) => `${floor}${zone}${row}${index}`;
export const bayCode = (zone: ZoneId, row: number, index: number) => `${zone}-${row + 1}-${String(index + 1).padStart(2, "0")}`;

/** All 144 bays in fill order: floor, zone, row, index. */
export const LOCATION_GEOMETRY: readonly BayGeometry[] = FLOOR_IDS.flatMap((floor) =>
  ZONE_IDS.flatMap((zone) =>
    Array.from({ length: ROWS * BAYS_PER_ROW }, (_, i) => {
      const row = Math.floor(i / BAYS_PER_ROW);
      const index = i % BAYS_PER_ROW;
      return { id: bayId(floor, zone, row, index), floor, zone, row, index, code: bayCode(zone, row, index), rect: bayRect(zone, row, index) };
    }),
  ),
);

export const GEOMETRY_BY_ID: ReadonlyMap<string, BayGeometry> = new Map(LOCATION_GEOMETRY.map((b) => [b.id, b]));

/** Position of a bay in its zone's fill order (row-major); consecutive slots are adjacent bays. */
export const slotIndex = (b: { row: number; index: number }) => b.row * BAYS_PER_ROW + b.index;

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
