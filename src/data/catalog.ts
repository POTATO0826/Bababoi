// Synthetic seed data from the WareOrb prototype (docs/design-handoff.md → Data model).
// The stock ledger is the source of truth; the 3D scene only visualises it.

export type FloorId = 1 | 2;
export type ZoneId = "A" | "B" | "C" | "D";
export type CategoryId = "sofas" | "tables" | "chairs" | "wardrobes" | "beds" | "general";

/** Furniture template used by the 3D scene. Each kind has its own mesh and bay packing. */
export type FurnitureKind =
  | "sofa"
  | "sofaL"
  | "recliner"
  | "table"
  | "tableRound"
  | "coffee"
  | "side"
  | "console"
  | "desk"
  | "glass"
  | "chair"
  | "stool"
  | "armchair"
  | "office"
  | "lounge"
  | "rocking"
  | "kids"
  | "wardrobe"
  | "cabinet"
  | "bed"
  | "bedSingle"
  | "bunk"
  | "daybed"
  | "mattress"
  | "rug"
  | "lamp"
  | "carton"
  | "mirror";

interface SkuSeed {
  sku: string; // CATEGORY-MANUFACTURER-MODEL
  variant: string;
  color: string; // material hex — drives the 3D model and the swatch
  floor: FloorId;
  zone: ZoneId;
  onHand: number;
  reserved: number;
  incoming: number;
}

interface ModelSeed {
  name: string;
  kind?: FurnitureKind;
  cap?: number;
  doors?: number;
  skus: SkuSeed[];
}

interface CategorySeed {
  id: CategoryId;
  name: string;
  cap: number;
  kind: FurnitureKind;
  models: ModelSeed[];
}

