// Receiving: drafts are editable records with no stock effect. Posting is the only path that
// creates physical stock, and it happens in one short IMMEDIATE transaction.
import { actorName, can, type Permission } from "@/server/auth/users";
import { normalizeRef } from "@/server/db/seed";
import type {
  BaseUnit,
  FloorId,
  PostReceivingResult,
  PurchaseLineOption,
  Receiving,
  ReceivingIssue,
  ReceivingLine,
  ReceivingLineInput,
  ReceivingStatus,
  ReceivingSummary,
} from "@/shared/contracts";
import { localDate } from "@/shared/time";
import {
  isIdempotencyKey,
  type CancelReceivingBody,
  type CreateReceivingBody,
  type PostReceivingBody,
  type UpdateReceivingBody,
} from "@/shared/validate";
import { AppError, bumpRevision, isConstraint, newId, recordActivity, warehouseRow, type Actor, type ServiceContext } from "./context";
import { PURCHASE_OUTSTANDING_SQL, bayOccupancy } from "./stock";

// ── Row loading ───────────────────────────────────────────────────────────

interface ReceivingRow {
  id: string;
  kind: "delivery" | "demo_opening";
  supplier_ref: string | null;
  document_ref: string | null;
  status: ReceivingStatus;
  version: number;
  synthetic: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  posted_by: string | null;
  posted_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
}

function loadRow(ctx: ServiceContext, id: string): ReceivingRow | null {
  return ctx.db.query("SELECT * FROM receiving WHERE id = ? AND warehouse_id = ?").get(id, ctx.warehouseId) as ReceivingRow | null;
}

interface LineRow {
  id: string;
  line_no: number;
  sku: string | null;
  quantity: number | null;
  unit: BaseUnit | null;
  received_on: string | null;
  purchase_line_id: string | null;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  weight_grams: number | null;
  lot_id: string | null;
}

function loadLines(ctx: ServiceContext, receivingId: string): ReceivingLine[] {
  const rows = ctx.db
    .query(
      `SELECT rl.*, (SELECT id FROM stock_lot WHERE receiving_line_id = rl.id) AS lot_id
       FROM receiving_line rl WHERE rl.receiving_id = ? ORDER BY rl.line_no`,
    )
    .all(receivingId) as LineRow[];
  const allocs = ctx.db
    .query(
      `SELECT a.line_id, a.location_id, a.quantity FROM receiving_allocation a
       JOIN receiving_line rl ON rl.id = a.line_id JOIN location l ON l.id = a.location_id
       WHERE rl.receiving_id = ? ORDER BY l.floor, l.zone, l.row_index, l.bay_index`,
    )
    .all(receivingId) as { line_id: string; location_id: string; quantity: number }[];
  return rows.map((r) => ({
    id: r.id,
    lineNo: r.line_no,
    sku: r.sku,
    quantity: r.quantity,
    unit: r.unit,
    receivedOn: r.received_on,
    purchaseLineId: r.purchase_line_id,
    cargo: { lengthMm: r.length_mm, widthMm: r.width_mm, heightMm: r.height_mm, weightGrams: r.weight_grams },
    allocations: allocs.filter((a) => a.line_id === r.id).map((a) => ({ locationId: a.location_id, quantity: a.quantity })),
    lotId: r.lot_id,
  }));
}

interface OutstandingRow {
  purchase_line_id: string;
  purchase_id: string;
  purchase_ref: string | null;
  sku: string;
  ordered_qty: number;
  cancelled_qty: number;
  received_qty: number;
  purchase_status: string;
  synthetic: number;
}

function purchaseLines(ctx: ServiceContext, where: { ids?: string[]; skus?: string[] }): OutstandingRow[] {
  const rows = ctx.db.query(`SELECT * FROM (${PURCHASE_OUTSTANDING_SQL})`).all() as OutstandingRow[];
  return rows.filter((r) => (where.ids ? where.ids.includes(r.purchase_line_id) : true) && (where.skus ? where.skus.includes(r.sku) : true));
}

