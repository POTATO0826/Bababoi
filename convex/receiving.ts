// Receiving: evidence (photo / document / voice) → draft lines → warehouse verifies → stock posted into bays.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { actor, furnitureKind, loc, pkg, receiptLine } from "./schema";
import { activeBatches, audit, fail, nextCode, skuByCode } from "./lib";
import { getActor, getViewer } from "./access";
import { SLOT_BY_ID } from "../src/data/layout";
import { cleanMeasures } from "../src/domain/measure";
import { slotCode } from "../src/domain/stock";

const versionOf = (r: { version?: number }) => r.version ?? 1;
function expectVersion(r: { version?: number }, expectedVersion: number) {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion !== versionOf(r)) fail("Receipt changed — refresh and try again");
}
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const clean = (s: string) => s.trim().replace(/\s+/g, " ");
const documentKey = (supplier?: string, docRef?: string) => {
  const ref = docRef && clean(docRef).toUpperCase();
  return ref ? `${clean(supplier ?? "").toUpperCase()}\u0000${ref}` : undefined;
};

/** Staff-entered measurements: unknown stays empty; an invalid number is refused rather than dropped. */
function staffMeasures(l: Doc<"receipts">["lines"][number]) {
  const cleaned = cleanMeasures(l);
  const numbers = ["packageCount", "itemWeightKg", "packageWeightKg", "statedTotalWeightKg"] as const;
  const sides = ["lCm", "wCm", "hCm"] as const;
  if (numbers.some((k) => l[k] != null && cleaned[k] === null) || sides.some((k) => l.packageDimsCm?.[k] != null && cleaned.packageDimsCm?.[k] == null)) {
    fail(`${l.rawText.slice(0, 40)}: measurements must be positive numbers (package count a whole number); leave unknown values empty`);
  }
  return cleaned;
}

export const generateUploadUrl = mutation({
  args: { actor },
  handler: async (ctx) => {
    await getActor(ctx, "owner", "warehouse");
    return await ctx.storage.generateUploadUrl();
  },
});

export const get = query({
  args: { receiptId: v.id("receipts") },
  handler: async (ctx, { receiptId }) => {
    await getViewer(ctx);
    const r = await ctx.db.get("receipts", receiptId);
    if (!r) return null;
    const evidence = await Promise.all(
      r.evidence.map(async (e) => ({ ...e, url: e.storageId ? await ctx.storage.getUrl(e.storageId) : null })),
    );
    // The live ledger only carries open orders; a posted receipt still shows the order it received against.
    const linkedIds = [...new Set(r.lines.flatMap((l) => l.purchaseOrderId ? [l.purchaseOrderId] : []))];
    const linkedPurchaseOrders = (await Promise.all(linkedIds.map((id) => ctx.db.get("purchaseOrders", id))))
      .flatMap((po) => po ? [{ _id: po._id, code: po.code, status: po.status, outstanding: po.qty - po.qtyReceived, supplier: po.supplier ?? null }] : []);
    return { ...r, evidence, linkedPurchaseOrders };
  },
});

export const create = mutation({
  args: { actor },
  handler: async (ctx) => {
    const actor = await getActor(ctx, "owner", "warehouse");
    const code = await nextCode(ctx, "RC", 501);
    const now = Date.now();
    const id = await ctx.db.insert("receipts", {
      code,
      version: 1,
      status: "needs_review",
      evidence: [],
      lines: [],
      extraction: { status: "idle" },
      createdBy: actor,
      createdAt: now,
      synthetic: false,
    });
    await audit(ctx, actor, "receipt", `receipt:${id}`, `${code} started`);
    return id;
  },
});

