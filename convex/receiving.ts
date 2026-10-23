// Receiving: evidence (photo / document / voice) → draft lines → warehouse verifies → stock posted into bays.
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { actor, furnitureKind, receiptLine } from "./schema";
import { activeBatches, audit, fail, nextCode, requireRole, skuByCode } from "./lib";
import { CATEGORY_INFO } from "../src/data/catalog";
import { packagesFor, priceFor } from "../src/domain/specs";
import { planPlacement, slotCode } from "../src/domain/stock";

export const generateUploadUrl = mutation({
  args: { actor },
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

export const get = query({
  args: { receiptId: v.id("receipts") },
  handler: async (ctx, { receiptId }) => {
    const r = await ctx.db.get("receipts", receiptId);
    if (!r) return null;
    const evidence = await Promise.all(
      r.evidence.map(async (e) => ({ ...e, url: e.storageId ? await ctx.storage.getUrl(e.storageId) : null })),
    );
    return { ...r, evidence };
  },
});

export const create = mutation({
  args: { actor },
  handler: async (ctx, { actor }) => {
    const code = await nextCode(ctx, "RC", 501);
    const now = Date.now();
    const id = await ctx.db.insert("receipts", {
      code,
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
    kind: v.union(v.literal("photo"), v.literal("document"), v.literal("voice"), v.literal("note")),
    storageId: v.optional(v.id("_storage")),
    text: v.optional(v.string()),
    mime: v.optional(v.string()),
  },
  handler: async (ctx, { receiptId, kind, storageId, text, mime }) => {
    const r = (await ctx.db.get("receipts", receiptId)) ?? fail("Receipt not found");
    if (r.status !== "needs_review") fail("Receipt is closed");
    if (r.evidence.length >= 8) fail("Up to 8 items");
    await ctx.db.patch("receipts", receiptId, {
      evidence: [
        ...r.evidence,
        { kind, at: Date.now(), ...(storageId ? { storageId } : {}), ...(text ? { text: text.slice(0, 4000) } : {}), ...(mime ? { mime } : {}) },
      ],
    });
    return null;
  },
});

/** Staff edits to the draft lines (corrections keep `source: "staff"`). */
export const saveLines = mutation({
  args: { actor, receiptId: v.id("receipts"), lines: v.array(receiptLine) },
  handler: async (ctx, { actor, receiptId, lines }) => {
    const r = (await ctx.db.get("receipts", receiptId)) ?? fail("Receipt not found");
    if (r.status !== "needs_review") fail("Receipt is closed");
    if (lines.length > 30) fail("Too many lines");
    await ctx.db.patch("receipts", receiptId, { lines });
    await audit(ctx, actor, "edit_lines", `receipt:${receiptId}`, `${lines.length} lines`);
    return null;
  },
});

/** Warehouse confirms the physical goods. Every line must be counted; all-or-nothing placement. */
export const post = mutation({
  args: { actor, receiptId: v.id("receipts") },
  handler: async (ctx, { actor, receiptId }) => {
    requireRole(actor, "warehouse");
    const r = (await ctx.db.get("receipts", receiptId)) ?? fail("Receipt not found");
    if (r.status !== "needs_review") fail("Already closed");
    if (!r.lines.length) fail("No lines");
    const batches = await activeBatches(ctx);
    const plans: { line: (typeof r.lines)[number]; skuCode: string; qty: number; locations: { slot: string; qty: number }[] }[] = [];
    for (const line of r.lines) {
      if (!line.skuCode || !line.qty || line.qty <= 0 || !Number.isInteger(line.qty)) fail(`Resolve "${line.rawText}"`);
      if (!line.verified) fail(`Count "${line.rawText}"`);
      const sku = (await skuByCode(ctx, line.skuCode)) ?? fail(`Unknown SKU ${line.skuCode}`);
      const locations = planPlacement(sku, line.qty, [
        ...batches,
        ...plans.map((p, i) => ({ _id: `plan${i}`, code: "", skuCode: p.skuCode, receivedAt: 0, qtyReceived: p.qty, locations: p.locations, status: "active" as const })),
      ]);
      if (!locations) fail(`No free bays for ${line.skuCode}`);
      plans.push({ line, skuCode: line.skuCode, qty: line.qty, locations });
    }
    const now = Date.now();
    for (const p of plans) {
      const code = await nextCode(ctx, "B", 9001);
      const batchId = await ctx.db.insert("batches", {
        code,
        skuCode: p.skuCode,
        receivedAt: now,
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
      await fulfilPurchaseOrders(ctx, p.skuCode, p.qty);
    }
    await ctx.db.patch("receipts", receiptId, { status: "posted", postedBy: actor, postedAt: now });
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

async function fulfilPurchaseOrders(ctx: MutationCtx, skuCode: string, qty: number) {
  let left = qty;
  const open = await ctx.db
    .query("purchaseOrders")
    .withIndex("by_skuCode_and_status", (q) => q.eq("skuCode", skuCode).eq("status", "open"))
    .take(20);
  for (const po of open) {
    if (left <= 0) break;
    const take = Math.min(left, po.qty - po.qtyReceived);
    left -= take;
    const qtyReceived = po.qtyReceived + take;
    await ctx.db.patch("purchaseOrders", po._id, { qtyReceived, status: qtyReceived >= po.qty ? "closed" : "open" });
  }
}

export const reject = mutation({
  args: { actor, receiptId: v.id("receipts"), reason: v.string() },
  handler: async (ctx, { actor, receiptId, reason }) => {
    requireRole(actor, "warehouse", "owner");
    if (!reason.trim()) fail("Give a reason");
    const r = (await ctx.db.get("receipts", receiptId)) ?? fail("Receipt not found");
    if (r.status !== "needs_review") fail("Already closed");
    await ctx.db.patch("receipts", receiptId, { status: "rejected", rejectReason: reason.trim() });
    await audit(ctx, actor, "reject", `receipt:${receiptId}`, "Rejected", reason.trim());
    return null;
  },
});

/** A model the catalogue doesn't have yet: warehouse adds it and places the counted units. */
export const createModel = mutation({
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
    units: v.number(),
  },
  handler: async (ctx, a) => {
    requireRole(a.actor, "warehouse");
    const code = a.code.trim().toUpperCase();
    if (!/^[A-Z]+-[A-Z]{2,5}-[0-9A-Z]{3,6}$/.test(code)) fail("SKU format: CATEGORY-SUPPLIER-0000");
    if (await skuByCode(ctx, code)) fail(`${code} already exists`);
    if (!Number.isInteger(a.units) || a.units <= 0) fail("Units must be a whole number");
    const home = CATEGORY_INFO.find((c) => c.id === a.category) ?? fail("Unknown category");
    const kind = a.kind;
    const batches = await activeBatches(ctx);
    const first = batches.length ? await nearestZone(ctx, a.category) : null;
    const sku = {
      code,
      category: a.category,
      model: a.model.trim(),
      variant: a.variant.trim(),
      kind,
      cap: Math.max(1, Math.round(a.cap)),
      doors: a.doors,
      color: /^#[0-9a-f]{6}$/i.test(a.color) ? a.color : "#8b8f98",
      homeFloor: first?.floor ?? (1 as const),
      homeZone: first?.zone ?? ("A" as const),
      packages: packagesFor(kind, a.doors),
      price: priceFor(kind),
      addedAt: Date.now(),
      iconStatus: "pending" as const,
      synthetic: false,
    };
    const locations = planPlacement(sku, a.units, batches);
    if (!locations) fail(`Not enough free bays for ${a.units} units`);
    await ctx.db.insert("skus", sku);
    const batchCode = await nextCode(ctx, "B", 9001);
    const batchId = await ctx.db.insert("batches", {
      code: batchCode,
      skuCode: code,
      receivedAt: Date.now(),
      qtyReceived: a.units,
      locations,
      status: "active",
      synthetic: false,
    });
    await ctx.db.insert("movements", {
      at: Date.now(),
      skuCode: code,
      batchId,
      kind: "receive",
      reason: "supplier_receipt",
      qty: a.units,
      lines: locations,
      ref: "New model",
      actor: a.actor,
      synthetic: false,
    });
    await audit(ctx, a.actor, "new_model", `sku:${code}`, `${a.units} × ${code} → ${locations.map((l) => slotCode(l.slot)).join(", ")} (${home.name})`);
    return code;
  },
});

async function nearestZone(ctx: MutationCtx, category: string) {
  const sku = (await ctx.db.query("skus").take(500)).find((s) => s.category === category);
  return sku ? { floor: sku.homeFloor, zone: sku.homeZone } : null;
}

// ── Internal: Claude extraction writes back here ──────────────────────────

export const forExtraction = internalQuery({
  args: { receiptId: v.id("receipts") },
  handler: async (ctx, { receiptId }) => {
    const r = await ctx.db.get("receipts", receiptId);
    if (!r) return null;
    const skus = await ctx.db.query("skus").take(500);
    return {
      evidence: r.evidence,
      catalogue: skus.map((s) => ({ code: s.code, model: s.model, variant: s.variant, category: s.category })),
    };
  },
});

export const setExtraction = internalMutation({
  args: {
    receiptId: v.id("receipts"),
    status: v.union(v.literal("running"), v.literal("done"), v.literal("error")),
    error: v.optional(v.string()),
    supplier: v.optional(v.string()),
    docRef: v.optional(v.string()),
    lines: v.optional(v.array(receiptLine)),
  },
  handler: async (ctx, a) => {
    const r = await ctx.db.get("receipts", a.receiptId);
    if (!r || r.status !== "needs_review") return null;
    const known = new Set((await ctx.db.query("skus").take(500)).map((s) => s.code));
    const lines = a.lines?.map((l) => ({
      ...l,
      skuCode: l.skuCode && known.has(l.skuCode) ? l.skuCode : null,
      qty: l.qty != null && Number.isInteger(l.qty) && l.qty > 0 ? l.qty : null,
      candidates: l.candidates.filter((c) => known.has(c)).slice(0, 4),
      questions: l.skuCode && !known.has(l.skuCode) ? [...l.questions, "Not in catalogue"] : l.questions,
    }));
    const dup =
      a.docRef &&
      (await ctx.db
        .query("receipts")
        .withIndex("by_status", (q) => q.eq("status", "posted"))
        .take(200)).some((x) => x.docRef === a.docRef);
    await ctx.db.patch("receipts", a.receiptId, {
      extraction: { status: a.status, at: Date.now(), ...(a.error ? { error: a.error } : {}) },
      ...(a.supplier ? { supplier: a.supplier } : {}),
      ...(a.docRef ? { docRef: a.docRef } : {}),
      ...(lines
        ? {
            lines: dup
              ? lines.map((l, i) => (i === 0 ? { ...l, questions: [...l.questions, `${a.docRef} was already posted`] } : l))
              : lines,
          }
        : {}),
    });
    return null;
  },
});