const outstanding = (r: OutstandingRow) => Math.max(0, r.ordered_qty - r.cancelled_qty - r.received_qty);

function purchaseOptions(ctx: ServiceContext, lines: ReceivingLine[], includeOpen: boolean): PurchaseLineOption[] {
  const skus = [...new Set(lines.map((l) => l.sku).filter((s): s is string => !!s))];
  const linked = lines.map((l) => l.purchaseLineId).filter((s): s is string => !!s);
  return purchaseLines(ctx, {})
    .filter(
      (r) =>
        linked.includes(r.purchase_line_id) || (includeOpen && r.purchase_status === "confirmed" && skus.includes(r.sku) && outstanding(r) > 0),
    )
    .map((r) => ({
      id: r.purchase_line_id,
      purchaseId: r.purchase_id,
      purchaseRef: r.purchase_ref,
      sku: r.sku,
      ordered: r.ordered_qty,
      received: r.received_qty,
      cancelled: r.cancelled_qty,
      outstanding: outstanding(r),
      synthetic: r.synthetic === 1,
    }));
}

// ── Readiness ─────────────────────────────────────────────────────────────

interface LocationInfo {
  id: string;
  floor: FloorId;
  code: string;
  enabled: number;
}

function locationInfo(ctx: ServiceContext): Map<string, LocationInfo> {
  const rows = ctx.db.query("SELECT id, floor, code, enabled FROM location WHERE warehouse_id = ?").all(ctx.warehouseId) as LocationInfo[];
  return new Map(rows.map((r) => [r.id, r]));
}

const label = (l: LocationInfo | undefined, id: string) => (l ? `F${l.floor} ${l.code}` : id);

/**
 * Everything that would stop this draft from posting right now, plus non-blocking gaps.
 * Uses the same rules as the posting transaction, which re-runs it under the write lock.
 */
