/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvexForDataModel } from "convex-test";
import { api, internal } from "./_generated/api";
import type { DataModel, Doc } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const actor = { role: "owner" as const, name: "Client-supplied impersonation" };
const ownerToken = "https://clerk.example|receiving-owner";
const receivedAt = Date.UTC(2026, 8, 7, 9);
type Client = TestConvexForDataModel<DataModel>;
type Line = Doc<"receipts">["lines"][number];

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(Date.UTC(2026, 9, 24, 8)); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); });

async function business() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.access.bootstrapOwner, { tokenIdentifier: ownerToken, email: "owner@example.com", name: "Receiving Owner" });
  return { t, owner: t.withIdentity({ tokenIdentifier: ownerToken, issuer: "https://clerk.example", subject: "receiving-owner" }) };
}

async function catalogue(owner: Client, code = "CHAIR-ACME-0001", cap = 4) {
  return await owner.mutation(api.receiving.createCatalogItem, {
    actor, code, category: "chairs", kind: "chair", cap, doors: 0,
    model: "Actual chair", variant: "Oak", color: "#aabbcc", homeFloor: 1, homeZone: "A",
    packages: [{ lCm: 90, wCm: 60, hCm: 45, kg: 12.5 }],
    price: { listSen: 0, clearanceSen: 0, unitCostSen: 0 },
  });
}

function counted(skuCode: string, qty = 2, slot = "1A00", more: Partial<Line> = {}): Line {
  return { key: slot, rawText: "Counted chair", skuCode, candidates: [], qty,
    locations: [{ slot, qty }], condition: "good", confidence: 1, questions: [], verified: true, source: "staff", ...more };
}

async function draft(owner: Client, lines: Line[], detail: { supplier?: string; docRef?: string; receivedAt?: number } = {}) {
  const receiptId = await owner.mutation(api.receiving.create, { actor });
  let version = await owner.mutation(api.receiving.saveDetails, {
    actor, receiptId, expectedVersion: 1, receivedAt, supplier: "Acme Furniture", ...detail,
  });
  version = await owner.mutation(api.receiving.saveLines, { actor, receiptId, expectedVersion: version, lines });
  return { receiptId, version };
}

async function purchase(owner: Client, skuCode: string, qty: number, orderRef: string) {
  await owner.mutation(api.replenish.createPO, {
    actor, skuCode, qty, rationale: "Supplier-confirmed purchase", supplier: "Acme Furniture", orderRef,
    confirmedAt: Date.now() - 1000, unitCostSen: 1000, confirmed: true,
  });
  return await owner.query(async (ctx) => (await ctx.db.query("purchaseOrders").withIndex("by_skuCode_and_status", q => q.eq("skuCode", skuCode).eq("status", "open")).take(20)).find(p => p.orderRef === orderRef)!);
}

