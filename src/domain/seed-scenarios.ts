// Demo scenarios on top of the base synthetic ledger (./seed.ts): receipts in every state, a sale at every
// workflow stage, labelled synthetic delivery quotes, a partly received purchase order and a new item whose
// unit cost is not recorded yet. Every record is fictional and labelled "(synthetic)".
//
// Rules this file keeps:
// - No random numbers. Times are fixed offsets from `now`, so the base seed (and its pinned anchors:
//   B-2140-A, DN-2291, SOFA-NORDE-3301) is unchanged.
// - Stock stays consistent: new batches use the receiving placement rule, approvals hold bays chosen by the
//   pick rule, and a collected sale reduces its batch, adds a dispatch movement and consumes its hold.
// - No fake verification. Carrier replies here are marked "Synthetic" with no reference or terms, so the app
//   refuses to submit, approve, book or collect with them. Approved and collected sales are demo history
//   (their bookings are flagged simulated); the open sale D-1002 is the one to walk through for real.
import { comparable, netRecovery, type QuoteLike } from "./costs";
import { BUYER_PLACES } from "./places";
import { lineCargo } from "./shipment";
import { applyPick, collectionPayload, planPick, planPlacement, slotCode } from "./stock";
import { DAY, type Actor, type BatchLike, type Loc, type Package, type SkuLike } from "./types";
import type { SeedBatch, SeedMovement, SeedPurchaseOrder, SeedReservation } from "./seed";

const HOUR = 3_600_000;

/** Fictional staff. The local demo's presenter acts as the owner; these names only appear in history. */
export const SYNTHETIC_STAFF = {
  owner: { role: "owner", name: "Farah (synthetic)" },
  sales: { role: "sales", name: "Aisha (synthetic)" },
  warehouse: { role: "warehouse", name: "Ravi (synthetic)" },
} as const satisfies Record<string, Actor>;
const { owner: OWNER, sales: SALES, warehouse: WAREHOUSE } = SYNTHETIC_STAFF;

/** The note every synthetic carrier reply carries; the app never approves a quote with it. */
export const SYNTHETIC_NOTE = "Synthetic";

export interface SeedReceiptLine {
  key: string;
  rawText: string;
  skuCode: string | null;
  candidates: string[];
  qty: number | null;
  /** Purchase order this line receives against (by code). */
  poCode?: string;
  locations?: Loc[];
  condition: string;
  confidence: number;
  questions: string[];
  verified: boolean;
  source: "seed";
  unit?: string | null;
  packageCount?: number | null;
  packageDimsCm?: { lCm: number | null; wCm: number | null; hCm: number | null } | null;
  itemWeightKg?: number | null;
  packageWeightKg?: number | null;
  statedTotalWeightKg?: number | null;
}

export interface SeedReceipt {
  code: string;
  status: "needs_review" | "posted" | "rejected";
  version?: number;
  postedVersion?: number;
  supplier?: string;
  docRef?: string;
  receivedAt?: number;
  evidence: { kind: "note"; text: string; at: number }[];
  lines: SeedReceiptLine[];
  extraction: { status: "idle" | "done"; at?: number };
  createdBy: Actor;
  createdAt: number;
  postedBy?: Actor;
  postedAt?: number;
  rejectReason?: string;
}

type DealStatus = "finding_buyer" | "offer_ready" | "pending_approval" | "approved" | "collected" | "rejected" | "closed";

export interface SeedDeal {
  code: string;
  batchCode: string;
  skuCode: string;
  assignee: string;
  status: DealStatus;
  brief: { ageDays: number; qty: number; bays: string[]; guideSen: number };
  buyer?: { name: string; phone?: string };
  qty: number;
  priceSen: number;
  destination?: { label: string; address: string; lat: number; lng: number; confirmedBy?: string };
  access: { floor: number; lift: boolean };
  collectAt?: number;
  unloading: "requested" | "not_needed";
  freightPayer: "merchant" | "buyer";
  packingSen: number;
  fitConfirmedBy?: string;
  cargo?: { packages: Package[]; source: "receipt" | "catalogue" | "staff"; receiptCode?: string; lineKey?: string; confirmedBy: string; confirmedAt: number };
  version: number;
  stateVersion: number;
  proposal?: { version: number; quoteKey: string; submittedBy: Actor; submittedAt: number };
  decision?: { approved: boolean; quoteKey?: string; netSen?: number | null; deliverySen?: number; by: Actor; at: number; reason?: string };
  booking?: { ref: string; carrier: string; simulated: true; recordedBy: Actor; recordedAt: number };
  collectedAt?: number;
  collectedQty?: number;
  createdBy: Actor;
  createdAt: number;
  updatedAt: number;
}