export const addEvidence = mutation({
  args: {
    actor,
    receiptId: v.id("receipts"),
    expectedVersion: v.number(),
    kind: v.union(v.literal("photo"), v.literal("document"), v.literal("voice"), v.literal("note")),
    storageId: v.optional(v.id("_storage")),
    text: v.optional(v.string()),
    mime: v.optional(v.string()),
  },
  handler: async (ctx, { receiptId, expectedVersion, kind, storageId, text, mime }) => {
    await getActor(ctx, "owner", "warehouse");
    const r = (await ctx.db.get("receipts", receiptId)) ?? fail("Receipt not found");
    if (r.status !== "needs_review") fail("Receipt is closed");
    expectVersion(r, expectedVersion);
    if (r.evidence.length >= 8) fail("Up to 8 items");
    const note = text?.trim();
    let mediaType: string | undefined;
    if (kind === "photo" || kind === "document") {
      if (!storageId) fail("Upload a file before attaching it");
      const metadata = await ctx.db.system.get("_storage", storageId);
      if (!metadata || metadata.size <= 0 || metadata.size > 20 * 1024 * 1024) fail("Evidence file must exist and be no larger than 20 MB");
      mediaType = metadata.contentType;
      if (!mediaType || (!IMAGE_TYPES.has(mediaType) && !(kind === "document" && mediaType === "application/pdf"))) fail("Attach a supported image or PDF document");
      if (mime && mime !== mediaType) fail("Evidence file type does not match the upload");
    } else {
      if (storageId || !note) fail("Enter the note or voice transcript");
    }
    await ctx.db.patch("receipts", receiptId, {
      version: versionOf(r) + 1,
      ...(r.extraction.status === "running" ? { extraction: { status: "idle" as const } } : {}),
      evidence: [
        ...r.evidence,
        { kind, at: Date.now(), ...(storageId ? { storageId } : {}), ...(note ? { text: note.slice(0, 4000) } : {}), ...(mediaType ? { mime: mediaType } : {}) },
      ],
    });
    return versionOf(r) + 1;
  },
});

/** Ask Claude to draft lines from the evidence. Runs in the background; status shows on the receipt. */
export const requestExtraction = mutation({
  args: { actor, receiptId: v.id("receipts"), expectedVersion: v.number() },
  handler: async (ctx, { receiptId, expectedVersion }) => {
    const actor = await getActor(ctx, "owner", "warehouse");
    const r = (await ctx.db.get("receipts", receiptId)) ?? fail("Receipt not found");
    if (r.status !== "needs_review") fail("Receipt is closed");
    expectVersion(r, expectedVersion);
    if (r.extraction.status === "running") return null;
    if (!r.evidence.length) fail("Add a photo, document or voice note first");
    const jobVersion = versionOf(r) + 1;
    await ctx.db.patch("receipts", receiptId, { version: jobVersion, extraction: { status: "running", at: Date.now(), jobVersion, requestedBy: actor } });
    await ctx.scheduler.runAfter(0, internal.ai.extractReceipt, { receiptId, jobVersion });
    await audit(ctx, actor, "extract", `receipt:${receiptId}`, "AI reading requested");
    return jobVersion;
  },
});

/** Staff edits to the draft lines (corrections keep `source: "staff"`). */
export const saveLines = mutation({
  args: { actor, receiptId: v.id("receipts"), expectedVersion: v.number(), lines: v.array(receiptLine) },
  handler: async (ctx, { receiptId, expectedVersion, lines }) => {
    const actor = await getActor(ctx, "owner", "warehouse");
    const r = (await ctx.db.get("receipts", receiptId)) ?? fail("Receipt not found");
    if (r.status !== "needs_review") fail("Receipt is closed");
    expectVersion(r, expectedVersion);
    if (lines.length > 30) fail("Too many lines");
    if (lines.some(l => !l.key.trim()) || new Set(lines.map((l) => l.key)).size !== lines.length) fail("Line keys must be unique and nonempty");
    await ctx.db.patch("receipts", receiptId, {
      lines: lines.map(l => ({ ...l, ...staffMeasures(l), source: "staff" as const })), version: versionOf(r) + 1,
      ...(r.extraction.status === "running" ? { extraction: { status: "idle" as const } } : {}),
    });
    await audit(ctx, actor, "edit_lines", `receipt:${receiptId}`, `${lines.length} lines`);
    return versionOf(r) + 1;
  },
});

/** Staff records the supplier document and actual arrival date before posting. */
export const saveDetails = mutation({
  args: {
    actor, receiptId: v.id("receipts"), expectedVersion: v.number(),
    supplier: v.optional(v.string()), docRef: v.optional(v.string()), receivedAt: v.optional(v.number()),
  },
  handler: async (ctx, { receiptId, expectedVersion, supplier, docRef, receivedAt }) => {
    const actor = await getActor(ctx, "owner", "warehouse");
    const r = (await ctx.db.get("receipts", receiptId)) ?? fail("Receipt not found");
    if (r.status !== "needs_review") fail("Receipt is closed");
    expectVersion(r, expectedVersion);
    if (receivedAt !== undefined && (!Number.isSafeInteger(receivedAt) || receivedAt < Date.UTC(2000, 0, 1) || receivedAt > Date.now())) fail("Invalid received date");
    const nextSupplier = supplier === undefined ? r.supplier : clean(supplier).slice(0, 120) || undefined;
    const nextRef = docRef === undefined ? r.docRef : clean(docRef).slice(0, 80) || undefined;
    await ctx.db.patch("receipts", receiptId, {
      supplier: nextSupplier, docRef: nextRef, receivedAt: receivedAt ?? r.receivedAt,
      version: versionOf(r) + 1,
      ...(r.extraction.status === "running" ? { extraction: { status: "idle" as const } } : {}),
    });
    await audit(ctx, actor, "edit_details", `receipt:${receiptId}`, "Receipt details updated");
    return versionOf(r) + 1;
  },
});

