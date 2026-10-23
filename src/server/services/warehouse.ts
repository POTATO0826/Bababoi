// Read models: one consistent warehouse snapshot, product detail, movement history and daily activity.
import { actorName } from "@/server/auth/users";
import type {
  ActivityRow,
  CategoryId,
  DailyActivity,
  FloorId,
  MovementKind,
  MovementPage,
  MovementRow,
  PendingReceivingSummary,
  ProductSnapshot,
  WarehouseSnapshot,
} from "@/shared/contracts";
import { localDate } from "@/shared/time";
import { AppError, warehouseRow, type ServiceContext } from "./context";
import { readLocations, readProducts } from "./stock";

/** Everything the existing warehouse UI needs, read inside one read transaction. */
export function getWarehouseSnapshot(ctx: ServiceContext): WarehouseSnapshot {
  return ctx.db.transaction((): WarehouseSnapshot => {
    const w = warehouseRow(ctx);
    const at = ctx.clock();
    const categories = ctx.db.query("SELECT id, name FROM category ORDER BY sort_order").all() as { id: CategoryId; name: string }[];
    const drafts = ctx.db
      .query(
        `SELECT id, document_ref, supplier_ref, version, synthetic, created_at FROM receiving
         WHERE warehouse_id = ? AND status = 'draft' AND kind = 'delivery' ORDER BY created_at, id`,
      )
      .all(ctx.warehouseId) as { id: string; document_ref: string | null; supplier_ref: string | null; version: number; synthetic: number; created_at: string }[];
    const draftLines = ctx.db
      .query(
        `SELECT rl.receiving_id, rl.sku, rl.quantity FROM receiving_line rl JOIN receiving r ON r.id = rl.receiving_id
         WHERE r.status = 'draft' AND r.kind = 'delivery' ORDER BY rl.line_no`,
      )
      .all() as { receiving_id: string; sku: string | null; quantity: number | null }[];
    const pendingReceivings: PendingReceivingSummary[] = drafts.map((d) => {
      const lines = draftLines.filter((l) => l.receiving_id === d.id).map((l) => ({ sku: l.sku, quantity: l.quantity }));
      return {
        id: d.id,
        documentRef: d.document_ref,
        supplierRef: d.supplier_ref,
        status: "draft",
        version: d.version,
        synthetic: d.synthetic === 1,
        lines,
        totalQuantity: lines.reduce((a, l) => a + (l.quantity ?? 0), 0),
        createdAt: d.created_at,
      };
    });
    return {
      asOf: at.toISOString(),
      revision: w.snapshot_revision,
      warehouse: {
        id: w.id,
        name: w.name,
        timezone: w.timezone,
        today: localDate(at, w.timezone),
        geometryVersion: w.geometry_version,
        demoAnchorDate: w.demo_anchor_date,
        syntheticData: w.synthetic === 1,
      },
      categories,
      products: readProducts(ctx.db),
      locations: readLocations(ctx.db),
      pendingReceivings,
    };
  })();
}

export interface ProductDetail {
  product: ProductSnapshot;
  revision: number;
  lots: {
    lotId: string;
    receivedOn: string;
    synthetic: boolean;
    sourceRef: string | null;
    receivingId: string;
    balances: { locationId: string; floor: FloorId; code: string; onHand: number; reserved: number }[];
  }[];
}

export function getProductDetail(ctx: ServiceContext, sku: string): ProductDetail {
  return ctx.db.transaction((): ProductDetail => {
    const w = warehouseRow(ctx);
    const product = readProducts(ctx.db, sku)[0];
    if (!product) throw new AppError("not_found", `Product ${sku} not found.`);
    const rows = ctx.db
      .query(
        `SELECT lot.id AS lot_id, lot.received_on, lot.synthetic, r.document_ref, r.id AS receiving_id,
                b.location_id, loc.floor, loc.code, b.on_hand,
                COALESCE((SELECT SUM(remaining_qty) FROM reservation rs WHERE rs.lot_id = lot.id AND rs.location_id = b.location_id AND rs.status = 'active'), 0) AS reserved
         FROM stock_lot lot
         JOIN receiving_line rl ON rl.id = lot.receiving_line_id JOIN receiving r ON r.id = rl.receiving_id
         JOIN stock_balance b ON b.lot_id = lot.id JOIN location loc ON loc.id = b.location_id
         WHERE lot.sku = ? AND b.on_hand > 0
         ORDER BY lot.received_on, lot.created_at, loc.floor, loc.zone, loc.row_index, loc.bay_index`,
      )
      .all(sku) as {
      lot_id: string;
      received_on: string;
      synthetic: number;
      document_ref: string | null;
      receiving_id: string;
      location_id: string;
      floor: FloorId;
      code: string;
      on_hand: number;
      reserved: number;
    }[];
    const lots: ProductDetail["lots"] = [];
    for (const r of rows) {
      let lot = lots.find((l) => l.lotId === r.lot_id);
      if (!lot) {
        lot = { lotId: r.lot_id, receivedOn: r.received_on, synthetic: r.synthetic === 1, sourceRef: r.document_ref, receivingId: r.receiving_id, balances: [] };
        lots.push(lot);
      }
      lot.balances.push({ locationId: r.location_id, floor: r.floor, code: r.code, onHand: r.on_hand, reserved: r.reserved });
    }
    return { product, revision: w.snapshot_revision, lots };
  })();
}