describe("receiving into an empty business", () => {
  it("creates a zero-stock catalogue item with entered cargo and unknown prices, then posts counted stock using the actual arrival date", async () => {
    const { t, owner } = await business();
    expect(await t.run(async ctx => ctx.db.query("skus").take(1))).toHaveLength(0);
    const code = await catalogue(owner);
    const sku = await t.run(async ctx => ctx.db.query("skus").withIndex("by_code", q => q.eq("code", code)).unique());
    expect(sku).toMatchObject({ packages: [{ lCm: 90, wCm: 60, hCm: 45, kg: 12.5 }], price: { listSen: 0, clearanceSen: 0, unitCostSen: 0 }, synthetic: false });
    const { receiptId, version } = await draft(owner, [counted(code)]);
    expect(await t.run(async ctx => ctx.db.query("batches").take(1))).toHaveLength(0);
    await owner.mutation(api.receiving.post, { actor, receiptId, expectedVersion: version });
    const state = await t.run(async ctx => ({
      batches: await ctx.db.query("batches").take(10), movements: await ctx.db.query("movements").take(10),
      receipt: await ctx.db.get("receipts", receiptId),
    }));
    expect(state.batches).toHaveLength(1);
    expect(state.batches[0]).toMatchObject({ skuCode: code, qtyReceived: 2, receivedAt, receiptId, locations: [{ slot: "1A00", qty: 2 }], synthetic: false });
    expect(state.movements).toHaveLength(1);
    expect(state.movements[0]).toMatchObject({ reason: "supplier_receipt", qty: 2, actor: { name: "Receiving Owner", role: "owner" } });
    expect(state.receipt).toMatchObject({ status: "posted", receivedAt, version: version + 1 });
  });

  it("rejects invalid cargo and price values without inserting a catalogue row", async () => {
    const { t, owner } = await business();
    const payload = { actor, code: "CHAIR-ACME-0001", category: "chairs" as const, kind: "chair" as const, cap: 4, doors: 0,
      model: "Chair", variant: "Oak", color: "#aabbcc", homeFloor: 1 as const, homeZone: "A" as const,
      packages: [], price: { listSen: 0, clearanceSen: 0, unitCostSen: 0 } };
    await expect(owner.mutation(api.receiving.createCatalogItem, payload)).rejects.toThrow("actual package");
    await expect(owner.mutation(api.receiving.createCatalogItem, { ...payload, packages: [{ lCm: 1, wCm: 1, hCm: 1, kg: 1 }], price: { ...payload.price, unitCostSen: 0.5 } })).rejects.toThrow("whole sen");
    expect(await t.run(async ctx => ctx.db.query("skus").take(1))).toHaveLength(0);
  });

  it("requires an actual date and physically confirmed good-condition counts", async () => {
    const { t, owner } = await business();
    const code = await catalogue(owner);
    const receiptId = await owner.mutation(api.receiving.create, { actor });
    const version = await owner.mutation(api.receiving.saveLines, { actor, receiptId, expectedVersion: 1, lines: [counted(code)] });
    await expect(owner.mutation(api.receiving.post, { actor, receiptId, expectedVersion: version })).rejects.toThrow("actual received date");
    for (const bad of [counted(code, 2, "1A00", { verified: false }), counted(code, 2, "1A00", { condition: "damaged" })]) {
      const ready = await draft(owner, [bad]);
      await expect(owner.mutation(api.receiving.post, { actor, receiptId: ready.receiptId, expectedVersion: ready.version })).rejects.toThrow();
    }
    expect(await t.run(async ctx => ctx.db.query("batches").take(1))).toHaveLength(0);
    expect(await t.run(async ctx => ctx.db.query("movements").take(1))).toHaveLength(0);
  });

  it("rejects future arrival times at both edit and post, including preexisting draft data", async () => {
    const { t, owner } = await business();
    const code = await catalogue(owner);
    const { receiptId, version } = await draft(owner, [counted(code)]);
    const future = Date.now() + 60_000;
    await expect(owner.mutation(api.receiving.saveDetails, { actor, receiptId, expectedVersion: version, receivedAt: future })).rejects.toThrow("Invalid received date");
    await t.run(async ctx => ctx.db.patch("receipts", receiptId, { receivedAt: future }));
    await expect(owner.mutation(api.receiving.post, { actor, receiptId, expectedVersion: version })).rejects.toThrow("Invalid received date");
    expect(await t.run(async ctx => ctx.db.query("batches").take(1))).toHaveLength(0);
  });

  it("checks stored evidence metadata and never trusts the browser's declared MIME type", async () => {
    const { t, owner } = await business();
    const receiptId = await owner.mutation(api.receiving.create, { actor });
    const image = await t.run(async ctx => ctx.storage.store(new Blob(["image bytes"], { type: "image/png" })));
    const pdf = await t.run(async ctx => ctx.storage.store(new Blob(["%PDF test"], { type: "application/pdf" })));
    await expect(owner.mutation(api.receiving.addEvidence, { actor, receiptId, expectedVersion: 1, kind: "photo", storageId: image, mime: "image/jpeg" })).rejects.toThrow("does not match");
    await expect(owner.mutation(api.receiving.addEvidence, { actor, receiptId, expectedVersion: 1, kind: "photo", storageId: pdf })).rejects.toThrow("supported image");
    await expect(owner.mutation(api.receiving.addEvidence, { actor, receiptId, expectedVersion: 1, kind: "note", text: "  " })).rejects.toThrow("note or voice transcript");
    const version = await owner.mutation(api.receiving.addEvidence, { actor, receiptId, expectedVersion: 1, kind: "photo", storageId: image });
    await owner.mutation(api.receiving.addEvidence, { actor, receiptId, expectedVersion: version, kind: "document", storageId: pdf });
    expect((await owner.query(api.receiving.get, { receiptId }))?.evidence).toMatchObject([{ mime: "image/png", kind: "photo" }, { mime: "application/pdf", kind: "document" }]);
    await t.run(async ctx => ctx.storage.delete(image));
    await expect(owner.mutation(api.receiving.addEvidence, { actor, receiptId, expectedVersion: version + 1, kind: "photo", storageId: image })).rejects.toThrow("must exist");
  });
});