/** Counted goods are posted once; all locations and linked purchases validate in one transaction. */
export const post = mutation({
  args: { actor, receiptId: v.id("receipts"), expectedVersion: v.number() },
  handler: async (ctx, { receiptId, expectedVersion }) => {
    const actor = await getActor(ctx, "owner", "warehouse");
    const r = (await ctx.db.get("receipts", receiptId)) ?? fail("Receipt not found");
    // The receipt ID is the posting key: network retries cannot receive it twice.
    if (r.status === "posted") return null;
    if (r.status !== "needs_review") fail("Already closed");
    expectVersion(r, expectedVersion);
    if (!r.lines.length || r.lines.length > 30) fail("Receipt must contain 1–30 lines");
    if (r.lines.some(l => !l.key.trim()) || new Set(r.lines.map(l => l.key)).size !== r.lines.length) fail("Line keys must be unique and nonempty");
    const now = Date.now();
    const receivedAt = r.receivedAt ?? fail("Confirm the actual received date before posting");
    if (!Number.isSafeInteger(receivedAt) || receivedAt < Date.UTC(2000, 0, 1) || receivedAt > now) fail("Invalid received date");
    const docKey = documentKey(r.supplier, r.docRef);
    if (docKey) {
      const dup = await ctx.db.query("receipts").withIndex("by_docKey", (q) => q.eq("docKey", docKey)).unique();
      if (dup && dup._id !== receiptId && dup.status === "posted") fail("Supplier document was already posted");
    }
    const batches = await activeBatches(ctx);
    const occupied = new Set(batches.flatMap((b) => b.locations.map((l) => l.slot)));
    const used = new Set<string>();
    const linked = new Map<Id<"purchaseOrders">, number>();
    const plans: { skuCode: string; qty: number; locations: { slot: string; qty: number }[] }[] = [];
    for (const line of r.lines) {
      if (!line.skuCode || !line.qty || line.qty <= 0 || !Number.isSafeInteger(line.qty)) fail(`Resolve "${line.rawText}"`);
      if (!line.verified) fail(`Count "${line.rawText}"`);
      if (line.condition.trim().toLowerCase() !== "good") fail(`Resolve condition for "${line.rawText}" before adding sellable stock`);
      const sku = (await skuByCode(ctx, line.skuCode)) ?? fail(`Unknown SKU ${line.skuCode}`);
      const locations = line.locations ?? [];
      if (!locations.length || locations.length > SLOT_BY_ID.size) fail(`Assign ${line.qty} counted units of ${line.skuCode} to bays`);
      for (const l of locations) {
        if (!SLOT_BY_ID.has(l.slot) || occupied.has(l.slot) || used.has(l.slot)) fail(`Bay ${l.slot} is invalid or occupied`);
        if (!Number.isSafeInteger(l.qty) || l.qty <= 0 || !Number.isSafeInteger(sku.cap) || sku.cap <= 0 || l.qty > sku.cap) fail(`Bay ${l.slot} exceeds capacity for ${line.skuCode}`);
        used.add(l.slot);
      }
      if (locations.reduce((n, l) => n + l.qty, 0) !== line.qty) fail(`Assign ${line.qty} counted units of ${line.skuCode} to bays`);
      if (line.purchaseOrderId) linked.set(line.purchaseOrderId, (linked.get(line.purchaseOrderId) ?? 0) + line.qty);
      plans.push({ skuCode: line.skuCode, qty: line.qty, locations });
    }
    for (const [poId, qty] of linked) {
      const po = (await ctx.db.get("purchaseOrders", poId)) ?? fail("Linked purchase order not found");
      if (po.status !== "open" || !Number.isSafeInteger(po.qty) || !Number.isSafeInteger(po.qtyReceived) || po.qtyReceived < 0 || po.qtyReceived >= po.qty || !Number.isSafeInteger(qty) || qty > po.qty - po.qtyReceived) fail(`Linked purchase order ${po.code} has insufficient outstanding quantity`);
      if (r.lines.some((line) => line.purchaseOrderId === poId && line.skuCode !== po.skuCode)) fail(`Linked purchase order ${po.code} does not match every line SKU`);
    }
    for (const p of plans) {
      const code = await nextCode(ctx, "B", 9001);
      const batchId = await ctx.db.insert("batches", {
        code,
        skuCode: p.skuCode,
        receivedAt,
        qtyReceived: p.qty,
        locations: p.locations,
        status: "active",
        receiptId,
        synthetic: false,
      });
      await ctx.db.insert("movements", {
        at: now,
        skuCode: p.skuCode,
        batchId,
        kind: "receive",
        reason: "supplier_receipt",
        qty: p.qty,
        lines: p.locations,
        ref: r.docRef ?? r.code,
        actor,
        synthetic: false,
      });
    }
    for (const [poId, qty] of linked) {
      const po = (await ctx.db.get("purchaseOrders", poId))!;
      const qtyReceived = po.qtyReceived + qty;
      await ctx.db.patch("purchaseOrders", poId, { qtyReceived, status: qtyReceived === po.qty ? "closed" : "open" });
    }
    await ctx.db.patch("receipts", receiptId, {
      status: "posted", postedBy: actor, postedAt: now, receivedAt, docKey,
      postedVersion: versionOf(r), version: versionOf(r) + 1,
    });
    await audit(
      ctx,
      actor,
      "post",
      `receipt:${receiptId}`,
      plans.map((p) => `${p.qty} × ${p.skuCode} → ${p.locations.map((l) => slotCode(l.slot)).join(", ")}`).join("; "),
    );
    return null;
  },
});