interface MovementDbRow {
  id: string;
  sku: string;
  lot_id: string;
  location_id: string;
  floor: FloorId;
  code: string;
  quantity: number;
  kind: MovementKind;
  source_type: string;
  source_id: string;
  source_ref: string | null;
  actor_id: string;
  occurred_at: string;
  recorded_at: string;
  local_date: string;
  seq: number;
  synthetic: number;
}

export function getMovements(ctx: ServiceContext, sku: string, cursor: string | null, limit: number): MovementPage {
  warehouseRow(ctx);
  if (!ctx.db.query("SELECT 1 AS x FROM product WHERE sku = ?").get(sku)) throw new AppError("not_found", `Product ${sku} not found.`);
  const before = cursor && /^\d+$/.test(cursor) ? Number(cursor) : Number.MAX_SAFE_INTEGER;
  const rows = ctx.db
    .query(
      `SELECT m.*, loc.floor, loc.code, r.document_ref AS source_ref
       FROM stock_movement m JOIN location loc ON loc.id = m.location_id
       LEFT JOIN receiving r ON m.source_type = 'receiving' AND r.id = m.source_id
       WHERE m.sku = ? AND m.seq < ? ORDER BY m.seq DESC LIMIT ?`,
    )
    .all(sku, before, limit + 1) as MovementDbRow[];
  const page = rows.slice(0, limit);
  return {
    rows: page.map(
      (m): MovementRow => ({
        id: m.id,
        sku: m.sku,
        lotId: m.lot_id,
        locationId: m.location_id,
        floor: m.floor,
        code: m.code,
        quantity: m.quantity,
        kind: m.kind,
        sourceType: m.source_type,
        sourceId: m.source_id,
        sourceRef: m.source_ref,
        actorId: m.actor_id,
        actorName: actorName(m.actor_id),
        occurredAt: m.occurred_at,
        recordedAt: m.recorded_at,
        localDate: m.local_date,
        synthetic: m.synthetic === 1,
      }),
    ),
    nextCursor: rows.length > limit ? String(page.at(-1)!.seq) : null,
  };
}

/** Actual activity for one warehouse-local date. Synthetic opening balances are never counted as receipts. */
export function getDailyActivity(ctx: ServiceContext, date: string | null): DailyActivity {
  return ctx.db.transaction((): DailyActivity => {
    const w = warehouseRow(ctx);
    const day = date ?? localDate(ctx.clock(), w.timezone);
    const rows = ctx.db
      .query("SELECT * FROM activity WHERE local_date = ? ORDER BY id DESC LIMIT 200")
      .all(day) as {
      id: number;
      entity_type: string;
      entity_id: string;
      entity_version: number | null;
      action: string;
      actor_id: string;
      occurred_at: string;
      local_date: string;
      reason: string | null;
      metadata_json: string | null;
      synthetic: number;
    }[];
    const receipts = ctx.db
      .query(
        `SELECT m.source_id, r.document_ref, SUM(m.quantity) AS units, MIN(m.recorded_at) AS posted_at, MIN(m.actor_id) AS actor_id
         FROM stock_movement m JOIN receiving r ON r.id = m.source_id
         WHERE m.kind = 'receipt' AND m.local_date = ? GROUP BY m.source_id ORDER BY posted_at`,
      )
      .all(day) as { source_id: string; document_ref: string | null; units: number; posted_at: string; actor_id: string }[];
    const dispatched = ctx.db
      .query("SELECT COALESCE(-SUM(quantity), 0) AS q FROM stock_movement WHERE kind = 'sale_dispatch' AND local_date = ? AND synthetic = 0")
      .get(day) as { q: number };
    const pending = ctx.db.query("SELECT COUNT(*) AS n FROM receiving WHERE status = 'draft' AND kind = 'delivery'").get() as { n: number };
    return {
      date: day,
      timezone: w.timezone,
      receivedUnits: receipts.reduce((a, r) => a + r.units, 0),
      receipts: receipts.map((r) => ({
        receivingId: r.source_id,
        documentRef: r.document_ref,
        units: r.units,
        postedAt: r.posted_at,
        actorName: actorName(r.actor_id),
      })),
      dispatchedUnits: dispatched.q,
      rows: rows.map(
        (r): ActivityRow => ({
          id: r.id,
          entityType: r.entity_type,
          entityId: r.entity_id,
          entityVersion: r.entity_version,
          action: r.action,
          actorId: r.actor_id,
          actorName: actorName(r.actor_id),
          occurredAt: r.occurred_at,
          localDate: r.local_date,
          reason: r.reason,
          metadata: r.metadata_json ? (JSON.parse(r.metadata_json) as Record<string, unknown>) : null,
          synthetic: r.synthetic === 1,
        }),
      ),
      pendingReceivings: pending.n,
    };
  })();
}