describe("purchase-order reconciliation", () => {
  it("applies only explicit purchase links, aggregates repeated lines, and closes a fully received order", async () => {
    const { t, owner } = await business();
    const code = await catalogue(owner);
    const first = await purchase(owner, code, 5, "ORDER-1");
    const unrelated = await purchase(owner, code, 6, "ORDER-2");
    const partial = await draft(owner, [counted(code, 2, "1A00", { purchaseOrderId: first._id })]);
    await owner.mutation(api.receiving.post, { actor, receiptId: partial.receiptId, expectedVersion: partial.version });
    expect(await t.run(async ctx => ctx.db.get("purchaseOrders", first._id))).toMatchObject({ qtyReceived: 2, status: "open" });
    const full = await draft(owner, [counted(code, 1, "1A01", { purchaseOrderId: first._id }), counted(code, 2, "1A02", { purchaseOrderId: first._id }), counted(code, 1, "1A03")]);
    await owner.mutation(api.receiving.post, { actor, receiptId: full.receiptId, expectedVersion: full.version });
    expect(await t.run(async ctx => ctx.db.get("purchaseOrders", first._id))).toMatchObject({ qtyReceived: 5, status: "closed" });
    expect(await t.run(async ctx => ctx.db.get("purchaseOrders", unrelated._id))).toMatchObject({ qtyReceived: 0, status: "open" });
  });

  it("checks the SKU of every linked line and rolls back the entire receipt", async () => {
    const { t, owner } = await business();
    const firstCode = await catalogue(owner);
    const secondCode = await catalogue(owner, "CHAIR-ACME-0002");
    const po = await purchase(owner, firstCode, 4, "ORDER-SKU");
    for (const lines of [
      [counted(firstCode, 1, "1A00", { purchaseOrderId: po._id }), counted(secondCode, 1, "1A01", { purchaseOrderId: po._id })],
      [counted(secondCode, 1, "1A00", { purchaseOrderId: po._id }), counted(firstCode, 1, "1A01", { purchaseOrderId: po._id })],
    ]) {
      const { receiptId, version } = await draft(owner, lines);
      await expect(owner.mutation(api.receiving.post, { actor, receiptId, expectedVersion: version })).rejects.toThrow("every line SKU");
      expect(await t.run(async ctx => ctx.db.get("receipts", receiptId))).toMatchObject({ status: "needs_review", version });
    }
    expect(await t.run(async ctx => ctx.db.query("batches").take(1))).toHaveLength(0);
    expect(await t.run(async ctx => ctx.db.query("movements").take(1))).toHaveLength(0);
    expect(await t.run(async ctx => ctx.db.get("purchaseOrders", po._id))).toMatchObject({ qtyReceived: 0, status: "open" });
  });

  it("rejects aggregate over-receipt even when each line fits the outstanding purchase", async () => {
    const { t, owner } = await business();
    const code = await catalogue(owner);
    const po = await purchase(owner, code, 3, "ORDER-EXCESS");
    const { receiptId, version } = await draft(owner, [counted(code, 2, "1A00", { purchaseOrderId: po._id }), counted(code, 2, "1A01", { purchaseOrderId: po._id })]);
    await expect(owner.mutation(api.receiving.post, { actor, receiptId, expectedVersion: version })).rejects.toThrow("outstanding quantity");
    expect(await t.run(async ctx => ctx.db.query("batches").take(1))).toHaveLength(0);
    expect(await t.run(async ctx => ctx.db.get("purchaseOrders", po._id))).toMatchObject({ qtyReceived: 0 });
  });

  it("does not over-receive a purchase when two valid receipts compete for its remaining quantity", async () => {
    const { t, owner } = await business();
    const code = await catalogue(owner);
    const po = await purchase(owner, code, 3, "ORDER-RACE");
    const receipts = await Promise.all([draft(owner, [counted(code, 2, "1A00", { purchaseOrderId: po._id })]), draft(owner, [counted(code, 2, "1A01", { purchaseOrderId: po._id })])]);
    const outcomes = await Promise.allSettled(receipts.map(r => owner.mutation(api.receiving.post, { actor, receiptId: r.receiptId, expectedVersion: r.version })));
    expect(outcomes.filter(o => o.status === "fulfilled")).toHaveLength(1);
    expect(await t.run(async ctx => ctx.db.get("purchaseOrders", po._id))).toMatchObject({ qtyReceived: 2, status: "open" });
    expect(await t.run(async ctx => ctx.db.query("batches").take(10))).toHaveLength(1);
  });
});

