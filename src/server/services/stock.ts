// Read queries for stock quantities. Every number here is derived from ledger rows:
//   onHand    = Σ stock_balance.on_hand
//   reserved  = Σ active reservation.remaining_qty
//   available = onHand − reserved
//   incoming  = Σ confirmed purchase lines (ordered − cancelled − received via posted receiving lines)
import type { BaseUnit, CategoryId, FloorId, FurnitureKind, LocationSnapshot, ProductSnapshot, ZoneId } from "@/shared/contracts";
import type { Db } from "@/server/db/database";

/** Outstanding quantity per confirmed purchase line. */
export const PURCHASE_OUTSTANDING_SQL = `
  SELECT pl.id AS purchase_line_id, pl.purchase_id, p.document_ref AS purchase_ref, pl.sku, pl.ordered_qty, pl.cancelled_qty,
         p.status AS purchase_status, p.synthetic,
         COALESCE((SELECT SUM(rl.quantity) FROM receiving_line rl JOIN receiving r ON r.id = rl.receiving_id
                   WHERE rl.purchase_line_id = pl.id AND r.status = 'posted'), 0) AS received_qty
  FROM purchase_line pl JOIN purchase p ON p.id = pl.purchase_id`;

interface ProductRow {
  sku: string;
  category_id: CategoryId;
  model_name: string;
  variant: string;
  color: string;
  kind: FurnitureKind;
  doors: number;
  units_per_bay: number;
  base_unit: BaseUnit;
  home_floor: FloorId;
  home_zone: ZoneId;
  on_hand: number;
  reserved: number;
  incoming: number;
}

export function readProducts(db: Db, sku?: string): ProductSnapshot[] {
  const rows = db
    .query(
      `WITH oh AS (SELECT l.sku, SUM(b.on_hand) AS q FROM stock_balance b JOIN stock_lot l ON l.id = b.lot_id GROUP BY l.sku),
            rs AS (SELECT sku, SUM(remaining_qty) AS q FROM reservation WHERE status = 'active' GROUP BY sku),
            po AS (SELECT sku, SUM(MAX(0, ordered_qty - cancelled_qty - received_qty)) AS q
                   FROM (${PURCHASE_OUTSTANDING_SQL}) WHERE purchase_status = 'confirmed' GROUP BY sku)
       SELECT p.sku, p.category_id, p.model_name, p.variant, p.color, p.kind, p.doors, p.units_per_bay, p.base_unit,
              p.home_floor, p.home_zone,
              COALESCE(oh.q, 0) AS on_hand, COALESCE(rs.q, 0) AS reserved, COALESCE(po.q, 0) AS incoming
       FROM product p
       LEFT JOIN oh ON oh.sku = p.sku LEFT JOIN rs ON rs.sku = p.sku LEFT JOIN po ON po.sku = p.sku
       WHERE (?1 IS NULL OR p.sku = ?1)
       ORDER BY p.sort_order`,
    )
    .all(sku ?? null) as ProductRow[];
  return rows.map((r) => ({
    sku: r.sku,
    categoryId: r.category_id,
    modelName: r.model_name,
    variant: r.variant,
    color: r.color,
    kind: r.kind,
    doors: r.doors,
    unitsPerBay: r.units_per_bay,
    baseUnit: r.base_unit,
    homeFloor: r.home_floor,
    homeZone: r.home_zone,
    onHand: r.on_hand,
    reserved: r.reserved,
    available: r.on_hand - r.reserved,
    incoming: r.incoming,
  }));
}

interface LocationRow {
  id: string;
  floor: FloorId;
  zone: ZoneId;
  row_index: number;
  bay_index: number;
  code: string;
  sku: string | null;
  quantity: number;
  reserved: number;
}

export function readLocations(db: Db, ids?: string[]): LocationSnapshot[] {
  const rows = db
    .query(
      `WITH occ AS (SELECT b.location_id, MIN(l.sku) AS sku, SUM(b.on_hand) AS q
                    FROM stock_balance b JOIN stock_lot l ON l.id = b.lot_id WHERE b.on_hand > 0 GROUP BY b.location_id),
            rs AS (SELECT location_id, SUM(remaining_qty) AS q FROM reservation WHERE status = 'active' GROUP BY location_id)
       SELECT loc.id, loc.floor, loc.zone, loc.row_index, loc.bay_index, loc.code,
              occ.sku, COALESCE(occ.q, 0) AS quantity, COALESCE(rs.q, 0) AS reserved
       FROM location loc LEFT JOIN occ ON occ.location_id = loc.id LEFT JOIN rs ON rs.location_id = loc.id
       ORDER BY loc.floor, loc.zone, loc.row_index, loc.bay_index`,
    )
    .all() as LocationRow[];
  const wanted = ids ? new Set(ids) : null;
  return rows
    .filter((r) => !wanted || wanted.has(r.id))
    .map((r) => ({
      id: r.id,
      floor: r.floor,
      zone: r.zone,
      row: r.row_index,
      index: r.bay_index,
      code: r.code,
      sku: r.sku,
      quantity: r.quantity,
      reserved: r.reserved,
    }));
}

/** Current physical occupancy of the given bays (all SKUs present, total units). */
export function bayOccupancy(db: Db, locationIds: string[]) {
  const out = new Map<string, { skus: Set<string>; quantity: number }>();
  if (!locationIds.length) return out;
  const rows = db
    .query(
      `SELECT b.location_id, l.sku, SUM(b.on_hand) AS q FROM stock_balance b JOIN stock_lot l ON l.id = b.lot_id
       WHERE b.on_hand > 0 AND b.location_id IN (SELECT value FROM json_each(?)) GROUP BY b.location_id, l.sku`,
    )
    .all(JSON.stringify(locationIds)) as { location_id: string; sku: string; q: number }[];
  for (const r of rows) {
    const cur = out.get(r.location_id) ?? { skus: new Set<string>(), quantity: 0 };
    cur.skus.add(r.sku);
    cur.quantity += r.q;
    out.set(r.location_id, cur);
  }
  return out;
}