function computeIssues(ctx: ServiceContext, rec: ReceivingRow, lines: ReceivingLine[], today: string): ReceivingIssue[] {
  const issues: ReceivingIssue[] = [];
  const add = (i: ReceivingIssue) => issues.push(i);
  const products = new Map(
    (ctx.db.query("SELECT sku, units_per_bay, base_unit FROM product").all() as { sku: string; units_per_bay: number; base_unit: BaseUnit }[]).map((p) => [
      p.sku,
      p,
    ]),
  );
  const locations = locationInfo(ctx);

  if (!lines.length) add({ code: "no_lines", severity: "field", message: "Add at least one counted line." });
  if (!rec.supplier_ref || !rec.document_ref)
    add({
      code: rec.document_ref ? "incomplete_duplicate_reference" : "no_document_reference",
      severity: "warning",
      message: `Missing ${[!rec.supplier_ref && "supplier", !rec.document_ref && "document reference"].filter(Boolean).join(" and ")}: supplier-document duplicate matching is unavailable; posting still uses an idempotency key.`,
    });

  const purchaseUse = new Map<string, number>();
  const proposed = new Map<string, Map<string, number>>(); // location → sku → qty

  for (const l of lines) {
    const n = l.lineNo;
    const product = l.sku ? products.get(l.sku) : undefined;
    if (!l.sku) add({ code: "missing_sku", severity: "field", lineNo: n, message: `Line ${n}: choose the SKU.` });
    else if (!product) add({ code: "unknown_sku", severity: "field", lineNo: n, message: `Line ${n}: ${l.sku} is not in the catalogue.` });
    if (l.quantity === null) add({ code: "missing_quantity", severity: "field", lineNo: n, message: `Line ${n}: enter the counted quantity.` });
    if (!l.unit) add({ code: "missing_unit", severity: "field", lineNo: n, message: `Line ${n}: confirm the unit.` });
    else if (product && l.unit !== product.base_unit)
      add({
        code: "unit_mismatch",
        severity: "field",
        lineNo: n,
        message: `Line ${n}: ${l.sku} is counted in ${product.base_unit}s; no ${l.unit} conversion is inferred.`,
      });
    if (!l.receivedOn) add({ code: "missing_received_on", severity: "field", lineNo: n, message: `Line ${n}: enter the actual receipt date.` });
    else if (l.receivedOn > today)
      add({ code: "received_on_in_future", severity: "field", lineNo: n, message: `Line ${n}: receipt date ${l.receivedOn} is after today (${today}).` });

    const allocated = l.allocations.reduce((a, x) => a + x.quantity, 0);
    if (!l.allocations.length) add({ code: "missing_allocation", severity: "field", lineNo: n, message: `Line ${n}: choose where the goods are put away.` });
    else if (l.quantity !== null && allocated !== l.quantity)
      add({
        code: "allocation_mismatch",
        severity: "field",
        lineNo: n,
        message: `Line ${n}: allocations total ${allocated} but ${l.quantity} were counted.`,
      });
    for (const a of l.allocations) {
      const loc = locations.get(a.locationId);
      if (!loc || !loc.enabled)
        add({ code: "location_unavailable", severity: "field", lineNo: n, locationId: a.locationId, message: `Line ${n}: ${label(loc, a.locationId)} is not available.` });
      if (l.sku) {
        const m = proposed.get(a.locationId) ?? new Map<string, number>();
        m.set(l.sku, (m.get(l.sku) ?? 0) + a.quantity);
        proposed.set(a.locationId, m);
      }
    }

    if (l.purchaseLineId) purchaseUse.set(l.purchaseLineId, (purchaseUse.get(l.purchaseLineId) ?? 0) + (l.quantity ?? 0));
    if (Object.values(l.cargo).every((v) => v === null))
      add({
        code: "cargo_unknown",
        severity: "warning",
        lineNo: n,
        message: `Line ${n}: packed dimensions and weight unknown — a transport-preparation gap, not a receiving blocker.`,
      });
  }

  // Linked purchase lines: confirmed, same SKU, and no over-receipt.
  const linked = new Map(purchaseLines(ctx, { ids: [...purchaseUse.keys()] }).map((r) => [r.purchase_line_id, r]));
  for (const [plId, qty] of purchaseUse) {
    const pl = linked.get(plId);
    const matchingLines = lines.filter((l) => l.purchaseLineId === plId);
    const line = matchingLines[0]!;
    if (!pl) {
      for (const linkedLine of matchingLines)
        add({ code: "purchase_line_unknown", severity: "field", lineNo: linkedLine.lineNo, message: `Line ${linkedLine.lineNo}: purchase line ${plId} does not exist.` });
      continue;
    }
    for (const linkedLine of matchingLines) {
      if (pl.purchase_status !== "confirmed")
        add({ code: "purchase_not_confirmed", severity: "conflict", lineNo: linkedLine.lineNo, message: `Line ${linkedLine.lineNo}: purchase ${pl.purchase_ref ?? pl.purchase_id} is not confirmed.` });
      if (linkedLine.sku && pl.sku !== linkedLine.sku)
        add({ code: "purchase_sku_mismatch", severity: "field", lineNo: linkedLine.lineNo, message: `Line ${linkedLine.lineNo}: purchase line is for ${pl.sku}, not ${linkedLine.sku}.` });
    }
    if (qty > outstanding(pl))
      add({
        code: "purchase_over_receipt",
        severity: "conflict",
        lineNo: line.lineNo,
        message: `Receiving ${qty} would exceed the ${outstanding(pl)} unit(s) still outstanding on ${pl.purchase_ref ?? pl.purchase_id}.`,
      });
  }
  for (const l of lines) {
    if (!l.sku || l.purchaseLineId) continue;
    const open = purchaseLines(ctx, { skus: [l.sku] }).filter((r) => r.purchase_status === "confirmed" && outstanding(r) > 0);
    if (open.length)
      add({
        code: "purchase_not_linked",
        severity: "warning",
        lineNo: l.lineNo,
        message: `Line ${l.lineNo}: ${l.sku} has ${open.reduce((a, r) => a + outstanding(r), 0)} confirmed incoming unit(s); link the purchase line so incoming is not double counted.`,
      });
  }

  // Bays: one SKU per bay, and within that SKU's configured units per bay, given current stock.
  const occupancy = bayOccupancy(ctx.db, [...proposed.keys()]);
  for (const [locId, bySku] of proposed) {
    const loc = locations.get(locId);
    if (bySku.size > 1) {
      add({ code: "location_mixed_sku", severity: "conflict", locationId: locId, message: `${label(loc, locId)}: one bay cannot take ${[...bySku.keys()].join(" and ")}.` });
      continue;
    }
    const [sku, qty] = [...bySku][0]!;
    const occ = occupancy.get(locId);
    const others = occ ? [...occ.skus].filter((s) => s !== sku) : [];
    if (others.length) {
      add({ code: "location_occupied", severity: "conflict", locationId: locId, message: `${label(loc, locId)} already holds ${others.join(", ")}.` });
      continue;
    }
    const cap = products.get(sku)?.units_per_bay;
    if (cap === undefined) continue;
    const current = occ?.quantity ?? 0;
    if (current + qty > cap)
      add({
        code: "capacity_exceeded",
        severity: "conflict",
        locationId: locId,
        message: `${label(loc, locId)} has room for ${Math.max(0, cap - current)} more ${sku} (${cap} per bay); ${qty} proposed.`,
      });
  }
  return issues;
}

