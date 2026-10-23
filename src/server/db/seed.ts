// Explicit, rerunnable, non-destructive demo initialization (`bun run db:seed`).
// Never called on server startup. A seed marker makes reruns a no-op; a database that already
// holds business rows without the marker is refused rather than overwritten.
import { SYSTEM_SEED_ACTOR } from "@/server/auth/users";
import { DEMO_PENDING_NOTE, SEED_CATEGORIES, SEED_PRODUCTS, type SeedProduct } from "@/data/catalog";
import { GEOMETRY_VERSION, LOCATION_GEOMETRY, type BayGeometry } from "@/data/layout";
import { localDate } from "@/shared/time";
import { migrate, type Db } from "./database";

export const SEED_VERSION = "wareorb-demo-v1";
export const WAREHOUSE_ID = "main";
export const WAREHOUSE_TIMEZONE = "Asia/Kuala_Lumpur";

export type SeedResult =
  | { status: "seeded"; anchorDate: string; products: number; locations: number; onHand: number; reserved: number; incoming: number; occupiedBays: number }
  | { status: "already_seeded"; seedVersion: string };

/** Base unit per SKU. Only the explicitly packed "Set of 4" cushions are counted as sets; no carton conversion is inferred. */
const baseUnitFor = (p: SeedProduct) => (/^set of \d+$/i.test(p.variant) ? "set" : "piece");

const lower = (s: string) => s.toLowerCase();
export const purchaseIdFor = (sku: string) => `demo-po-${lower(sku)}`;
export const purchaseLineIdFor = (sku: string) => `demo-po-${lower(sku)}-line-1`;
export const DN_2291_RECEIVING_ID = "receiving-dn-2291";
const OPENING_RECEIVING_ID = "receiving-demo-opening";

export const normalizeRef = (supplier: string | null, doc: string | null) =>
  supplier && doc ? `${supplier.trim().toLowerCase()}|${doc.trim().toLowerCase()}` : null;

/**
 * The prototype's one-time fill: per floor and zone, SKUs seeded there take bays in order,
 * min(unitsPerBay, remaining) units per bay. Run once at seed time, never again.
 */
export function openingAllocation(products: readonly SeedProduct[], geometry: readonly BayGeometry[]) {
  const out: { bay: BayGeometry; sku: string; quantity: number }[] = [];
  const groups = new Map<string, BayGeometry[]>();
  for (const b of geometry) {
    const k = `${b.floor}${b.zone}`;
    groups.set(k, [...(groups.get(k) ?? []), b]);
  }
  for (const [k, bays] of groups) {
    let i = 0;
    for (const p of products.filter((x) => `${x.homeFloor}${x.homeZone}` === k)) {
      let remaining = p.opening.onHand;
      while (remaining > 0) {
        const bay = bays[i++];
        if (!bay) throw new Error(`Opening stock for ${p.sku} does not fit in floor ${p.homeFloor} zone ${p.homeZone}`);
        const quantity = Math.min(p.unitsPerBay, remaining);
        out.push({ bay, sku: p.sku, quantity });
        remaining -= quantity;
      }
    }
  }
  return out;
}

