// JSON-safe wire contracts shared by the Bun API and the browser.
// No object cycles: everything references other records by stable ID (SKU code, location ID, receiving ID).

export type FloorId = 1 | 2;
export type ZoneId = "A" | "B" | "C" | "D";
export type CategoryId = "sofas" | "tables" | "chairs" | "wardrobes" | "beds" | "general";
export type Role = "owner" | "warehouse" | "sales";

/** Furniture template used by the 3D scene. Unknown kinds fall back to "carton". */
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

export const FLOOR_IDS: readonly FloorId[] = [1, 2];
export const ZONE_IDS: readonly ZoneId[] = ["A", "B", "C", "D"];
export const BASE_UNITS = ["piece", "set"] as const;
export type BaseUnit = (typeof BASE_UNITS)[number];

// ── Envelope ──────────────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  data: T;
  snapshotRevision?: number;
}

export type ApiErrorCode =
  | "bad_request"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "version_conflict"
  | "state_conflict"
  | "idempotency_conflict"
  | "duplicate_reference"
  | "stock_conflict"
  | "validation_failed"
  | "not_initialized"
  | "unavailable"
  | "internal";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    fields?: Record<string, string>;
    issues?: ReceivingIssue[];
    currentVersion?: number;
  };
}

// ── Identity ──────────────────────────────────────────────────────────────

export interface SessionUser {
  id: string;
  name: string;
  initials: string;
  role: Role;
  synthetic: true;
}

export interface SessionInfo {
  user: SessionUser;
  demo: boolean;
}

// ── Warehouse snapshot ────────────────────────────────────────────────────

export interface CategorySnapshot {
  id: CategoryId;
  name: string;
}

export interface ProductSnapshot {
  sku: string;
  categoryId: CategoryId;
  modelName: string;
  variant: string;
  color: string;
  kind: FurnitureKind;
  doors: number;
  unitsPerBay: number;
  baseUnit: BaseUnit;
  /** Navigation preference from the seed, not stock ownership. Actual positions are in `locations`. */
  homeFloor: FloorId;
  homeZone: ZoneId;
  onHand: number;
  reserved: number;
  available: number;
  incoming: number;
}

export interface LocationSnapshot {
  id: string; // legacy bay ID, e.g. "1B23"
  floor: FloorId;
  zone: ZoneId;
  row: number; // zero-based
  index: number; // zero-based
  code: string; // display code, unique per floor only, e.g. "B-3-04"
  sku: string | null;
  quantity: number;
  reserved: number;
}

export interface PendingReceivingSummary {
  id: string;
  documentRef: string | null;
  supplierRef: string | null;
  status: "draft";
  version: number;
  synthetic: boolean;
  lines: { sku: string | null; quantity: number | null }[];
  totalQuantity: number;
  createdAt: string;
}

export interface WarehouseInfo {
  id: string;
  name: string;
  timezone: string;
  /** Warehouse-local calendar date at `asOf`. */
  today: string;
  geometryVersion: string;
  demoAnchorDate: string;
  syntheticData: boolean;
}

export interface WarehouseSnapshot {
  asOf: string;
  revision: number;
  warehouse: WarehouseInfo;
  categories: CategorySnapshot[];
  products: ProductSnapshot[];
  locations: LocationSnapshot[];
  pendingReceivings: PendingReceivingSummary[];
}

// ── Movements and activity ────────────────────────────────────────────────

export type MovementKind = "receipt" | "sale_dispatch" | "demo_opening";

export interface MovementRow {
  id: string;
  sku: string;
  lotId: string;
  locationId: string;
  floor: FloorId;
  code: string;
  quantity: number;
  kind: MovementKind;
  sourceType: string;
  sourceId: string;
  sourceRef: string | null;
  actorId: string;
  actorName: string;
  occurredAt: string;
  recordedAt: string;
  localDate: string;
  synthetic: boolean;
}

export interface MovementPage {
  rows: MovementRow[];
  nextCursor: string | null;
}

export interface ActivityRow {
  id: number;
  entityType: string;
  entityId: string;
  entityVersion: number | null;
  action: string;
  actorId: string;
  actorName: string;
  occurredAt: string;
  localDate: string;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  synthetic: boolean;
}

export interface DailyActivity {
  date: string;
  timezone: string;
  /** Physical receipts posted on this warehouse-local date (excludes synthetic opening balances). */
  receivedUnits: number;
  receipts: { receivingId: string; documentRef: string | null; units: number; postedAt: string; actorName: string }[];
  dispatchedUnits: number;
  rows: ActivityRow[];
  pendingReceivings: number;
}

// ── Receiving ─────────────────────────────────────────────────────────────

export interface CargoSnapshot {
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  weightGrams: number | null;
}

export interface AllocationInput {
  locationId: string;
  quantity: number;
}

export interface ReceivingLineInput {
  sku: string | null;
  quantity: number | null;
  unit: BaseUnit | null;
  receivedOn: string | null;
  purchaseLineId: string | null;
  cargo: CargoSnapshot;
  allocations: AllocationInput[];
}

export interface ReceivingLine extends ReceivingLineInput {
  id: string;
  lineNo: number;
  lotId: string | null;
}

export type ReceivingStatus = "draft" | "posted" | "cancelled";

export type IssueSeverity = "field" | "conflict" | "warning";

export interface ReceivingIssue {
  /** Machine code, e.g. "missing_received_on", "capacity_exceeded". */
  code: string;
  /**
   * "field" issues block posting with 422; "conflict" issues are stock/state conflicts that block with 409;
   * "warning" issues (e.g. unknown cargo measurements, no document reference) are visible gaps that do not block.
   */
  severity: IssueSeverity;
  message: string;
  lineNo?: number;
  locationId?: string;
}

export interface PurchaseLineOption {
  id: string;
  purchaseId: string;
  purchaseRef: string | null;
  sku: string;
  ordered: number;
  received: number;
  cancelled: number;
  outstanding: number;
  synthetic: boolean;
}

export interface Receiving {
  id: string;
  supplierRef: string | null;
  documentRef: string | null;
  status: ReceivingStatus;
  kind: "delivery" | "demo_opening";
  version: number;
  synthetic: boolean;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  postedBy: string | null;
  postedByName: string | null;
  postedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  lines: ReceivingLine[];
  /** Readiness check against current stock. Empty means the draft can be posted. */
  issues: ReceivingIssue[];
  /** Confirmed purchase lines with outstanding quantity for the SKUs on this draft. */
  purchaseOptions: PurchaseLineOption[];
}

export interface ReceivingSummary {
  id: string;
  supplierRef: string | null;
  documentRef: string | null;
  status: ReceivingStatus;
  version: number;
  synthetic: boolean;
  totalQuantity: number;
  createdAt: string;
  postedAt: string | null;
}

export interface PostReceivingResult {
  receivingId: string;
  documentRef: string | null;
  status: "posted";
  version: number;
  lotIds: string[];
  movementIds: string[];
  postedUnits: number;
  postedAt: string;
  snapshotRevision: number;
  /** True when this response replays an already committed request with the same idempotency key. */
  replayed: boolean;
}

export const IDEMPOTENCY_HEADER = "Idempotency-Key";

export const available = (p: { onHand: number; reserved: number }) => p.onHand - p.reserved;
export const isLow = (p: { onHand: number; reserved: number }, threshold: number) => available(p) <= threshold;