// ── Reads ─────────────────────────────────────────────────────────────────

function toReceiving(ctx: ServiceContext, row: ReceivingRow, today: string): Receiving {
  const lines = loadLines(ctx, row.id);
  return {
    id: row.id,
    supplierRef: row.supplier_ref,
    documentRef: row.document_ref,
    status: row.status,
    kind: row.kind,
    version: row.version,
    synthetic: row.synthetic === 1,
    createdBy: row.created_by,
    createdByName: actorName(row.created_by),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    postedBy: row.posted_by,
    postedByName: row.posted_by ? actorName(row.posted_by) : null,
    postedAt: row.posted_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    lines,
    issues: row.status === "draft" ? computeIssues(ctx, row, lines, today) : [],
    // Drafts: open purchase lines for their SKUs. Posted/cancelled: the lines they link, for display.
    purchaseOptions: purchaseOptions(ctx, lines, row.status === "draft"),
  };
}

const todayFor = (ctx: ServiceContext) => localDate(ctx.clock(), warehouseRow(ctx).timezone);

export function getReceiving(ctx: ServiceContext, id: string): Receiving {
  return ctx.db.transaction(() => {
    const row = loadRow(ctx, id);
    if (!row) throw new AppError("not_found", `Receiving ${id} not found.`);
    return toReceiving(ctx, row, todayFor(ctx));
  })();
}

export function listReceivings(ctx: ServiceContext, status: ReceivingStatus | null): ReceivingSummary[] {
  warehouseRow(ctx);
  const rows = ctx.db
    .query(
      `SELECT r.id, r.supplier_ref, r.document_ref, r.status, r.version, r.synthetic, r.created_at, r.posted_at,
              COALESCE((SELECT SUM(quantity) FROM receiving_line WHERE receiving_id = r.id), 0) AS total
       FROM receiving r WHERE r.warehouse_id = ? AND r.kind = 'delivery' AND (?2 IS NULL OR r.status = ?2)
       ORDER BY r.created_at DESC, r.id`,
    )
    .all(ctx.warehouseId, status) as (Omit<ReceivingRow, "kind"> & { total: number })[];
  return rows.map((r) => ({
    id: r.id,
    supplierRef: r.supplier_ref,
    documentRef: r.document_ref,
    status: r.status,
    version: r.version,
    synthetic: r.synthetic === 1,
    totalQuantity: r.total,
    createdAt: r.created_at,
    postedAt: r.posted_at,
  }));
}