const SEED: CategorySeed[] = [
  {
    id: "sofas", name: "Sofas", cap: 4, kind: "sofa",
    models: [
      { name: "L-Shaped Sofa", kind: "sofaL", cap: 2, skus: [
        { sku: "SOFA-HAVN-2140", variant: "Grey", color: "#8b8f98", floor: 1, zone: "A", onHand: 12, reserved: 5, incoming: 4 },
        { sku: "SOFA-HAVN-2141", variant: "Beige", color: "#c7b59a", floor: 1, zone: "A", onHand: 8, reserved: 2, incoming: 0 },
      ] },
      { name: "3-Seater Sofa", skus: [
        { sku: "SOFA-NORDE-3300", variant: "Navy", color: "#44557a", floor: 1, zone: "A", onHand: 12, reserved: 3, incoming: 0 },
        { sku: "SOFA-NORDE-3301", variant: "Oatmeal", color: "#d8cdb8", floor: 1, zone: "A", onHand: 8, reserved: 2, incoming: 6 },
      ] },
      { name: "Recliner Sofa", kind: "recliner", skus: [
        { sku: "SOFA-KIRA-7700", variant: "Black leather", color: "#34343a", floor: 1, zone: "A", onHand: 8, reserved: 4, incoming: 0 },
        { sku: "SOFA-KIRA-7701", variant: "Tan leather", color: "#a8743f", floor: 1, zone: "A", onHand: 4, reserved: 1, incoming: 2 },
      ] },
    ],
  },
  {
    id: "tables", name: "Tables", cap: 3, kind: "table",
    models: [
      { name: "Oak Extendable", skus: [
        { sku: "TABLE-LUMA-1860", variant: "6 seats", color: "#b48c5c", floor: 1, zone: "B", onHand: 12, reserved: 2, incoming: 0 },
        { sku: "TABLE-LUMA-1880", variant: "8 seats", color: "#b48c5c", floor: 1, zone: "B", onHand: 9, reserved: 6, incoming: 4 },
      ] },
      { name: "Round Walnut", kind: "tableRound", skus: [{ sku: "TABLE-OSTA-1200", variant: "Ø 120 cm", color: "#6e4b34", floor: 1, zone: "B", onHand: 9, reserved: 1, incoming: 0 }] },
      { name: "Marble Top", skus: [{ sku: "TABLE-VELA-2000", variant: "White marble", color: "#e4e2dc", floor: 1, zone: "B", onHand: 6, reserved: 3, incoming: 0 }] },
      { name: "Pine Farmhouse", skus: [{ sku: "TABLE-BRUN-2200", variant: "220 cm", color: "#d2b48c", floor: 1, zone: "B", onHand: 9, reserved: 2, incoming: 0 }] },
      { name: "Glass Top", kind: "glass", skus: [{ sku: "TABLE-VELA-1800", variant: "180 cm", color: "#a9cfe0", floor: 2, zone: "D", onHand: 12, reserved: 2, incoming: 0 }] },
      { name: "Coffee Table", kind: "coffee", skus: [{ sku: "TABLE-LUMA-0900", variant: "Oak", color: "#b48c5c", floor: 2, zone: "D", onHand: 12, reserved: 4, incoming: 0 }] },
      { name: "Side Table", kind: "side", skus: [{ sku: "TABLE-VELA-0450", variant: "Marble", color: "#e4e2dc", floor: 2, zone: "D", onHand: 12, reserved: 1, incoming: 6 }] },
      { name: "Console Table", kind: "console", skus: [{ sku: "TABLE-OSTA-1400", variant: "Walnut", color: "#6e4b34", floor: 2, zone: "D", onHand: 9, reserved: 2, incoming: 0 }] },
      { name: "Desk 140", kind: "desk", skus: [{ sku: "TABLE-TEKO-1400", variant: "White", color: "#dcdce0", floor: 2, zone: "D", onHand: 9, reserved: 6, incoming: 0 }] },
    ],
  },
  {
    id: "chairs", name: "Chairs", cap: 6, kind: "chair",
    models: [
      { name: "Dining Chair", skus: [
        { sku: "CHAIR-LUMA-0410", variant: "Oak", color: "#b48c5c", floor: 1, zone: "C", onHand: 36, reserved: 12, incoming: 0 },
        { sku: "CHAIR-LUMA-0411", variant: "Black", color: "#303036", floor: 1, zone: "C", onHand: 30, reserved: 6, incoming: 16 },
        { sku: "CHAIR-OSTA-0420", variant: "Walnut", color: "#6e4b34", floor: 1, zone: "C", onHand: 18, reserved: 4, incoming: 0 },
      ] },
      { name: "Bar Stool", kind: "stool", skus: [{ sku: "CHAIR-BRUN-0750", variant: "Oak · 75 cm", color: "#c49a63", floor: 1, zone: "C", onHand: 24, reserved: 8, incoming: 0 }] },
      { name: "Armchair Bouclé", kind: "armchair", skus: [{ sku: "CHAIR-HAVN-0880", variant: "Ivory", color: "#e6e1d6", floor: 2, zone: "C", onHand: 18, reserved: 5, incoming: 0 }] },
      { name: "Office Chair", kind: "office", skus: [{ sku: "CHAIR-TEKO-0500", variant: "Mesh", color: "#4a4f5a", floor: 2, zone: "C", onHand: 18, reserved: 2, incoming: 0 }] },
      { name: "Lounge Chair", kind: "lounge", skus: [{ sku: "CHAIR-KIRA-0910", variant: "Cognac leather", color: "#9a5a2e", floor: 2, zone: "C", onHand: 12, reserved: 9, incoming: 6 }] },
      { name: "Rocking Chair", kind: "rocking", skus: [{ sku: "CHAIR-BRUN-0620", variant: "Oak", color: "#b48c5c", floor: 2, zone: "C", onHand: 12, reserved: 3, incoming: 0 }] },
      { name: "Kids Chair", kind: "kids", skus: [{ sku: "CHAIR-NORDE-0300", variant: "Pastel set", color: "#c9d8c2", floor: 2, zone: "C", onHand: 24, reserved: 6, incoming: 0 }] },
      { name: "Folding Chair", skus: [{ sku: "CHAIR-TEKO-0200", variant: "Black", color: "#303036", floor: 2, zone: "C", onHand: 24, reserved: 0, incoming: 24 }] },
    ],
  },
  {
    id: "wardrobes", name: "Wardrobes", cap: 2, kind: "wardrobe",
    models: [
      { name: "2-Door Wardrobe", doors: 2, skus: [{ sku: "WARD-NORDE-1200", variant: "White", color: "#dcdce0", floor: 1, zone: "D", onHand: 10, reserved: 2, incoming: 0 }] },
      { name: "3-Door Wardrobe", doors: 3, skus: [{ sku: "WARD-LUMA-1800", variant: "Oak", color: "#b08458", floor: 1, zone: "D", onHand: 8, reserved: 5, incoming: 3 }] },
      { name: "Sliding Mirror", doors: 2, skus: [{ sku: "WARD-VELA-2000", variant: "Mirror", color: "#b7c6d4", floor: 1, zone: "D", onHand: 6, reserved: 4, incoming: 0 }] },
      { name: "Walk-in Module", doors: 3, skus: [{ sku: "WARD-TEKO-2400", variant: "Graphite", color: "#5a5d66", floor: 1, zone: "D", onHand: 6, reserved: 1, incoming: 0 }] },
      { name: "Hallway Cabinet", kind: "cabinet", doors: 2, skus: [{ sku: "WARD-BRUN-0900", variant: "Pine", color: "#d2b48c", floor: 1, zone: "D", onHand: 6, reserved: 2, incoming: 2 }] },
    ],
  },
  {
    id: "beds", name: "Beds", cap: 2, kind: "bed",
    models: [
      { name: "Queen Platform", skus: [{ sku: "BED-LUMA-1600", variant: "Oak", color: "#b48c5c", floor: 2, zone: "A", onHand: 8, reserved: 3, incoming: 0 }] },
      { name: "King Upholstered", skus: [{ sku: "BED-HAVN-1800", variant: "Grey", color: "#7c8089", floor: 2, zone: "A", onHand: 6, reserved: 3, incoming: 4 }] },
      { name: "Single Pine", kind: "bedSingle", skus: [{ sku: "BED-BRUN-0900", variant: "Pine", color: "#d2b48c", floor: 2, zone: "A", onHand: 10, reserved: 1, incoming: 0 }] },
      { name: "Bunk Bed", kind: "bunk", skus: [{ sku: "BED-NORDE-0902", variant: "White", color: "#dcdce0", floor: 2, zone: "A", onHand: 6, reserved: 2, incoming: 0 }] },
      { name: "Day Bed", kind: "daybed", skus: [{ sku: "BED-OSTA-0800", variant: "Rattan", color: "#c9a86a", floor: 2, zone: "A", onHand: 4, reserved: 1, incoming: 2 }] },
    ],
  },
  {
    id: "general", name: "General stock", cap: 5, kind: "carton",
    models: [
      { name: "Mattress", kind: "mattress", skus: [{ sku: "MATT-HAVN-1600", variant: "Queen medium", color: "#e9e8e2", floor: 2, zone: "B", onHand: 15, reserved: 4, incoming: 0 }] },
      { name: "Rug", kind: "rug", skus: [{ sku: "RUG-OSTA-2030", variant: "200 × 300 wool", color: "#b9a48a", floor: 2, zone: "B", onHand: 15, reserved: 0, incoming: 0 }] },
      { name: "Floor Lamp", kind: "lamp", skus: [{ sku: "LAMP-VELA-1500", variant: "Brass", color: "#c8a35a", floor: 2, zone: "B", onHand: 10, reserved: 1, incoming: 0 }] },
      { name: "Hardware Kit", skus: [{ sku: "HDWR-TEKO-0001", variant: "Standard", color: "#b5895e", floor: 2, zone: "B", onHand: 10, reserved: 0, incoming: 20 }] },
      { name: "Cushion Set", skus: [{ sku: "CUSH-HAVN-0404", variant: "Set of 4", color: "#b5895e", floor: 2, zone: "B", onHand: 15, reserved: 3, incoming: 0 }] },
      { name: "Bedding Set", skus: [{ sku: "BEDD-NORDE-1600", variant: "Queen", color: "#b5895e", floor: 2, zone: "B", onHand: 15, reserved: 5, incoming: 0 }] },
      { name: "Wall Mirror", kind: "mirror", skus: [{ sku: "MIRR-VELA-0900", variant: "Ø 90 cm", color: "#b7c6d4", floor: 2, zone: "B", onHand: 10, reserved: 2, incoming: 0 }] },
    ],
  },
];

