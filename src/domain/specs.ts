// Synthetic packed sizes, weights and price guidance per furniture shape.
// Measure real goods before using these for a booking — they only make the demo's vehicle checks meaningful.
import type { FurnitureKind } from "../data/catalog";
import { sen } from "./money";
import type { Package, Price } from "./types";

const p = (lCm: number, wCm: number, hCm: number, kg: number): Package => ({ lCm, wCm, hCm, kg });
const price = (list: number, clearance: number, cost: number): Price => ({
  listSen: sen(list),
  clearanceSen: sen(clearance),
  unitCostSen: sen(cost),
});

/** Packages that make up ONE unit of each shape. */
const PACKAGES: Record<FurnitureKind, Package[]> = {
  sofa: [p(220, 95, 85, 60)],
  sofaL: [p(210, 100, 90, 55), p(170, 100, 90, 45)],
  recliner: [p(200, 95, 100, 70)],
  table: [p(200, 100, 25, 45)],
  tableRound: [p(125, 125, 20, 30)],
  coffee: [p(120, 65, 45, 20)],
  side: [p(50, 50, 55, 8)],
  console: [p(140, 40, 80, 25)],
  desk: [p(145, 75, 20, 30)],
  glass: [p(185, 95, 20, 45)],
  chair: [p(55, 50, 95, 7)],
  stool: [p(45, 45, 80, 6)],
  armchair: [p(85, 85, 85, 25)],
  office: [p(70, 65, 60, 15)],
  lounge: [p(90, 85, 80, 28)],
  rocking: [p(100, 65, 100, 18)],
  kids: [p(40, 40, 60, 3)],
  wardrobe: [p(205, 65, 30, 80)],
  cabinet: [p(95, 45, 100, 35)],
  bed: [p(210, 165, 30, 70)],
  bedSingle: [p(200, 100, 25, 40)],
  bunk: [p(205, 105, 30, 75)],
  daybed: [p(200, 90, 80, 30)],
  mattress: [p(200, 160, 30, 30)],
  rug: [p(160, 35, 35, 25)],
  lamp: [p(175, 35, 35, 8)],
  carton: [p(60, 40, 40, 12)],
  mirror: [p(95, 95, 10, 12)],
};

const PRICES: Record<FurnitureKind, Price> = {
  sofa: price(999, 500, 520),
  sofaL: price(1299, 600, 700),
  recliner: price(1499, 780, 800),
  table: price(699, 360, 380),
  tableRound: price(599, 300, 310),
  coffee: price(299, 150, 140),
  side: price(149, 75, 60),
  console: price(399, 200, 190),
  desk: price(459, 230, 220),
  glass: price(799, 400, 420),
  chair: price(129, 65, 60),
  stool: price(119, 60, 50),
  armchair: price(549, 280, 270),
  office: price(399, 200, 180),
  lounge: price(899, 450, 430),
  rocking: price(459, 230, 210),
  kids: price(69, 35, 28),
  wardrobe: price(799, 400, 420),
  cabinet: price(459, 230, 210),
  bed: price(899, 450, 460),
  bedSingle: price(499, 250, 230),
  bunk: price(899, 450, 450),
  daybed: price(799, 400, 380),
  mattress: price(699, 350, 330),
  rug: price(599, 300, 260),
  lamp: price(249, 125, 100),
  carton: price(59, 30, 25),
  mirror: price(299, 150, 120),
};

export const packagesFor = (kind: FurnitureKind, doors = 2): Package[] =>
  kind === "wardrobe" && doors >= 3 ? [p(205, 65, 35, 110)] : PACKAGES[kind];

export const priceFor = (kind: FurnitureKind): Price => PRICES[kind];

export const unitWeight = (packages: readonly Package[]) => packages.reduce((a, x) => a + x.kg, 0);