// ── Draft writes (no stock effect) ────────────────────────────────────────

function authorize(actor: Actor, permission: Permission) {
  if (!can(actor.role, permission)) throw new AppError("forbidden", `The ${actor.role} role cannot perform ${permission}.`);
}

/** Rejects references to records that do not exist (422) before anything is stored. */
function checkReferences(ctx: ServiceContext, lines: ReceivingLineInput[]) {
  const fields: Record<string, string> = {};
  const skus = new Set((ctx.db.query("SELECT sku FROM product").all() as { sku: string }[]).map((r) => r.sku));
  const locs = locationInfo(ctx);
  const pls = new Set((ctx.db.query("SELECT id FROM purchase_line").all() as { id: string }[]).map((r) => r.id));
  lines.forEach((l, i) => {
    if (l.sku && !skus.has(l.sku)) fields[`lines.${i}.sku`] = `Unknown SKU ${l.sku}.`;
    if (l.purchaseLineId && !pls.has(l.purchaseLineId)) fields[`lines.${i}.purchaseLineId`] = "Unknown purchase line.";
    const seen = new Set<string>();
    l.allocations.forEach((a, j) => {
      if (!locs.has(a.locationId)) fields[`lines.${i}.allocations.${j}.locationId`] = `Unknown location ${a.locationId}.`;
      if (seen.has(a.locationId)) fields[`lines.${i}.allocations.${j}.locationId`] = "List each location once per line.";
      seen.add(a.locationId);
    });
  });
  if (Object.keys(fields).length) throw new AppError("validation_failed", "Some references do not exist.", { fields });
}