export interface Category {
  id: CategoryId;
  name: string;
  models: Model[];
  skus: Sku[];
}

export interface Model {
  name: string;
  category: Category;
  doors: number;
  skus: Sku[];
}

export interface Sku extends SkuSeed {
  category: Category;
  model: Model;
  kind: FurnitureKind;
  /** Max units stored per bay. */
  cap: number;
}

function build(): { categories: Category[]; skus: Sku[] } {
  const categories: Category[] = [];
  const skus: Sku[] = [];
  for (const c of SEED) {
    const category: Category = { id: c.id, name: c.name, models: [], skus: [] };
    for (const m of c.models) {
      const model: Model = { name: m.name, category, doors: m.doors ?? 2, skus: [] };
      for (const s of m.skus) {
        const sku: Sku = { ...s, category, model, kind: m.kind ?? c.kind, cap: m.cap ?? c.cap };
        model.skus.push(sku);
        category.skus.push(sku);
        skus.push(sku);
      }
      category.models.push(model);
    }
    categories.push(category);
  }
  return { categories, skus };
}

export const { categories: CATEGORIES, skus: SKUS } = build();
export const SKU_BY_CODE = new Map(SKUS.map((s) => [s.sku, s]));

export const DEMO_SKU = "SOFA-HAVN-2140";