export const reject = mutation({
  args: { actor, receiptId: v.id("receipts"), expectedVersion: v.number(), reason: v.string() },
  handler: async (ctx, { receiptId, expectedVersion, reason }) => {
    const actor = await getActor(ctx, "warehouse", "owner");
    if (!reason.trim()) fail("Give a reason");
    const r = (await ctx.db.get("receipts", receiptId)) ?? fail("Receipt not found");
    if (r.status !== "needs_review") fail("Already closed");
    expectVersion(r, expectedVersion);
    await ctx.db.patch("receipts", receiptId, { status: "rejected", rejectReason: reason.trim(), version: versionOf(r) + 1 });
    await audit(ctx, actor, "reject", `receipt:${receiptId}`, "Rejected", reason.trim());
    return null;
  },
});

/** Create a real catalogue item without changing stock; a reviewed receipt posts the first units. */
export const createCatalogItem = mutation({
  args: {
    actor,
    category: v.union(
      v.literal("sofas"),
      v.literal("tables"),
      v.literal("chairs"),
      v.literal("wardrobes"),
      v.literal("beds"),
      v.literal("general"),
    ),
    kind: furnitureKind,
    cap: v.number(),
    doors: v.number(),
    model: v.string(),
    variant: v.string(),
    color: v.string(),
    code: v.string(),
    homeFloor: v.union(v.literal(1), v.literal(2)),
    homeZone: v.union(v.literal("A"), v.literal("B"), v.literal("C"), v.literal("D")),
    packages: v.array(pkg),
    price: v.object({ listSen: v.number(), clearanceSen: v.number(), unitCostSen: v.number() }),
  },
  handler: async (ctx, a) => {
    const actor = await getActor(ctx, "owner", "warehouse");
    const code = a.code.trim().toUpperCase();
    if (!/^[A-Z]+-[A-Z]{2,5}-[0-9A-Z]{3,6}$/.test(code)) fail("SKU format: CATEGORY-SUPPLIER-0000");
    if (await skuByCode(ctx, code)) fail(`${code} already exists`);
    if (!clean(a.model) || !clean(a.variant)) fail("Model and variant are required");
    if (!Number.isInteger(a.cap) || a.cap <= 0 || a.cap > 500) fail("Bay capacity must be a whole number from 1–500");
    if (!Number.isInteger(a.doors) || a.doors < 0 || a.doors > 20) fail("Invalid door count");
    if (!a.packages.length || a.packages.length > 20 || a.packages.some((p) => ![p.lCm, p.wCm, p.hCm, p.kg].every((x) => Number.isFinite(x) && x > 0))) fail("Enter actual package dimensions and weight");
    if (Object.values(a.price).some((x) => !Number.isSafeInteger(x) || x < 0)) fail("Prices must be nonnegative whole sen; use 0 for unknown");
    const sku = {
      code,
      category: a.category,
      model: clean(a.model).slice(0, 120),
      variant: clean(a.variant).slice(0, 120),
      kind: a.kind,
      cap: a.cap,
      doors: a.doors,
      color: /^#[0-9a-f]{6}$/i.test(a.color) ? a.color : "#8b8f98",
      homeFloor: a.homeFloor,
      homeZone: a.homeZone,
      packages: a.packages,
      price: a.price,
      addedAt: Date.now(),
      iconStatus: "pending" as const,
      synthetic: false,
    };
    await ctx.db.insert("skus", sku);
    await ctx.scheduler.runAfter(0, internal.ai.generateIcon, { code, staffId: actor.staffId as Id<"staff"> });
    await audit(ctx, actor, "catalogue_item", `sku:${code}`, `${code} added to catalogue without stock`);
    return code;
  },
});