export interface SeedQuote {
  key: string;
  dealCode: string;
  dealVersion: number;
  source: "manual" | "lalamove_sandbox";
  carrier: string;
  service: string;
  status: "ok" | "error";
  requestedAt: number;
  expiresAt?: number;
  currency?: "MYR";
  totalSen?: number;
  unloading: "included" | "excluded" | "unknown";
  note: typeof SYNTHETIC_NOTE;
  error?: { kind: string; message: string };
  enteredBy?: Actor;
  requestedBy?: Actor;
}

export interface SeedCollection {
  dealCode: string;
  requestId: string;
  payload: string;
  qty: number;
  at: number;
  lines: Loc[];
  actor: Actor;
}

export interface SeedAudit {
  at: number;
  actor: Actor;
  action: string;
  /** Resolved to `deal:<id>`, `receipt:<id>` or `sku:<code>` when inserted. */
  entity: { kind: "deal" | "receipt" | "sku"; code: string };
  summary: string;
  reason?: string;
}

export interface Scenarios {
  receipts: SeedReceipt[];
  deals: SeedDeal[];
  quotes: SeedQuote[];
  collections: SeedCollection[];
  audit: SeedAudit[];
  /** Next deal number for the app's own D-#### sequence (`kv seq:D`). */
  lastDealNo: number;
}

/** The base ledger the scenarios extend. Its arrays are updated in place (new rows, changed batch bays). */
export interface BaseLedger {
  skus: (SkuLike & { synthetic: true })[];
  batches: SeedBatch[];
  reservations: SeedReservation[];
  purchaseOrders: SeedPurchaseOrder[];
  movements: SeedMovement[];
}