describe("atomic posting and retry safety", () => {
  it("posts a receipt once across same-version and refreshed-version retries", async () => {
    const { t, owner } = await business();
    const code = await catalogue(owner);
    const { receiptId, version } = await draft(owner, [counted(code)]);
    await owner.mutation(api.receiving.post, { actor, receiptId, expectedVersion: version });
    await owner.mutation(api.receiving.post, { actor, receiptId, expectedVersion: version });
    await owner.mutation(api.receiving.post, { actor, receiptId, expectedVersion: version + 1 });
    expect(await t.run(async ctx => ctx.db.query("batches").take(10))).toHaveLength(1);
    expect(await t.run(async ctx => ctx.db.query("movements").take(10))).toHaveLength(1);
  });

  it("posts the same receipt only once across simultaneous retries", async () => {
    const { t, owner } = await business();
    const code = await catalogue(owner);
    const { receiptId, version } = await draft(owner, [counted(code)]);
    await Promise.all(Array.from({ length: 3 }, () => owner.mutation(api.receiving.post, { actor, receiptId, expectedVersion: version })));
    expect(await t.run(async ctx => ctx.db.query("batches").take(10))).toHaveLength(1);
    expect(await t.run(async ctx => ctx.db.query("movements").take(10))).toHaveLength(1);
  });

  it("normalizes supplier document references, permits separate suppliers and permits missing references", async () => {
    const { t, owner } = await business();
    const code = await catalogue(owner);
    const first = await draft(owner, [counted(code, 1, "1A00")], { supplier: " Acme   Furniture ", docRef: " DN  123 " });
    await owner.mutation(api.receiving.post, { actor, receiptId: first.receiptId, expectedVersion: first.version });
    const duplicate = await draft(owner, [counted(code, 1, "1A01")], { supplier: "acme furniture", docRef: "dn 123" });
    await expect(owner.mutation(api.receiving.post, { actor, receiptId: duplicate.receiptId, expectedVersion: duplicate.version })).rejects.toThrow("already posted");
    for (const [slot, detail] of [["1A01", { supplier: "Another supplier", docRef: "dn 123" }], ["1A02", {}], ["1A03", {}]] as const) {
      const receipt = await draft(owner, [counted(code, 1, slot)], detail);
      await owner.mutation(api.receiving.post, { actor, receiptId: receipt.receiptId, expectedVersion: receipt.version });
    }
    expect(await t.run(async ctx => ctx.db.query("batches").take(10))).toHaveLength(4);
  });

  it("allows only one receipt to claim the same bay in concurrent posting calls", async () => {
    const { t, owner } = await business();
    const code = await catalogue(owner);
    const receipts = await Promise.all([draft(owner, [counted(code)]), draft(owner, [counted(code)])]);
    const outcomes = await Promise.allSettled(receipts.map(r => owner.mutation(api.receiving.post, { actor, receiptId: r.receiptId, expectedVersion: r.version })));
    expect(outcomes.filter(o => o.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(o => o.status === "rejected")).toHaveLength(1);
    expect(await t.run(async ctx => ctx.db.query("batches").take(10))).toHaveLength(1);
    expect(await t.run(async ctx => ctx.db.query("movements").take(10))).toHaveLength(1);
  });

  it("rejects a bay reused by separate lines even when their individual counts and capacities are valid", async () => {
    const { t, owner } = await business();
    const code = await catalogue(owner);
    const { receiptId, version } = await draft(owner, [counted(code, 1, "1A00", { key: "first" }), counted(code, 1, "1A00", { key: "second" })]);
    await expect(owner.mutation(api.receiving.post, { actor, receiptId, expectedVersion: version })).rejects.toThrow("invalid or occupied");
    expect(await t.run(async ctx => ctx.db.query("batches").take(1))).toHaveLength(0);
  });

  it("allows only one receipt to claim a supplier document in concurrent posting calls", async () => {
    const { t, owner } = await business();
    const code = await catalogue(owner);
    const receipts = await Promise.all([draft(owner, [counted(code, 1, "1A00")], { docRef: "DN-RACE" }), draft(owner, [counted(code, 1, "1A01")], { docRef: "DN-RACE" })]);
    const outcomes = await Promise.allSettled(receipts.map(r => owner.mutation(api.receiving.post, { actor, receiptId: r.receiptId, expectedVersion: r.version })));
    expect(outcomes.filter(o => o.status === "fulfilled")).toHaveLength(1);
    expect(await t.run(async ctx => ctx.db.query("batches").take(10))).toHaveLength(1);
    expect(await t.run(async ctx => ctx.db.query("movements").take(10))).toHaveLength(1);
  });

  it.each([
    ["invalid bay", counted("CHAIR-ACME-0001", 2, "not-a-bay")],
    ["over capacity", counted("CHAIR-ACME-0001", 5)],
    ["fractional count", counted("CHAIR-ACME-0001", 1.5)],
    ["unsafe count", counted("CHAIR-ACME-0001", Number.MAX_SAFE_INTEGER + 1)],
    ["count mismatch", counted("CHAIR-ACME-0001", 2, "1A00", { locations: [{ slot: "1A00", qty: 1 }] })],
    ["duplicate bay", counted("CHAIR-ACME-0001", 2, "1A00", { locations: [{ slot: "1A00", qty: 1 }, { slot: "1A00", qty: 1 }] })],
  ])("rejects %s without any stock writes", async (_name, bad) => {
    const { t, owner } = await business();
    await catalogue(owner);
    const { receiptId, version } = await draft(owner, [bad]);
    await expect(owner.mutation(api.receiving.post, { actor, receiptId, expectedVersion: version })).rejects.toThrow();
    expect(await t.run(async ctx => ctx.db.query("batches").take(1))).toHaveLength(0);
    expect(await t.run(async ctx => ctx.db.query("movements").take(1))).toHaveLength(0);
  });
});

describe("draft revisions and delayed extraction", () => {
  it("continues through manual receiving when optional AI is unavailable", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { t, owner } = await business();
    const code = await catalogue(owner);
    const receiptId = await owner.mutation(api.receiving.create, { actor });
    const evidenceVersion = await owner.mutation(api.receiving.addEvidence, { actor, receiptId, expectedVersion: 1, kind: "note", text: "Supplier note" });
    const jobVersion = (await owner.mutation(api.receiving.requestExtraction, { actor, receiptId, expectedVersion: evidenceVersion }))!;
    await t.action(internal.ai.extractReceipt, { receiptId, jobVersion });
    expect(await owner.query(api.receiving.get, { receiptId })).toMatchObject({ version: jobVersion + 1, extraction: { status: "error" }, lines: [] });
    const detailVersion = await owner.mutation(api.receiving.saveDetails, { actor, receiptId, expectedVersion: jobVersion + 1, receivedAt });
    const version = await owner.mutation(api.receiving.saveLines, { actor, receiptId, expectedVersion: detailVersion, lines: [counted(code)] });
    await owner.mutation(api.receiving.post, { actor, receiptId, expectedVersion: version });
    expect(await t.run(async ctx => ctx.db.query("batches").take(10))).toHaveLength(1);
  });

  it("accepts only one simultaneous edit based on the same draft revision", async () => {
    const { owner } = await business();
    const code = await catalogue(owner);
    const receiptId = await owner.mutation(api.receiving.create, { actor });
    const edits = await Promise.allSettled([2, 3].map(qty => owner.mutation(api.receiving.saveLines, { actor, receiptId, expectedVersion: 1, lines: [counted(code, qty)] })));
    expect(edits.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(edits.filter(result => result.status === "rejected")).toHaveLength(1);
    const saved = await owner.query(api.receiving.get, { receiptId });
    expect(saved?.version).toBe(2);
    expect([2, 3]).toContain(saved?.lines[0]?.qty);
  });

  it("refuses extraction data after the requesting staff member is disabled", async () => {
    const { t, owner } = await business();
    const staffId = await owner.mutation(api.access.inviteStaff, { email: "reader@example.com", name: "Warehouse reader", role: "warehouse" });
    const tokenIdentifier = "https://clerk.example|warehouse-reader";
    await t.mutation(internal.access.bindInvitation, { tokenIdentifier, verifiedEmails: ["reader@example.com"] });
    const warehouse = t.withIdentity({ tokenIdentifier });
    const receiptId = await warehouse.mutation(api.receiving.create, { actor });
    const evidenceVersion = await warehouse.mutation(api.receiving.addEvidence, { actor, receiptId, expectedVersion: 1, kind: "note", text: "Supplier note" });
    const jobVersion = (await warehouse.mutation(api.receiving.requestExtraction, { actor, receiptId, expectedVersion: evidenceVersion }))!;
    expect(await t.query(internal.receiving.forExtraction, { receiptId, jobVersion })).not.toBeNull();
    await owner.mutation(api.access.updateStaff, { staffId, active: false });
    expect(await t.query(internal.receiving.forExtraction, { receiptId, jobVersion })).toBeNull();
  });

  it("rejects stale revisions for every public draft write and post", async () => {
    const { owner } = await business();
    const code = await catalogue(owner);
    const receiptId = await owner.mutation(api.receiving.create, { actor });
    await owner.mutation(api.receiving.saveDetails, { actor, receiptId, expectedVersion: 1, receivedAt });
    const stale = { actor, receiptId, expectedVersion: 1 };
    for (const operation of [
      () => owner.mutation(api.receiving.saveLines, { ...stale, lines: [counted(code)] }),
      () => owner.mutation(api.receiving.saveDetails, { ...stale, docRef: "stale" }),
      () => owner.mutation(api.receiving.addEvidence, { ...stale, kind: "note", text: "stale" }),
      () => owner.mutation(api.receiving.requestExtraction, stale),
      () => owner.mutation(api.receiving.reject, { ...stale, reason: "stale" }),
      () => owner.mutation(api.receiving.post, stale),
    ]) await expect(operation()).rejects.toThrow("Receipt changed");
  });

  it("keeps human edits when an old AI job completes or errors after a draft edit", async () => {
    const { t, owner } = await business();
    const code = await catalogue(owner);
    const receiptId = await owner.mutation(api.receiving.create, { actor });
    const evidenceVersion = await owner.mutation(api.receiving.addEvidence, { actor, receiptId, expectedVersion: 1, kind: "note", text: "Supplier note" });
    const jobVersion = await owner.mutation(api.receiving.requestExtraction, { actor, receiptId, expectedVersion: evidenceVersion });
    expect(jobVersion).not.toBeNull();
    const editedVersion = await owner.mutation(api.receiving.saveLines, { actor, receiptId, expectedVersion: jobVersion!, lines: [counted(code, 3, "1A00", { source: "ai" })] });
    await t.mutation(internal.receiving.setExtraction, { receiptId, jobVersion: jobVersion!, status: "done", supplier: "Wrong supplier", lines: [counted(code, 1)] });
    await t.mutation(internal.receiving.setExtraction, { receiptId, jobVersion: jobVersion!, status: "error", error: "late error" });
    const receipt = await owner.query(api.receiving.get, { receiptId });
    expect(receipt).toMatchObject({ version: editedVersion, extraction: { status: "idle" }, lines: [{ qty: 3, source: "staff" }] });
    expect(receipt?.supplier).toBeUndefined();
    expect(await t.query(internal.receiving.forExtraction, { receiptId, jobVersion: jobVersion! })).toBeNull();
  });

  it("invalidates an AI job when new evidence or receipt details arrive", async () => {
    const { t, owner } = await business();
    const code = await catalogue(owner);
    for (const edit of ["evidence", "details"] as const) {
      const receiptId = await owner.mutation(api.receiving.create, { actor });
      const evidenceVersion = await owner.mutation(api.receiving.addEvidence, { actor, receiptId, expectedVersion: 1, kind: "note", text: "Original note" });
      const jobVersion = (await owner.mutation(api.receiving.requestExtraction, { actor, receiptId, expectedVersion: evidenceVersion }))!;
      const version = edit === "evidence"
        ? await owner.mutation(api.receiving.addEvidence, { actor, receiptId, expectedVersion: jobVersion, kind: "note", text: "Correction" })
        : await owner.mutation(api.receiving.saveDetails, { actor, receiptId, expectedVersion: jobVersion, supplier: "Human supplier" });
      await t.mutation(internal.receiving.setExtraction, { receiptId, jobVersion, status: "done", supplier: "Wrong supplier", lines: [counted(code)] });
      expect(await owner.query(api.receiving.get, { receiptId })).toMatchObject({ version, lines: [], extraction: { status: "idle" } });
    }
  });

  it("advances the revision when extraction fails, so an older open editor cannot silently save", async () => {
    const { t, owner } = await business();
    const receiptId = await owner.mutation(api.receiving.create, { actor });
    const evidenceVersion = await owner.mutation(api.receiving.addEvidence, { actor, receiptId, expectedVersion: 1, kind: "note", text: "Supplier note" });
    const jobVersion = (await owner.mutation(api.receiving.requestExtraction, { actor, receiptId, expectedVersion: evidenceVersion }))!;
    await t.mutation(internal.receiving.setExtraction, { receiptId, jobVersion, status: "error", error: "Provider unavailable" });
    expect(await owner.query(api.receiving.get, { receiptId })).toMatchObject({ version: jobVersion + 1, extraction: { status: "error" } });
    await expect(owner.mutation(api.receiving.saveDetails, { actor, receiptId, expectedVersion: jobVersion, docRef: "stale" })).rejects.toThrow("Receipt changed");
  });

  it("never accepts AI output as physically verified stock or an allocation/purchase instruction", async () => {
    const { t, owner } = await business();
    const code = await catalogue(owner);
    const po = await purchase(owner, code, 4, "ORDER-AI");
    const receiptId = await owner.mutation(api.receiving.create, { actor });
    const evidenceVersion = await owner.mutation(api.receiving.addEvidence, { actor, receiptId, expectedVersion: 1, kind: "note", text: "Supplier note" });
    const jobVersion = (await owner.mutation(api.receiving.requestExtraction, { actor, receiptId, expectedVersion: evidenceVersion }))!;
    await t.mutation(internal.receiving.setExtraction, { receiptId, jobVersion, status: "done", lines: [counted(code, 2, "1A00", { purchaseOrderId: po._id })] });
    const receipt = await owner.query(api.receiving.get, { receiptId });
    expect(receipt?.lines[0]).toMatchObject({ skuCode: code, qty: 2, source: "ai", verified: false });
    expect(receipt?.lines[0]?.locations).toBeUndefined();
    expect(receipt?.lines[0]?.purchaseOrderId).toBeUndefined();
    expect(await t.run(async ctx => ctx.db.query("batches").take(1))).toHaveLength(0);
  });
});

describe("receiving staff authority", () => {
  it("allows warehouse staff and owners, ignores client actor claims, and refuses sales and signed-out writes", async () => {
    const { t, owner } = await business();
    const code = await catalogue(owner);
    for (const role of ["warehouse", "sales"] as const) {
      const tokenIdentifier = `https://clerk.example|${role}-receiver`;
      await owner.mutation(api.access.inviteStaff, { email: `${role}@example.com`, name: `${role} real`, role });
      await t.mutation(internal.access.bindInvitation, { tokenIdentifier, verifiedEmails: [`${role}@example.com`] });
      const member = t.withIdentity({ tokenIdentifier });
      if (role === "warehouse") {
        const warehouseCode = await catalogue(member, "CHAIR-ACME-0002");
        const receipt = await draft(member, [counted(warehouseCode)]);
        await member.mutation(api.receiving.post, { actor, receiptId: receipt.receiptId, expectedVersion: receipt.version });
        expect((await member.query(api.receiving.get, { receiptId: receipt.receiptId }))?.postedBy).toMatchObject({ role: "warehouse", name: "warehouse real" });
      } else {
        await expect(member.mutation(api.receiving.create, { actor })).rejects.toThrow("only");
        await expect(catalogue(member, "CHAIR-ACME-0002")).rejects.toThrow("only");
      }
    }
    await expect(t.mutation(api.receiving.create, { actor })).rejects.toThrow("Sign in");
    await expect(t.mutation(api.receiving.generateUploadUrl, { actor })).rejects.toThrow("Sign in");
  });
});