// ── Internal: Claude extraction writes back here ──────────────────────────

export const forExtraction = internalQuery({
  args: { receiptId: v.id("receipts"), jobVersion: v.number() },
  handler: async (ctx, { receiptId, jobVersion }) => {
    const r = await ctx.db.get("receipts", receiptId);
    if (!r || r.status !== "needs_review" || versionOf(r) !== jobVersion || r.extraction.jobVersion !== jobVersion || r.extraction.status !== "running") return null;
    const staffId = r.extraction.requestedBy?.staffId;
    if (!staffId) return null;
    const staff = await ctx.db.get("staff", staffId as Id<"staff">);
    if (!staff || staff.status !== "active" || !["owner", "warehouse"].includes(staff.role)) return null;
    const skus = await ctx.db.query("skus").take(501);
    if (skus.length > 500) fail("Catalogue is too large for AI reading — enter receipt lines by hand");
    return {
      evidence: r.evidence,
      catalogue: skus.map((s) => ({ code: s.code, model: s.model, variant: s.variant, category: s.category })),
    };
  },
});

export const setExtraction = internalMutation({
  args: {
    receiptId: v.id("receipts"),
    jobVersion: v.number(),
    status: v.union(v.literal("done"), v.literal("error")),
    error: v.optional(v.string()),
    supplier: v.optional(v.string()),
    docRef: v.optional(v.string()),
    lines: v.optional(v.array(receiptLine)),
  },
  handler: async (ctx, a) => {
    const r = await ctx.db.get("receipts", a.receiptId);
    if (!r || r.status !== "needs_review" || versionOf(r) !== a.jobVersion || r.extraction.jobVersion !== a.jobVersion || r.extraction.status !== "running") return null;
    if (a.status === "error") {
      await ctx.db.patch("receipts", a.receiptId, { version: versionOf(r) + 1, extraction: { status: "error", at: Date.now(), ...(a.error ? { error: a.error.slice(0, 400) } : {}) } });
      return null;
    }
    const codes = new Set((a.lines ?? []).flatMap(l => [...l.candidates, ...(l.skuCode ? [l.skuCode] : [])]));
    const known = new Set<string>();
    for (const code of codes) if (await skuByCode(ctx, code)) known.add(code);
    const lines = a.lines?.slice(0, 30).map((l, i) => ({
      key: `ai-${a.jobVersion}-${i}`,
      rawText: l.rawText.slice(0, 200),
      skuCode: l.skuCode && known.has(l.skuCode) ? l.skuCode : null,
      qty: l.qty != null && Number.isSafeInteger(l.qty) && l.qty > 0 ? l.qty : null,
      candidates: l.candidates.filter((c) => known.has(c)).slice(0, 4),
      questions: [...l.questions.slice(0, 4).map(q => q.slice(0, 160)), ...(l.skuCode && !known.has(l.skuCode) ? ["Not in catalogue"] : [])],
      // Staff confirm the physical condition before posting; a stated problem is kept for them to see.
      condition: clean(l.condition || "good").slice(0, 60) || "good",
      confidence: Number.isFinite(l.confidence) ? Math.max(0, Math.min(1, l.confidence)) : 0,
      verified: false,
      source: "ai" as const,
      ...cleanMeasures(l),
    }));
    const supplier = a.supplier ? clean(a.supplier).slice(0, 120) : r.supplier;
    const docRef = a.docRef ? clean(a.docRef).slice(0, 80) : r.docRef;
    const key = documentKey(supplier, docRef);
    const dup = key ? await ctx.db.query("receipts").withIndex("by_docKey", (q) => q.eq("docKey", key)).unique() : null;
    await ctx.db.patch("receipts", a.receiptId, {
      extraction: { status: a.status, at: Date.now(), ...(a.error ? { error: a.error } : {}) },
      ...(a.supplier ? { supplier } : {}),
      ...(a.docRef ? { docRef } : {}),
      version: versionOf(r) + 1,
      ...(lines && !r.lines.some((l) => l.source === "staff")
        ? {
            lines: dup?.status === "posted"
              ? lines.map((l, i) => (i === 0 ? { ...l, questions: [...l.questions, `${docRef} was already posted`] } : l))
              : lines,
          }
        : {}),
    });
    return null;
  },
});
