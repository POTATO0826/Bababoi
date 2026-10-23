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

/** One stock movement recorded in this session (newest first in `SkuRecord.movements`). */
export interface Movement {
  t: string;
  text: string;
  d: string;
}

/**
 * The persisted stock ledger row. Everything else (categories, models, bay contents)
 * is derived from the list of records — see `deriveInventory` in ./inventory.
 */
export interface SkuRecord {
  sku: string;
  variant: string;
  color: string;
  floor: FloorId;
  zone: ZoneId;
  onHand: number;
  reserved: number;
  incoming: number;
  category: CategoryId;
  model: string;
  kind: FurnitureKind;
  /** Max units stored per bay. */
  cap: number;
  doors: number;
  /** Bay ids allocated to this SKU, in fill order. */
  bays: string[];
  /** Units per bay when known (from the batch ledger); otherwise bays fill `cap` units in order. */
  slotQty?: Record<string, number>;
  /** Batch id per bay (from the batch ledger). */
  slotBatch?: Record<string, string>;
  /** Set on models received through the "New arrivals" flow. */
  addedAt?: number;
  /** AI-generated SVG icon markup. */
  icon?: string;
  iconStatus?: "pending" | "ready" | "failed" | "unavailable";
  movements?: Movement[];
}

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

export interface Sku extends Omit<SkuRecord, "category" | "model"> {
  category: Category;
  model: Model;
}

export interface CategoryInfo {
  id: CategoryId;
  name: string;
  cap: number;
  /** SKU prefix for new models (general stock uses the shape's prefix). */
  prefix: string;
}

export const CATEGORY_INFO: readonly CategoryInfo[] = SEED.map((c) => ({
  id: c.id,
  name: c.name,
  cap: c.cap,
  prefix: { sofas: "SOFA", tables: "TABLE", chairs: "CHAIR", wardrobes: "WARD", beds: "BED", general: "GEN" }[c.id],
}));

export interface ShapeOption {
  value: string;
  label: string;
  kind: FurnitureKind;
  doors?: number;
  cap?: number;
  prefix?: string;
}

/** 3D shapes a new model can use, per category. */
export const SHAPES: Record<CategoryId, ShapeOption[]> = {
  sofas: [
    { value: "sofa", label: "3-seater sofa", kind: "sofa" },
    { value: "sofaL", label: "L-shaped sofa", kind: "sofaL", cap: 2 },
    { value: "recliner", label: "Recliner sofa", kind: "recliner" },
  ],
  tables: [
    { value: "table", label: "Dining table", kind: "table" },
    { value: "tableRound", label: "Round table", kind: "tableRound" },
    { value: "coffee", label: "Coffee table", kind: "coffee" },
    { value: "side", label: "Side table", kind: "side" },
    { value: "console", label: "Console table", kind: "console" },
    { value: "desk", label: "Desk", kind: "desk" },
    { value: "glass", label: "Glass-top table", kind: "glass" },
  ],
  chairs: [
    { value: "chair", label: "Dining chair", kind: "chair" },
    { value: "stool", label: "Bar stool", kind: "stool" },
    { value: "armchair", label: "Armchair", kind: "armchair" },
    { value: "office", label: "Office chair", kind: "office" },
    { value: "lounge", label: "Lounge chair", kind: "lounge" },
    { value: "rocking", label: "Rocking chair", kind: "rocking" },
    { value: "kids", label: "Kids chair", kind: "kids" },
  ],
  wardrobes: [
    { value: "wardrobe-2", label: "2-door wardrobe", kind: "wardrobe", doors: 2 },
    { value: "wardrobe-3", label: "3-door wardrobe", kind: "wardrobe", doors: 3 },
    { value: "cabinet", label: "Cabinet", kind: "cabinet" },
  ],
  beds: [
    { value: "bed", label: "Double bed", kind: "bed" },
    { value: "bedSingle", label: "Single bed", kind: "bedSingle" },
    { value: "bunk", label: "Bunk bed", kind: "bunk" },
    { value: "daybed", label: "Day bed", kind: "daybed" },
  ],
  general: [
    { value: "carton", label: "Boxed goods", kind: "carton", prefix: "GOODS" },
    { value: "mattress", label: "Mattress", kind: "mattress", prefix: "MATT" },
    { value: "rug", label: "Rug", kind: "rug", prefix: "RUG" },
    { value: "lamp", label: "Floor lamp", kind: "lamp", prefix: "LAMP" },
    { value: "mirror", label: "Mirror", kind: "mirror", prefix: "MIRR" },
  ],
};

/** Seed rows without bay allocation (allocation lives in ./inventory). */
export function seedRows(): Omit<SkuRecord, "bays">[] {
  return SEED.flatMap((c) =>
    c.models.flatMap((m) =>
      m.skus.map((s) => ({
        ...s,
        category: c.id,
        model: m.name,
        kind: m.kind ?? c.kind,
        cap: m.cap ?? c.cap,
        doors: m.doors ?? 2,
      })),
    ),
  );
}

export const DEMO_SKU = "SOFA-HAVN-2140";

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

export function matchesQuery(s: Sku, q: string) {
  return `${s.sku} ${s.model.name} ${s.variant} ${s.category.name}`.toLowerCase().includes(q);
}

/** Recorded stock movements for a SKU, newest first. */
export function historyFor(s: Sku): Movement[] {
  return (s.movements ?? []).slice(0, 5);
}