export function addScenarios(now: number, base: BaseLedger): Scenarios {
  /** `days` ago at a fixed local time, never later than a minute ago. */
  const past = (days: number, hour: number, minute = 0) => {
    const d = new Date(now - days * DAY);
    d.setHours(hour, minute, 0, 0);
    return Math.min(d.getTime(), now - 60_000);
  };
  /** `days` ahead at a fixed local time, always at least an hour away. */
  const ahead = (days: number, hour: number) => {
    const d = new Date(now + days * DAY);
    d.setHours(hour, 0, 0, 0);
    return Math.max(d.getTime(), now + HOUR);
  };
  const skuOf = (code: string) => base.skus.find((s) => s.code === code) ?? fail(`seed: no SKU ${code}`);
  const batchOf = (code: string) => base.batches.find((b) => b.code === code) ?? fail(`seed: no batch ${code}`);
  const active = (): BatchLike[] => base.batches.map((b) => ({ ...b, _id: b.code, status: "active" }));
  const units = (b: SeedBatch) => b.locations.reduce((a, l) => a + l.qty, 0);
  const bays = (locs: readonly Loc[]) => locs.map((l) => slotCode(l.slot));
  /** Place a new batch where receiving would: the SKU's zones first, then its home zone. */
  const place = (code: string, qty: number) => planPlacement(skuOf(code), qty, active()) ?? fail(`seed: no room for ${qty} × ${code}`);

  const audit: SeedAudit[] = [];
  const log = (at: number, actor: Actor, action: string, kind: SeedAudit["entity"]["kind"], code: string, summary: string, reason?: string) =>
    audit.push({ at, actor, action, entity: { kind, code }, summary, ...(reason ? { reason } : {}) });

  // ── Catalogue: a new item whose purchase cost is not recorded yet ────────────
  // Received through "New arrivals" with a retail price but no supplier invoice: replenishment cannot
  // estimate a budget for it, and it is low on stock.
  const lamp: SkuLike & { synthetic: true } = {
    code: "LAMP-ORBI-0450", category: "general", model: "Table Lamp", variant: "Smoked glass", kind: "lamp",
    cap: 10, doors: 0, color: "#6b6f78", homeFloor: 2, homeZone: "B",
    packages: [{ lCm: 48, wCm: 48, hCm: 62, kg: 4.2 }],
    price: { listSen: 18_900, clearanceSen: 12_900, unitCostSen: 0 },
    addedAt: past(9, 10), synthetic: true,
  };
  base.skus.push(lamp);
  log(past(9, 10), OWNER, "catalogue_item", "sku", lamp.code, `${lamp.code} added to catalogue without stock · unit cost not recorded`);

  // ── Purchase order received in part ─────────────────────────────────────────
  const tableSku = skuOf("TABLE-LUMA-1860");
  const partialPo: SeedPurchaseOrder = {
    code: "PO-3050", skuCode: tableSku.code, qty: 6, qtyReceived: 3, status: "open", createdAt: past(12, 10),
    unitCostSen: tableSku.price.unitCostSen, supplier: "Luma Furniture (synthetic)", orderRef: "SYN-PO-3050", confirmedAt: past(12, 10),
  };
  base.purchaseOrders.push(partialPo);

  // ── Receipts ────────────────────────────────────────────────────────────────
  const receipts: SeedReceipt[] = [];
  const posted = (r: Omit<SeedReceipt, "status" | "version" | "postedVersion" | "extraction" | "createdBy" | "postedBy">) =>
    receipts.push({ ...r, status: "posted", version: 4, postedVersion: 3, extraction: { status: "idle" }, createdBy: WAREHOUSE, postedBy: WAREHOUSE });
  const measured = (line: Omit<SeedReceiptLine, "candidates" | "confidence" | "questions" | "verified" | "source" | "condition">): SeedReceiptLine =>
    ({ candidates: line.skuCode ? [line.skuCode] : [], confidence: 1, questions: [], verified: true, source: "seed", condition: "good", ...line });

  // RC-470: the delivery note behind the 160-day mirror wardrobe batch, with measured packages.
  // D-1002 ships this stock using these measurements ("Measured at receiving").
  const wardrobe = batchOf("B-2000W-A");
  const wardrobeRef = base.movements.find((m) => m.batchCode === wardrobe.code && m.kind === "receive")?.ref ?? "DN-2100";
  const wardrobeLine = measured({
    key: "l0", rawText: "Sliding mirror wardrobe 2-door × 4", skuCode: wardrobe.skuCode, qty: units(wardrobe), locations: wardrobe.locations,
    unit: "sets", packageCount: units(wardrobe), packageDimsCm: { lCm: 204, wCm: 64, hCm: 31 }, packageWeightKg: 78, statedTotalWeightKg: 78 * units(wardrobe),
  });
  posted({
    code: "RC-470", supplier: "Vela Interiors (synthetic)", docRef: wardrobeRef, receivedAt: wardrobe.receivedAt,
    evidence: [{ kind: "note", text: `Synthetic delivery note ${wardrobeRef}: 4 sliding mirror wardrobes, 4 cartons, 204 × 64 × 31 cm, 78 kg each.`, at: wardrobe.receivedAt }],
    lines: [wardrobeLine], createdAt: wardrobe.receivedAt, postedAt: wardrobe.receivedAt + HOUR,
  });
  wardrobe.receiptCode = "RC-470";

  // RC-472: three of six ordered oak tables arrived; PO-3050 stays open for the other three.
  const tableAt = past(4, 14);
  const tableLocs = place(tableSku.code, 3);
  const tableBatch: SeedBatch = { code: "B-1860-B", skuCode: tableSku.code, receivedAt: tableAt, qtyReceived: 3, locations: tableLocs, receiptCode: "RC-472" };
  base.batches.push(tableBatch);
  base.movements.push({ at: tableAt + HOUR, skuCode: tableSku.code, batchCode: tableBatch.code, kind: "receive", reason: "supplier_receipt", qty: 3, lines: tableLocs, ref: "DN-2287", actor: WAREHOUSE });
  posted({
    code: "RC-472", supplier: "Luma Furniture (synthetic)", docRef: "DN-2287", receivedAt: tableAt,
    evidence: [{ kind: "note", text: "Synthetic delivery note DN-2287 against PO-3050: 3 of 6 oak extendable tables (6 seats), 2 cartons per table. Balance to follow.", at: tableAt }],
    lines: [measured({
      key: "l0", rawText: "Oak extendable table 6 seats × 3 (part of PO-3050)", skuCode: tableSku.code, qty: 3, poCode: partialPo.code, locations: tableLocs,
      unit: "pcs", packageCount: 6, packageDimsCm: { lCm: 192, wCm: 96, hCm: 14 }, packageWeightKg: 31.5, statedTotalWeightKg: 189,
    })],
    createdAt: tableAt, postedAt: tableAt + HOUR,
  });

  // RC-473: first delivery of the new lamp; two have sold since, so two remain (low stock).
  const lampAt = past(8, 11);
  const lampLocs = place(lamp.code, 4);
  const lampBatch: SeedBatch = { code: "B-0450L-A", skuCode: lamp.code, receivedAt: lampAt, qtyReceived: 4, locations: lampLocs, receiptCode: "RC-473" };
  base.batches.push(lampBatch);
  base.movements.push({ at: lampAt + HOUR, skuCode: lamp.code, batchCode: lampBatch.code, kind: "receive", reason: "supplier_receipt", qty: 4, lines: lampLocs, ref: "OL-INV-2207", actor: WAREHOUSE });
  posted({
    code: "RC-473", supplier: "Orbis Lighting (synthetic)", docRef: "OL-INV-2207", receivedAt: lampAt,
    evidence: [{ kind: "note", text: "Synthetic invoice OL-INV-2207: 4 table lamps, smoked glass, boxed singly (48 × 48 × 62 cm, 4.2 kg). Unit cost to follow on the supplier statement.", at: lampAt }],
    lines: [measured({
      key: "l0", rawText: "Table lamp smoked glass × 4 (new model)", skuCode: lamp.code, qty: 4, locations: lampLocs,
      unit: "pcs", packageCount: 4, packageDimsCm: { lCm: 48, wCm: 48, hCm: 62 }, packageWeightKg: 4.2, statedTotalWeightKg: 16.8,
    })],
    createdAt: lampAt, postedAt: lampAt + HOUR,
  });
  for (const [days, ref] of [[5, "O-6101"], [2, "O-6102"]] as const) {
    const pick = planPick(lampBatch.locations, 1);
    lampBatch.locations = applyPick(lampBatch.locations, pick);
    base.movements.push({ at: past(days, 15), skuCode: lamp.code, batchCode: lampBatch.code, kind: "dispatch", reason: "sale", qty: 1, lines: pick, ref, actor: WAREHOUSE });
  }

  // RC-474: waiting for review. A known line linked to its order, a line with no catalogue match,
  // and a line whose quantity could not be read. Measurements are partly missing.
  const reviewAt = now - 90 * 60_000;
  receipts.push({
    code: "RC-474", status: "needs_review", version: 1, supplier: "Brun Timber (synthetic)", docRef: "BT-5531", receivedAt: reviewAt,
    evidence: [{ kind: "note", text: "Synthetic transcript of the driver's voice note: “Twelve black folding chairs in three cartons, about 18 kilo a carton. Two teak benches, 150. Marble side tables — the count is smudged on the note.”", at: reviewAt }],
    lines: [
      { key: "l0", rawText: "Folding chair black × 12 (3 cartons)", skuCode: "CHAIR-TEKO-0200", candidates: ["CHAIR-TEKO-0200"], qty: 12, poCode: "PO-3045", condition: "", confidence: 0.9, questions: [], verified: false, source: "seed",
        unit: "pcs", packageCount: 3, packageDimsCm: { lCm: 92, wCm: 48, hCm: 30 }, packageWeightKg: 18, statedTotalWeightKg: null },
      { key: "l1", rawText: "Teak bench 150 cm × 2", skuCode: null, candidates: [], qty: 2, condition: "", confidence: 0.4, verified: false, source: "seed",
        questions: ["No catalogue item matches “teak bench”. Create the item (Receive → Item) or check the supplier code."] },
      { key: "l2", rawText: "Marble side table × ? (count smudged)", skuCode: "TABLE-VELA-0450", candidates: ["TABLE-VELA-0450", "TABLE-VELA-2000"], qty: null, condition: "", confidence: 0.35, verified: false, source: "seed",
        questions: ["Quantity is unreadable on the note. Count the cartons on the dock."] },
    ],
    extraction: { status: "done", at: reviewAt + 5 * 60_000 },
    createdBy: WAREHOUSE, createdAt: reviewAt,
  });

  // RC-475: refused at the dock, so no stock was added.
  const refusedAt = past(3, 15);
  receipts.push({
    code: "RC-475", status: "rejected", version: 2, supplier: "Kira Leather (synthetic)", docRef: "KL-7781", receivedAt: refusedAt,
    evidence: [{ kind: "note", text: "Synthetic note KL-7781: 2 tan leather recliner sofas. Driver notes torn armrest on both.", at: refusedAt }],
    lines: [{ key: "l0", rawText: "Recliner sofa tan leather × 2 — armrest torn", skuCode: "SOFA-KIRA-7701", candidates: ["SOFA-KIRA-7701"], qty: 2, condition: "damaged", confidence: 0.95, questions: [], verified: true, source: "seed" }],
    extraction: { status: "idle" }, createdBy: WAREHOUSE, createdAt: refusedAt,
    rejectReason: "Refused at the dock: both units damaged. Supplier collects and re-delivers (synthetic).",
  });

  for (const r of receipts) {
    log(r.createdAt, r.createdBy, "receipt", "receipt", r.code, `${r.code} started`);
    log(r.createdAt + 10 * 60_000, r.createdBy, "edit_lines", "receipt", r.code, `${r.lines.length} ${r.lines.length === 1 ? "line" : "lines"} entered from the synthetic note (no AI request)`);
    if (r.status === "posted") {
      const linked = r.lines.find((l) => l.poCode);
      log(r.postedAt!, r.postedBy!, "post", "receipt", r.code,
        r.lines.map((l) => `${l.qty} × ${l.skuCode} → ${bays(l.locations ?? []).join(", ")}`).join("; ") + (linked ? ` · ${linked.poCode} ${partialPo.qtyReceived} of ${partialPo.qty} received` : ""));
    }
    if (r.status === "rejected") log(r.createdAt + 20 * 60_000, r.createdBy, "reject", "receipt", r.code, "Rejected", r.rejectReason);
  }
  log(now - 2 * HOUR, SYNTHETIC_STAFF.warehouse, "receipt", "receipt", "DN-2291", "DN-2291 started · synthetic handwritten note entered");

  // ── Sales at every stage ────────────────────────────────────────────────────
  const deals: SeedDeal[] = [];
  const quotes: SeedQuote[] = [];
  const collections: SeedCollection[] = [];
  const [ss2, ss15, cheras] = BUYER_PLACES as [typeof BUYER_PLACES[number], typeof BUYER_PLACES[number], typeof BUYER_PLACES[number]];
  const where = (p: typeof ss2, confirmed: boolean) => ({ label: p.label, address: p.address, lat: p.lat, lng: p.lng, ...(confirmed ? { confirmedBy: SALES.name } : {}) });

  /** Start a sale the way the owner hands stock to sales (deals.create). */
  const start = (no: number, batchCode: string, createdAt: number): SeedDeal => {
    const b = batchOf(batchCode);
    const s = skuOf(b.skuCode);
    const qty = units(b) - base.reservations.filter((r) => r.batchCode === b.code && (r.status ?? "active") === "active").reduce((a, r) => a + r.qty, 0);
    const code = `D-${no}`;
    log(createdAt, OWNER, "handoff", "deal", code, `${b.code} → ${SALES.name}`);
    return {
      code, batchCode: b.code, skuCode: b.skuCode, assignee: SALES.name, status: "finding_buyer",
      brief: { ageDays: Math.floor((createdAt - b.receivedAt) / DAY), qty, bays: bays(b.locations), guideSen: s.price.clearanceSen },
      qty, priceSen: s.price.clearanceSen * qty, access: { floor: 0, lift: true }, unloading: "requested", freightPayer: "merchant",
      packingSen: 0, version: 1, stateVersion: 0, createdBy: OWNER, createdAt, updatedAt: createdAt,
    };
  };
  const catalogueCargo = (code: string, at: number) => ({ packages: skuOf(code).packages, source: "catalogue" as const, confirmedBy: SALES.name, confirmedAt: at });
  /** A synthetic carrier reply, shaped like the app's own "Demo" replies: no reference, terms or verification. */
  const reply = (d: SeedDeal, n: number, carrier: string, service: string, totalSen: number, unloading: SeedQuote["unloading"], requestedAt: number, expiresAt: number): SeedQuote => {
    const q: SeedQuote = { key: `${d.code}:q${n}`, dealCode: d.code, dealVersion: d.version, source: "manual", carrier, service, status: "ok", requestedAt, expiresAt, currency: "MYR", totalSen, unloading, note: SYNTHETIC_NOTE, enteredBy: SALES };
    quotes.push(q);
    return q;
  };
  const netOf = (d: SeedDeal, q: SeedQuote) => {
    const c = comparable({ ...q, _id: q.key } as QuoteLike, d);
    return { netSen: netRecovery(d, c).netSen, deliverySen: c.kind === "complete" ? c.sen : 0 };
  };
  /** Buyer offer recorded (deals.update) and the location confirmed with the buyer. */
  const offer = (d: SeedDeal, at: number, o: Pick<SeedDeal, "buyer" | "qty" | "priceSen" | "destination" | "access" | "collectAt"> & Partial<Pick<SeedDeal, "unloading" | "freightPayer" | "packingSen">>) => {
    Object.assign(d, o, { status: "offer_ready", version: d.version + 1, stateVersion: d.stateVersion + 1, updatedAt: at });
    log(at, SALES, "edit", "deal", d.code, `v${d.version} · ${o.buyer!.name} · ${o.qty} × RM${(o.priceSen / 100).toFixed(0)}`);
    if (o.destination?.confirmedBy) {
      d.stateVersion++;
      log(at + 30 * 60_000, SALES, "confirm_location", "deal", d.code, o.destination.label);
    }
  };
  const cargo = (d: SeedDeal, at: number, c: NonNullable<SeedDeal["cargo"]>, actor: Actor = SALES) => {
    Object.assign(d, { cargo: c, version: d.version + 1, stateVersion: d.stateVersion + 1, updatedAt: at });
    log(at, actor, "cargo", "deal", d.code, `${c.packages.length} package(s) per unit · ${c.source}`);
    d.fitConfirmedBy = actor.name;
    d.stateVersion++;
    log(at + 15 * 60_000, actor, "confirm_fit", "deal", d.code, "Vehicle fit checked");
  };
  const submit = (d: SeedDeal, q: SeedQuote, at: number) => {
    Object.assign(d, { status: "pending_approval", proposal: { version: d.version, quoteKey: q.key, submittedBy: SALES, submittedAt: at }, stateVersion: d.stateVersion + 1, updatedAt: at });
    log(at, SALES, "submit", "deal", d.code, `v${d.version} for approval · synthetic carrier reply`);
  };

  // D-1001 · Finding buyer: the 140-day marble table, just handed to sales.
  const d1 = start(1001, "B-2000-A", past(2, 9, 30));
  deals.push(d1);

  // D-1002 · Ready for quotations: every detail confirmed, cargo measured at receiving, three synthetic
  // carrier replies (current, unknown unloading, expired) and a failed sandbox example. This is the live
  // walkthrough: record the carrier's verified reply (Add quote), send for approval, approve, record the
  // carrier reference, collect.
  const d2 = start(1002, "B-2000W-A", past(6, 10));
  offer(d2, past(5, 11), {
    buyer: { name: "Seri Damansara Homestay (synthetic)", phone: "+60 3-0000 0142" }, qty: 2, priceSen: 84_000,
    destination: where(ss2, true), access: { floor: 3, lift: true }, collectAt: ahead(5, 10), packingSen: 4_000,
  });
  const wardrobeCargo = lineCargo(wardrobeLine).perUnit ?? fail("seed: wardrobe receipt line must determine its packages");
  cargo(d2, past(4, 16), { packages: wardrobeCargo, source: "receipt", receiptCode: "RC-470", lineKey: wardrobeLine.key, confirmedBy: SALES.name, confirmedAt: past(4, 16) });
  const asked = past(1, 10);
  reply(d2, 1, "Pantai Movers (synthetic)", "Lorry 10ft", 28_000, "included", asked, ahead(4, 18));
  reply(d2, 2, "Klang Valley Vans (synthetic)", "Van", 22_000, "unknown", asked, ahead(4, 18));
  reply(d2, 3, "Bukit Lorry Co (synthetic)", "Lorry 14ft", 30_000, "included", asked, now - 2 * HOUR);
  quotes.push({
    key: `${d2.code}:q4`, dealCode: d2.code, dealVersion: d2.version, source: "lalamove_sandbox", carrier: "Lalamove", service: "VAN", status: "error",
    requestedAt: asked, unloading: "unknown", note: SYNTHETIC_NOTE, requestedBy: SALES,
    error: { kind: "unavailable", message: "Synthetic example, no request was sent: this is how a failed sandbox quote looks. Connect Lalamove and request again, or record a carrier reply." },
  });
  log(asked, SALES, "quote", "deal", d2.code, "3 synthetic carrier replies · 1 synthetic failed sandbox example (no request sent)");
  deals.push(d2);

  // D-1003 · Offer recorded but not ready for quotes: location unconfirmed, no shipment measurements.
  const d3 = start(1003, "B-2030-A", past(3, 9));
  offer(d3, past(1, 15), {
    buyer: { name: "Kopi Corner Café (synthetic)", phone: "+60 3-0000 0177" }, qty: 3, priceSen: 84_000,
    destination: where(cheras, false), access: { floor: 0, lift: false }, collectAt: ahead(6, 14), unloading: "not_needed",
  });
  deals.push(d3);

  // D-1004 · Pending approval with a synthetic reply: the owner can reject, but cannot approve until a
  // verified carrier reply is recorded. Cargo was measured by staff.
  const d4 = start(1004, "B-0800-A", past(7, 9));
  offer(d4, past(6, 11), {
    buyer: { name: "Tan Wei Ling (synthetic)", phone: "+60 3-0000 0318" }, qty: 2, priceSen: 76_000,
    destination: where(ss15, true), access: { floor: 0, lift: true }, collectAt: ahead(6, 11), unloading: "not_needed",
  });
  cargo(d4, past(5, 14), { packages: [{ lCm: 198, wCm: 92, hCm: 34, kg: 31 }, { lCm: 96, wCm: 40, hCm: 18, kg: 6.5 }], source: "staff", confirmedBy: SYNTHETIC_STAFF.warehouse.name, confirmedAt: past(5, 14) }, WAREHOUSE);
  const q4 = reply(d4, 1, "Pantai Movers (synthetic)", "Van", 18_000, "unknown", now - 6 * HOUR, ahead(4, 18));
  submit(d4, q4, now - 3 * HOUR);
  deals.push(d4);

  // D-1005 · Approved, waiting for collection. Demo history: the approval reserved bays with the pick rule,
  // but its carrier reply is synthetic, so no carrier can be recorded and nothing can be collected.
  const d5 = start(1005, "B-0900M-A", past(9, 9));
  offer(d5, past(8, 11), {
    buyer: { name: "Studio Cermin Interiors (synthetic)", phone: "+60 3-0000 0265" }, qty: 5, priceSen: 70_000,
    destination: where(cheras, true), access: { floor: 1, lift: false }, collectAt: ahead(4, 9),
  });
  cargo(d5, past(7, 15), catalogueCargo(d5.skuCode, past(7, 15)));
  const q5 = reply(d5, 1, "Klang Valley Vans (synthetic)", "Van", 15_000, "included", past(2, 10), ahead(4, 18));
  submit(d5, q5, past(2, 12));
  const approvedAt = past(1, 9);
  const holdPick = planPick(batchOf(d5.batchCode).locations, d5.qty);
  base.reservations.push({ skuCode: d5.skuCode, batchCode: d5.batchCode, qty: d5.qty, label: d5.code, pick: holdPick, status: "active", dealCode: d5.code, createdAt: approvedAt });
  Object.assign(d5, { status: "approved", decision: { approved: true, quoteKey: q5.key, ...netOf(d5, q5), by: OWNER, at: approvedAt }, stateVersion: d5.stateVersion + 1, updatedAt: approvedAt });
  log(approvedAt, OWNER, "approve", "deal", d5.code, `Reserved ${d5.qty} · ${bays(holdPick).join(", ")} · synthetic demo approval, no carrier contacted`);

  // D-1006 · Collected earlier today. Demo history: simulated booking; the collection reduced the batch's
  // bays, added a dispatch movement and consumed the hold.
  const d6 = start(1006, "B-0620-A", past(9, 10));
  offer(d6, past(8, 14), {
    buyer: { name: "Rumah Rehat Cameron (synthetic)", phone: "+60 3-0000 0431" }, qty: 6, priceSen: 126_000,
    destination: where(ss15, true), access: { floor: 0, lift: true }, collectAt: now - 5 * HOUR,
  });
  cargo(d6, past(7, 10), catalogueCargo(d6.skuCode, past(7, 10)));
  const q6 = reply(d6, 1, "Pantai Movers (synthetic)", "Lorry 10ft", 26_000, "included", past(6, 10), past(4, 18));
  submit(d6, q6, past(6, 12));
  const d6Approved = past(5, 9);
  const d6Batch = batchOf(d6.batchCode);
  const d6Pick = planPick(d6Batch.locations, d6.qty);
  Object.assign(d6, { status: "approved", decision: { approved: true, quoteKey: q6.key, ...netOf(d6, q6), by: OWNER, at: d6Approved }, stateVersion: d6.stateVersion + 1 });
  log(d6Approved, OWNER, "approve", "deal", d6.code, `Reserved ${d6.qty} · ${bays(d6Pick).join(", ")} · synthetic demo approval, no carrier contacted`);
  const bookedAt = past(4, 11);
  d6.booking = { ref: "SIM-D-1006", carrier: q6.carrier, simulated: true, recordedBy: SALES, recordedAt: bookedAt };
  d6.stateVersion++;
  log(bookedAt, SALES, "booking", "deal", d6.code, `Simulated booking SIM-D-1006 · ${q6.carrier} · synthetic, no carrier contacted`);
  const collectedAt = now - 5 * HOUR;
  d6Batch.locations = applyPick(d6Batch.locations, d6Pick);
  base.reservations.push({ skuCode: d6.skuCode, batchCode: d6.batchCode, qty: 0, label: d6.code, pick: [], status: "consumed", dealCode: d6.code, createdAt: d6Approved });
  base.movements.push({ at: collectedAt, skuCode: d6.skuCode, batchCode: d6.batchCode, kind: "dispatch", reason: "sale", qty: d6.qty, lines: d6Pick, ref: d6.code, actor: WAREHOUSE });
  collections.push({ dealCode: d6.code, requestId: `seed:${d6.code}`, payload: collectionPayload(d6Pick, collectedAt, true), qty: d6.qty, at: collectedAt, lines: d6Pick, actor: WAREHOUSE });
  Object.assign(d6, { status: "collected", collectedQty: d6.qty, collectedAt, version: d6.version + 1, stateVersion: d6.stateVersion + 1, updatedAt: collectedAt });
  log(collectedAt, WAREHOUSE, "collect", "deal", d6.code, `${d6.qty} out · ${d6Pick.map((p) => `${slotCode(p.slot)} ×${p.qty}`).join(", ")}`);

  // D-1007 · Rejected by the owner with a reason; sales can revise the offer and resubmit.
  const d7 = start(1007, "B-7701-A", past(6, 9));
  offer(d7, past(5, 10), {
    buyer: { name: "Hafiz Rahman (synthetic)", phone: "+60 3-0000 0590" }, qty: 2, priceSen: 152_000,
    destination: where(ss2, true), access: { floor: 12, lift: true }, collectAt: ahead(7, 10),
  });
  cargo(d7, past(4, 15), catalogueCargo(d7.skuCode, past(4, 15)));
  const q7 = reply(d7, 1, "Bukit Lorry Co (synthetic)", "Lorry 10ft", 32_000, "included", past(3, 10), ahead(4, 18));
  submit(d7, q7, past(3, 12));
  const rejectedAt = past(2, 9);
  const why = "RM1,200 net is under the RM1,400 guide for two recliners. Ask the buyer about RM1,700 or buyer-paid delivery.";
  Object.assign(d7, { status: "rejected", decision: { approved: false, by: OWNER, at: rejectedAt, reason: why }, stateVersion: d7.stateVersion + 1, updatedAt: rejectedAt });
  log(rejectedAt, OWNER, "reject", "deal", d7.code, "Rejected", why);

  // D-1008 · Closed: the buyer withdrew before quotes.
  const d8 = start(1008, "B-1400-A", past(12, 9));
  offer(d8, past(11, 10), {
    buyer: { name: "Lim Mei Yee (synthetic)", phone: "+60 3-0000 0733" }, qty: 2, priceSen: 38_000,
    destination: where(ss2, false), access: { floor: 2, lift: false }, collectAt: past(8, 10),
  });
  const closedAt = past(10, 16);
  Object.assign(d8, { status: "closed", version: d8.version + 1, stateVersion: d8.stateVersion + 1, updatedAt: closedAt });
  log(closedAt, SALES, "close", "deal", d8.code, "Closed", "Buyer bought elsewhere before quotes were requested (synthetic).");

  deals.push(d5, d6, d7, d8);
  base.movements.sort((a, b) => b.at - a.at);
  audit.sort((a, b) => a.at - b.at);
  return { receipts, deals, quotes, collections, audit, lastDealNo: 1008 };
}

function fail(message: string): never {
  throw new Error(message);
}