export function seedDemo(db: Db, now: () => Date = () => new Date()): SeedResult {
  migrate(db, now);
  const run = db.transaction((): SeedResult => {
    const existing = db.query("SELECT seed_version FROM warehouse_settings WHERE id = ?").get(WAREHOUSE_ID) as
      | { seed_version: string | null }
      | null;
    if (existing?.seed_version) return { status: "already_seeded", seedVersion: existing.seed_version };
    const anyRows = db.query("SELECT (SELECT COUNT(*) FROM warehouse_settings) + (SELECT COUNT(*) FROM product) + (SELECT COUNT(*) FROM receiving) AS n").get() as {
      n: number;
    };
    if (anyRows.n > 0) throw new Error("Database contains records without a demo seed marker; refusing to seed over them.");

    const at = now();
    const ts = at.toISOString();
    const anchor = localDate(at, WAREHOUSE_TIMEZONE);
    const actor = SYSTEM_SEED_ACTOR.id;

    db.query(
      `INSERT INTO warehouse_settings (id, name, timezone, currency, geometry_version, snapshot_revision,
         observation_started_on, demo_anchor_date, synthetic, seed_version, seeded_at)
       VALUES (?, 'Main Warehouse', ?, 'MYR', ?, 1, ?, ?, 1, NULL, NULL)`,
    ).run(WAREHOUSE_ID, WAREHOUSE_TIMEZONE, GEOMETRY_VERSION, anchor, anchor);

    const insCategory = db.query("INSERT INTO category (id, name, sort_order) VALUES (?, ?, ?)");
    SEED_CATEGORIES.forEach((c, i) => insCategory.run(c.id, c.name, i));

    const insProduct = db.query(
      `INSERT INTO product (sku, category_id, model_name, variant, color, kind, doors, units_per_bay, base_unit,
         home_floor, home_zone, sort_order, synthetic, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    );
    SEED_PRODUCTS.forEach((p, i) =>
      insProduct.run(p.sku, p.categoryId, p.modelName, p.variant, p.color, p.kind, p.doors, p.unitsPerBay, baseUnitFor(p), p.homeFloor, p.homeZone, i, ts, ts),
    );

    const insLocation = db.query(
      `INSERT INTO location (id, warehouse_id, floor, zone, row_index, bay_index, code, x0, z0, x1, z1)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const b of LOCATION_GEOMETRY) insLocation.run(b.id, WAREHOUSE_ID, b.floor, b.zone, b.row, b.index, b.code, ...b.rect);

    // ── Opening balances: one labelled synthetic posted receipt, one lot per SKU ──
    const allocation = openingAllocation(SEED_PRODUCTS, LOCATION_GEOMETRY);
    db.query(
      `INSERT INTO receiving (id, warehouse_id, kind, supplier_ref, document_ref, normalized_ref, status, version, synthetic,
         created_by, created_at, updated_by, updated_at)
       VALUES (?, ?, 'demo_opening', 'Demo opening balance (synthetic)', 'DEMO-OPENING', ?, 'draft', 1, 1, ?, ?, ?, ?)`,
    ).run(OPENING_RECEIVING_ID, WAREHOUSE_ID, normalizeRef("Demo opening balance (synthetic)", "DEMO-OPENING"), actor, ts, actor, ts);

    const insLine = db.query(
      `INSERT INTO receiving_line (id, receiving_id, line_no, sku, quantity, unit, received_on, purchase_line_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insAlloc = db.query("INSERT INTO receiving_allocation (line_id, location_id, quantity) VALUES (?, ?, ?)");
    const insLot = db.query(
      "INSERT INTO stock_lot (id, receiving_line_id, sku, received_on, synthetic, created_at) VALUES (?, ?, ?, ?, 1, ?)",
    );
    const insBalance = db.query("INSERT INTO stock_balance (lot_id, location_id, on_hand) VALUES (?, ?, ?)");
    const insMovement = db.query(
      `INSERT INTO stock_movement (id, lot_id, location_id, sku, quantity, kind, source_type, source_id, source_line_id,
         actor_id, occurred_at, recorded_at, local_date, seq, synthetic)
       VALUES (?, ?, ?, ?, ?, 'demo_opening', 'receiving', ?, ?, ?, ?, ?, ?, ?, 1)`,
    );
    const insReservation = db.query(
      `INSERT INTO reservation (id, lot_id, location_id, sku, original_qty, remaining_qty, status, source_type, source_ref,
         actor_id, created_at, synthetic)
       VALUES (?, ?, ?, ?, ?, ?, 'active', 'demo_opening_booking', ?, ?, ?, 1)`,
    );

    let seq = 0;
    SEED_PRODUCTS.forEach((p, i) => {
      const lineId = `${OPENING_RECEIVING_ID}-line-${i + 1}`;
      const lotId = `lot-opening-${lower(p.sku)}`;
      const bays = allocation.filter((a) => a.sku === p.sku);
      insLine.run(lineId, OPENING_RECEIVING_ID, i + 1, p.sku, p.opening.onHand, baseUnitFor(p), anchor, null);
      for (const a of bays) insAlloc.run(lineId, a.bay.id, a.quantity);
      insLot.run(lotId, lineId, p.sku, anchor, ts);
      let toReserve = p.opening.reserved;
      for (const a of bays) {
        insBalance.run(lotId, a.bay.id, a.quantity);
        seq += 1;
        insMovement.run(`mov-opening-${a.bay.id}`, lotId, a.bay.id, p.sku, a.quantity, OPENING_RECEIVING_ID, lineId, actor, ts, ts, anchor, seq);
        const r = Math.min(toReserve, a.quantity);
        if (r > 0) {
          insReservation.run(`res-opening-${a.bay.id}`, lotId, a.bay.id, p.sku, r, r, `DEMO-BOOKING-${p.sku}`, actor, ts);
          toReserve -= r;
        }
      }
      if (toReserve > 0) throw new Error(`Opening reservations for ${p.sku} exceed its on-hand stock`);
    });
    db.query("UPDATE receiving SET status = 'posted', version = 2, posted_by = ?, posted_at = ? WHERE id = ?").run(actor, ts, OPENING_RECEIVING_ID);

    // ── Confirmed incoming: one labelled synthetic purchase per SKU with incoming units ──
    const insPurchase = db.query(
      `INSERT INTO purchase (id, warehouse_id, supplier_ref, document_ref, status, version, synthetic, confirmed_by, confirmed_at, created_by, created_at)
       VALUES (?, ?, 'Synthetic supplier', ?, 'confirmed', 1, 1, ?, ?, ?, ?)`,
    );
    const insPurchaseLine = db.query("INSERT INTO purchase_line (id, purchase_id, sku, ordered_qty) VALUES (?, ?, ?, ?)");
    for (const p of SEED_PRODUCTS.filter((x) => x.opening.incoming > 0)) {
      insPurchase.run(purchaseIdFor(p.sku), WAREHOUSE_ID, `DEMO-PO-${p.sku}`, actor, ts, actor, ts);
      insPurchaseLine.run(purchaseLineIdFor(p.sku), purchaseIdFor(p.sku), p.sku, p.opening.incoming);
    }

    // ── DN-2291: an editable draft linked to the sofa's confirmed incoming units. Zero physical stock. ──
    const note = DEMO_PENDING_NOTE;
    db.query(
      `INSERT INTO receiving (id, warehouse_id, kind, supplier_ref, document_ref, normalized_ref, status, version, synthetic,
         created_by, created_at, updated_by, updated_at)
       VALUES (?, ?, 'delivery', ?, ?, ?, 'draft', 1, 1, ?, ?, ?, ?)`,
    ).run(DN_2291_RECEIVING_ID, WAREHOUSE_ID, note.supplierRef, note.documentRef, normalizeRef(note.supplierRef, note.documentRef), actor, ts, actor, ts);
    const dnLine = `${DN_2291_RECEIVING_ID}-line-1`;
    // The actual receipt date is left for the reviewer to verify; posting is blocked until it is set.
    insLine.run(dnLine, DN_2291_RECEIVING_ID, 1, note.sku, note.quantity, "piece", null, purchaseLineIdFor(note.sku));
    for (const a of note.proposedAllocations) insAlloc.run(dnLine, a.locationId, a.quantity);

    const totals = {
      onHand: SEED_PRODUCTS.reduce((a, p) => a + p.opening.onHand, 0),
      reserved: SEED_PRODUCTS.reduce((a, p) => a + p.opening.reserved, 0),
      incoming: SEED_PRODUCTS.reduce((a, p) => a + p.opening.incoming, 0),
    };
    db.query(
      `INSERT INTO activity (entity_type, entity_id, entity_version, action, actor_id, occurred_at, local_date, reason, metadata_json, synthetic)
       VALUES ('warehouse', ?, 1, 'demo.seeded', ?, ?, ?, 'Explicit demo initialization', ?, 1)`,
    ).run(WAREHOUSE_ID, actor, ts, anchor, JSON.stringify({ seedVersion: SEED_VERSION, ...totals }));
    db.query("UPDATE warehouse_settings SET seed_version = ?, seeded_at = ? WHERE id = ?").run(SEED_VERSION, ts, WAREHOUSE_ID);

    return {
      status: "seeded",
      anchorDate: anchor,
      products: SEED_PRODUCTS.length,
      locations: LOCATION_GEOMETRY.length,
      ...totals,
      occupiedBays: allocation.length,
    };
  });
  return run.immediate();
}
