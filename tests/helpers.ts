import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEMO_USERS } from "@/server/auth/users";
import { openDatabase, type Db } from "@/server/db/database";
import { DN_2291_RECEIVING_ID, WAREHOUSE_ID, seedDemo } from "@/server/db/seed";
import type { Actor, FaultPoint, ServiceContext } from "@/server/services/context";
import { getWarehouseSnapshot } from "@/server/services/warehouse";
import type { ReceivingLineInput, WarehouseSnapshot } from "@/shared/contracts";

/** 10:00 in Kuala Lumpur on the demo day. */
export const FIXED_NOW = new Date("2026-10-23T02:00:00.000Z");
export const TODAY = "2026-10-23";

export const owner = DEMO_USERS.find((u) => u.role === "owner")! as Actor;
export const warehouse = DEMO_USERS.find((u) => u.role === "warehouse")! as Actor;
export const sales = DEMO_USERS.find((u) => u.role === "sales")! as Actor;

export const DN = DN_2291_RECEIVING_ID;
export const SOFA = "SOFA-HAVN-2140";
export const SOFA_PO_LINE = "demo-po-sofa-havn-2140-line-1";

/** Temporary on-disk database (not :memory:), seeded with the demo dataset. */
export function tempDb(opts: { seed?: boolean } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "wareorb-test-"));
  const file = path.join(dir, "wareorb.sqlite");
  const db = openDatabase(file);
  if (opts.seed !== false) seedDemo(db, () => FIXED_NOW);
  return {
    db,
    file,
    dir,
    cleanup: () => {
      try {
        db.close();
      } catch {
        // already closed
      }
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function context(db: Db, faults?: (p: FaultPoint) => void): ServiceContext {
  return { db, clock: () => FIXED_NOW, warehouseId: WAREHOUSE_ID, faults };
}

export const dnLine = (over: Partial<ReceivingLineInput> = {}): ReceivingLineInput => ({
  sku: SOFA,
  quantity: 4,
  unit: "piece",
  receivedOn: TODAY,
  purchaseLineId: SOFA_PO_LINE,
  cargo: { lengthMm: null, widthMm: null, heightMm: null, weightGrams: null },
  allocations: [
    { locationId: "1B23", quantity: 2 },
    { locationId: "1B24", quantity: 2 },
  ],
  ...over,
});

export function totals(s: WarehouseSnapshot) {
  const t = { onHand: 0, reserved: 0, available: 0, incoming: 0 };
  for (const p of s.products) {
    t.onHand += p.onHand;
    t.reserved += p.reserved;
    t.available += p.available;
    t.incoming += p.incoming;
  }
  return { ...t, skus: s.products.length, occupied: s.locations.filter((l) => l.sku).length, bays: s.locations.length };
}

export function sku(s: WarehouseSnapshot, code: string) {
  const p = s.products.find((x) => x.sku === code)!;
  return [p.onHand, p.reserved, p.available, p.incoming];
}

/** Row counts of every business table, to prove that nothing was written. */
export function tableCounts(db: Db) {
  const tables = [
    "product",
    "location",
    "receiving",
    "receiving_line",
    "receiving_allocation",
    "stock_lot",
    "stock_balance",
    "stock_movement",
    "reservation",
    "purchase",
    "purchase_line",
    "activity",
    "idempotency_result",
  ];
  return Object.fromEntries(tables.map((t) => [t, (db.query(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n]));
}

export const snapshot = (db: Db) => getWarehouseSnapshot(context(db));