function writeLines(ctx: ServiceContext, receivingId: string, lines: ReceivingLineInput[]) {
  ctx.db.query("DELETE FROM receiving_line WHERE receiving_id = ?").run(receivingId);
  const insLine = ctx.db.query(
    `INSERT INTO receiving_line (id, receiving_id, line_no, sku, quantity, unit, received_on, purchase_line_id, length_mm, width_mm, height_mm, weight_grams)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insAlloc = ctx.db.query("INSERT INTO receiving_allocation (line_id, location_id, quantity) VALUES (?, ?, ?)");
  lines.forEach((l, i) => {
    const id = `${receivingId}-line-${i + 1}`;
    insLine.run(id, receivingId, i + 1, l.sku, l.quantity, l.unit, l.receivedOn, l.purchaseLineId, l.cargo.lengthMm, l.cargo.widthMm, l.cargo.heightMm, l.cargo.weightGrams);
    for (const a of l.allocations) insAlloc.run(id, a.locationId, a.quantity);
  });
}

const lineSummary = (lines: { sku: string | null; quantity: number | null; receivedOn: string | null; allocations: { locationId: string; quantity: number }[] }[]) =>
  lines.map((l) => ({ sku: l.sku, quantity: l.quantity, receivedOn: l.receivedOn, allocations: l.allocations.map((a) => `${a.locationId}×${a.quantity}`) }));

function duplicateReference(ctx: ServiceContext, ref: string | null, exceptId: string | null): never | void {
  if (!ref) return;
  const other = ctx.db
    .query("SELECT id, status FROM receiving WHERE warehouse_id = ? AND normalized_ref = ? AND status <> 'cancelled' AND id <> ?")
    .get(ctx.warehouseId, ref, exceptId ?? "") as { id: string; status: ReceivingStatus } | null;
  if (other) throw new AppError("duplicate_reference", `This supplier document is already recorded as ${other.status} receiving ${other.id}.`);
}

export function createReceiving(ctx: ServiceContext, actor: Actor, body: CreateReceivingBody): Receiving {
  authorize(actor, "receiving.create");
  return ctx.db.transaction(() => {
    const w = warehouseRow(ctx);
    checkReferences(ctx, body.lines);
    const ref = normalizeRef(body.supplierRef, body.documentRef);
    duplicateReference(ctx, ref, null);
    const at = ctx.clock();
    const ts = at.toISOString();
    const id = newId("rcv");
    ctx.db
      .query(
        `INSERT INTO receiving (id, warehouse_id, kind, supplier_ref, document_ref, normalized_ref, status, version, synthetic,
           created_by, created_at, updated_by, updated_at)
         VALUES (?, ?, 'delivery', ?, ?, ?, 'draft', 1, 0, ?, ?, ?, ?)`,
      )
      .run(id, ctx.warehouseId, body.supplierRef, body.documentRef, ref, actor.id, ts, actor.id, ts);
    writeLines(ctx, id, body.lines);
    recordActivity(ctx, {
      entityType: "receiving",
      entityId: id,
      entityVersion: 1,
      action: "receiving.created",
      actorId: actor.id,
      at: ts,
      localDate: localDate(at, w.timezone),
      metadata: { documentRef: body.documentRef, lines: lineSummary(body.lines) },
      synthetic: false,
    });
    bumpRevision(ctx);
    return toReceiving(ctx, loadRow(ctx, id)!, localDate(at, w.timezone));
  }).immediate();
}

function loadDraftForWrite(ctx: ServiceContext, id: string, expectedVersion: number): ReceivingRow {
  const row = loadRow(ctx, id);
  if (!row) throw new AppError("not_found", `Receiving ${id} not found.`);
  if (row.status !== "draft") throw new AppError("state_conflict", `Receiving ${row.document_ref ?? id} is ${row.status} and can no longer be changed.`, { currentVersion: row.version });
  if (row.version !== expectedVersion)
    throw new AppError("version_conflict", `Receiving was changed by someone else (now version ${row.version}). Reload before saving.`, { currentVersion: row.version });
  return row;
}

export function updateReceiving(ctx: ServiceContext, actor: Actor, id: string, body: UpdateReceivingBody): Receiving {
  authorize(actor, "receiving.edit");
  return ctx.db.transaction(() => {
    const w = warehouseRow(ctx);
    const row = loadDraftForWrite(ctx, id, body.expectedVersion);
    const before = lineSummary(loadLines(ctx, id));
    const supplierRef = body.supplierRef !== undefined ? body.supplierRef : row.supplier_ref;
    const documentRef = body.documentRef !== undefined ? body.documentRef : row.document_ref;
    const ref = normalizeRef(supplierRef, documentRef);
    duplicateReference(ctx, ref, id);
    if (body.lines) {
      checkReferences(ctx, body.lines);
      writeLines(ctx, id, body.lines);
    }
    const at = ctx.clock();
    const ts = at.toISOString();
    const version = row.version + 1;
    ctx.db
      .query("UPDATE receiving SET supplier_ref = ?, document_ref = ?, normalized_ref = ?, version = ?, updated_by = ?, updated_at = ? WHERE id = ?")
      .run(supplierRef, documentRef, ref, version, actor.id, ts, id);
    recordActivity(ctx, {
      entityType: "receiving",
      entityId: id,
      entityVersion: version,
      action: "receiving.edited",
      actorId: actor.id,
      at: ts,
      localDate: localDate(at, w.timezone),
      metadata: { before, after: body.lines ? lineSummary(body.lines) : before, supplierRef, documentRef },
      synthetic: row.synthetic === 1,
    });
    bumpRevision(ctx);
    return toReceiving(ctx, loadRow(ctx, id)!, localDate(at, w.timezone));
  }).immediate();
}

export function cancelReceiving(ctx: ServiceContext, actor: Actor, id: string, body: CancelReceivingBody): Receiving {
  authorize(actor, "receiving.cancel");
  return ctx.db.transaction(() => {
    const w = warehouseRow(ctx);
    const row = loadDraftForWrite(ctx, id, body.expectedVersion);
    const at = ctx.clock();
    const ts = at.toISOString();
    ctx.db
      .query("UPDATE receiving SET status = 'cancelled', version = ?, updated_by = ?, updated_at = ?, cancelled_by = ?, cancelled_at = ?, cancel_reason = ? WHERE id = ?")
      .run(row.version + 1, actor.id, ts, actor.id, ts, body.reason, id);
    recordActivity(ctx, {
      entityType: "receiving",
      entityId: id,
      entityVersion: row.version + 1,
      action: "receiving.cancelled",
      actorId: actor.id,
      at: ts,
      localDate: localDate(at, w.timezone),
      reason: body.reason,
      synthetic: row.synthetic === 1,
    });
    bumpRevision(ctx);
    return toReceiving(ctx, loadRow(ctx, id)!, localDate(at, w.timezone));
  }).immediate();
}

// ── Posting: the only path from a document to physical stock ──────────────

const POST_ACTION = "receiving.post";

function requestHash(id: string, body: PostReceivingBody) {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify({ id, expectedVersion: body.expectedVersion, actualGoodsChecked: body.actualGoodsChecked })).digest("hex");
}

export function postReceiving(ctx: ServiceContext, actor: Actor, id: string, body: PostReceivingBody, idempotencyKey: string | null): PostReceivingResult {
  // Authorization is checked on every request, including replays.
  authorize(actor, "receiving.post");
  if (!isIdempotencyKey(idempotencyKey))
    throw new AppError("bad_request", "An Idempotency-Key header (8–128 letters, digits, . _ : -) is required to post a receipt.");
  const hash = requestHash(id, body);

  const run = ctx.db.transaction((): PostReceivingResult => {
    const w = warehouseRow(ctx);

    // 1. A committed request with the same key replays its result before any staleness check.
    const prior = ctx.db
      .query("SELECT request_hash, response_json FROM idempotency_result WHERE warehouse_id = ? AND actor_id = ? AND action = ? AND idem_key = ?")
      .get(ctx.warehouseId, actor.id, POST_ACTION, idempotencyKey) as { request_hash: string; response_json: string } | null;
    if (prior) {
      if (prior.request_hash !== hash) throw new AppError("idempotency_conflict", "This Idempotency-Key was already used for a different request.");
      return { ...(JSON.parse(prior.response_json) as PostReceivingResult), replayed: true };
    }

    // 2. Current state and version.
    const row = loadRow(ctx, id);
    if (!row) throw new AppError("not_found", `Receiving ${id} not found.`);
    if (row.status === "posted")
      throw new AppError("state_conflict", `Receiving ${row.document_ref ?? id} is already posted; it cannot be posted again.`, { currentVersion: row.version });
    if (row.status !== "draft") throw new AppError("state_conflict", `Receiving ${row.document_ref ?? id} is ${row.status}.`, { currentVersion: row.version });
    if (row.version !== body.expectedVersion)
      throw new AppError("version_conflict", `Receiving was changed (now version ${row.version}). Review the latest draft before posting.`, {
        currentVersion: row.version,
      });
    if (!body.actualGoodsChecked)
      throw new AppError("validation_failed", "Confirm that the actual goods were physically checked.", { fields: { actualGoodsChecked: "Required." } });

    // 3. Re-validate the saved lines against current stock under the write lock.
    const at = ctx.clock();
    const ts = at.toISOString();
    const today = localDate(at, w.timezone);
    const lines = loadLines(ctx, id);
    const issues = computeIssues(ctx, row, lines, today);
    const fieldIssues = issues.filter((i) => i.severity === "field");
    const conflicts = issues.filter((i) => i.severity === "conflict");
    if (fieldIssues.length) throw new AppError("validation_failed", fieldIssues[0]!.message, { issues: fieldIssues });
    if (conflicts.length) throw new AppError("stock_conflict", conflicts[0]!.message, { issues: conflicts });
    duplicateReference(ctx, normalizeRef(row.supplier_ref, row.document_ref), id);

    // 4. Lots, balances and receipt movements.
    const synthetic = row.synthetic;
    let seq = (ctx.db.query("SELECT COALESCE(MAX(seq), 0) AS s FROM stock_movement").get() as { s: number }).s;
    const lotIds: string[] = [];
    const movementIds: string[] = [];
    const insLot = ctx.db.query(
      `INSERT INTO stock_lot (id, receiving_line_id, sku, received_on, length_mm, width_mm, height_mm, weight_grams, synthetic, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insBalance = ctx.db.query("INSERT INTO stock_balance (lot_id, location_id, on_hand) VALUES (?, ?, ?)");
    const insMovement = ctx.db.query(
      `INSERT INTO stock_movement (id, lot_id, location_id, sku, quantity, kind, source_type, source_id, source_line_id,
         actor_id, occurred_at, recorded_at, local_date, seq, synthetic)
       VALUES (?, ?, ?, ?, ?, 'receipt', 'receiving', ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    try {
      for (const l of lines) {
        const lotId = newId("lot");
        lotIds.push(lotId);
        insLot.run(lotId, l.id, l.sku, l.receivedOn, l.cargo.lengthMm, l.cargo.widthMm, l.cargo.heightMm, l.cargo.weightGrams, synthetic, ts);
        for (const a of l.allocations) {
          insBalance.run(lotId, a.locationId, a.quantity);
          const movementId = newId("mov");
          movementIds.push(movementId);
          insMovement.run(movementId, lotId, a.locationId, l.sku, a.quantity, id, l.id, actor.id, ts, ts, today, ++seq, synthetic);
        }
      }
    } catch (e) {
      if (isConstraint(e, "bay_capacity_exceeded") || isConstraint(e, "bay_holds_other_sku"))
        throw new AppError("stock_conflict", "A proposed bay no longer has room for these goods. Reload and choose another location.");
      throw e;
    }
    ctx.faults?.("receiving.post:after-balances");

    // 5. Mark posted (this also reduces linked purchase outstanding / incoming), audit, revision, idempotency.
    const version = row.version + 1;
    ctx.db.query("UPDATE receiving SET status = 'posted', version = ?, updated_by = ?, updated_at = ?, posted_by = ?, posted_at = ? WHERE id = ?").run(
      version,
      actor.id,
      ts,
      actor.id,
      ts,
      id,
    );
    const postedUnits = lines.reduce((a, l) => a + (l.quantity ?? 0), 0);
    recordActivity(ctx, {
      entityType: "receiving",
      entityId: id,
      entityVersion: version,
      action: "receiving.posted",
      actorId: actor.id,
      at: ts,
      localDate: today,
      metadata: {
        documentRef: row.document_ref,
        units: postedUnits,
        actualGoodsChecked: true,
        lines: lineSummary(lines).map((l, i) => ({ ...l, purchaseLineId: lines[i]!.purchaseLineId, lotId: lotIds[i] })),
      },
      synthetic: synthetic === 1,
    });
    const snapshotRevision = bumpRevision(ctx);
    const result: PostReceivingResult = {
      receivingId: id,
      documentRef: row.document_ref,
      status: "posted",
      version,
      lotIds,
      movementIds,
      postedUnits,
      postedAt: ts,
      snapshotRevision,
      replayed: false,
    };
    ctx.db
      .query(
        "INSERT INTO idempotency_result (warehouse_id, actor_id, action, idem_key, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(ctx.warehouseId, actor.id, POST_ACTION, idempotencyKey, hash, JSON.stringify(result), ts);
    ctx.faults?.("receiving.post:before-commit");
    return result;
  });
  return run.immediate();
}
