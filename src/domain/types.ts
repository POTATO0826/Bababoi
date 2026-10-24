// Plain shapes shared by Convex functions, the browser and `bun test`.
// Field names match the Convex documents, so docs from `api.ledger.snapshot` satisfy them directly.
import type { CategoryId, FloorId, FurnitureKind, ZoneId } from "../data/catalog";

export const DAY = 86_400_000;

export type Role = "owner" | "sales" | "warehouse";
export interface Actor {
  role: Role;
  name: string;
  staffId?: string;
}

/** Units of one batch sitting in one bay. */
export interface Loc {
  slot: string;
  qty: number;
}

/** One packed piece of a unit, as loaded on a vehicle (cm, kg). */
export interface Package {
  lCm: number;
  wCm: number;
  hCm: number;
  kg: number;
}

export interface Price {
  listSen: number;
  /** Owner's clearance guidance per unit. */
  clearanceSen: number;
  unitCostSen: number;
}

export interface SkuLike {
  code: string;
  category: CategoryId;
  model: string;
  variant: string;
  kind: FurnitureKind;
  cap: number;
  doors: number;
  color: string;
  homeFloor: FloorId;
  homeZone: ZoneId;
  packages: Package[];
  price: Price;
  addedAt?: number;
  icon?: string;
  iconStatus?: "pending" | "ready" | "failed" | "unavailable";
}

export interface BatchLike {
  _id: string;
  code: string;
  skuCode: string;
  receivedAt: number;
  qtyReceived: number;
  locations: Loc[];
  status: "active" | "depleted";
}

export interface ReservationLike {
  _id: string;
  skuCode: string;
  batchId: string;
  qty: number;
  pick: Loc[];
  status: "active" | "consumed" | "released";
  dealId?: string;
  label: string;
}

export type MovementReason = "supplier_receipt" | "sale" | "customer_return" | "transfer" | "count_correction";

export interface MovementLike {
  at: number;
  skuCode: string;
  kind: "receive" | "dispatch";
  reason: MovementReason;
  qty: number;
  lines: Loc[];
  ref?: string;
  actor: Actor;
}

export interface PurchaseOrderLike {
  skuCode: string;
  qty: number;
  qtyReceived: number;
  status: "open" | "closed" | "cancelled";
}

export interface AgeingRule {
  minAgeDays: number;
  windowDays: number;
  maxSales: number;
}

export interface ReplenishRule {
  windowDays: number;
  coverageDays: number;
  budgetSen: number;
}