/** The one supplier note still awaiting human verification (concept §5). */
export const PENDING_NOTE = { id: "DN-2291", sku: DEMO_SKU, qty: 4 } as const;

export const available = (s: Pick<Sku, "onHand" | "reserved">) => s.onHand - s.reserved;
export const isLow = (s: Sku, threshold: number) => available(s) <= threshold;
export const skuTitle = (s: Sku) => `${s.model.name} · ${s.variant}`;

export interface Totals {
  skus: number;
  onHand: number;
  reserved: number;
  available: number;
  incoming: number;
}

export function totals(list: readonly Sku[]): Totals {
  const t: Totals = { skus: list.length, onHand: 0, reserved: 0, available: 0, incoming: 0 };
  for (const s of list) {
    t.onHand += s.onHand;
    t.reserved += s.reserved;
    t.available += available(s);
    t.incoming += s.incoming;
  }
  return t;
}

export const skusOnFloor = (floor: FloorId) => SKUS.filter((s) => s.floor === floor);

/** The category stored in a zone (each zone holds one category per floor). */
export function zoneCategory(floor: FloorId, zone: ZoneId): Category | null {
  return SKUS.find((s) => s.floor === floor && s.zone === zone)?.category ?? null;
}

export function matchesQuery(s: Sku, q: string) {
  return `${s.sku} ${s.model.name} ${s.variant} ${s.category.name}`.toLowerCase().includes(q);
}

interface HistoryRow {
  t: string;
  text: string;
  d: string;
}

const HISTORY: Record<string, HistoryRow[]> = {
  "SOFA-HAVN-2140": [
    { t: "09:12", text: "Received · DN-2291", d: "+4" },
    { t: "Yesterday", text: "Reserved · Booking B-1180", d: "−2" },
    { t: "Mon", text: "Dispatched · Order O-5531", d: "−1" },
  ],
};

export function historyFor(s: Sku): HistoryRow[] {
  return (
    HISTORY[s.sku] ?? [
      { t: "Today", text: `Reserved · Booking B-${1100 + s.onHand * 7}`, d: `−${Math.min(s.reserved, 2)}` },
      { t: "Tue", text: `Received · DN-${2200 + s.onHand * 3}`, d: `+${Math.min(s.onHand, s.cap)}` },
      { t: "Last week", text: "Count verified · J. Lim", d: "0" },
    ]
  );
}
