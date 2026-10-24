/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");
const actor = { role: "warehouse" as const, name: "Client spoof" };
async function fixture() {
  const t = convexTest(schema, modules);
  const tokenIdentifier = "https://clerk.example|business-owner";
  await t.mutation(internal.access.bootstrapOwner, { tokenIdentifier, name: "Owner", email: "owner@example.com" });
  const owner = t.withIdentity({ tokenIdentifier, subject: "business-owner", issuer: "https://clerk.example" });
  const batchId = await t.run(async ctx => {
    await ctx.db.insert("skus", { code: "CHAIR-REAL-001", model: "Actual chair", variant: "Black", category: "chairs", kind: "chair", cap: 4, doors: 0, color: "#222222", homeFloor: 1, homeZone: "A", packages: [{ lCm: 50, wCm: 50, hCm: 70, kg: 10 }], price: { listSen: 20000, clearanceSen: 15000, unitCostSen: 10000 }, synthetic: false });
    return ctx.db.insert("batches", { code: "B-REAL-1", skuCode: "CHAIR-REAL-001", receivedAt: Date.now() - 120 * 86400000, qtyReceived: 4, locations: [{ slot: "1A00", qty: 2 }, { slot: "1A01", qty: 2 }], status: "active", synthetic: false });
  });
  async function prepare(qty = 2) {
    const dealId = await owner.mutation(api.deals.create, { actor, batchId, assignee: "Sales" });
    await owner.mutation(api.deals.update, { actor, dealId, expectedVersion: 1, patch: { buyer: { name: "Real Buyer" }, qty, priceSen: 40000, collectAt: Date.now() + 86400000, destination: { label: "Buyer", address: "Confirmed delivery address", lat: 3.12, lng: 101.6 } } });
    await owner.mutation(api.deals.confirmDestination, { actor, dealId, expectedVersion: 2 });
    await owner.mutation(api.deals.confirmFit, { actor, dealId, expectedVersion: 2 });
    await owner.mutation(api.quotes.addManual, { actor, dealId, expectedVersion: 2, carrier: "Actual carrier", service: "Van", totalSen: 10000, unloading: "included", validHours: 24, reference: "WhatsApp Q-1", terms: "Includes unloading and all surcharges", confirmed: true });
    const quote = (await owner.query(api.quotes.forDeal, { dealId }))[0]!;
    await owner.mutation(api.deals.submit, { actor, dealId, expectedVersion: 2, quoteId: quote._id });
    return { dealId, quoteId: quote._id };
  }
  async function approve(dealId: Id<"deals">, quoteId: Id<"quotes">) {
    await owner.mutation(api.deals.decide, { actor, dealId, expectedVersion: 2, quoteId, approve: true });
  }
  return { t, owner, batchId, prepare, approve };
}

describe("real business ledger", () => {
  it("reserves on approval, requires a real arrangement, and records partial collections exactly once", async () => {
    const f = await fixture(); const { t, owner, batchId } = f;
    const { dealId, quoteId } = await f.prepare(); await f.approve(dealId, quoteId);
    let snap = (await owner.query(api.ledger.snapshot, { since: 0 }))!;
    expect(snap.batches[0]?.locations.reduce((n, l) => n + l.qty, 0)).toBe(4);
    expect(snap.reservations[0]?.qty).toBe(2);
    expect(snap.deals[0]?.booking).toBeUndefined();
    const first = { actor, dealId, expectedVersion: 2, requestId: "collection-1", lines: [{ slot: "1A00", qty: 1 }], collectedAt: Date.now(), confirmed: true };
    await expect(owner.mutation(api.deals.confirmCollection, first)).rejects.toThrow("actual carrier");
    await owner.mutation(api.deals.recordBooking, { actor, dealId, expectedVersion: 2, expectedStateVersion: 5, reference: "BOOK-REAL-1", confirmed: true });
    expect(await owner.mutation(api.deals.confirmCollection, first)).toEqual({ qty: 1, repeated: false });
    expect(await owner.mutation(api.deals.confirmCollection, first)).toEqual({ qty: 1, repeated: true });
    await expect(owner.mutation(api.deals.confirmCollection, { ...first, lines: [{ slot: "1A00", qty: 2 }] })).rejects.toThrow("different collection");
    snap = (await owner.query(api.ledger.snapshot, { since: 0 }))!;
    expect(snap.reservations[0]?.qty).toBe(1); expect(snap.deals[0]?.status).toBe("approved");
    expect(snap.movements.filter(m => m.kind === "dispatch")).toHaveLength(1);
    await expect(owner.mutation(api.deals.revise, { actor, dealId, expectedVersion: 3, expectedStateVersion: 7, reason: "Changed" })).rejects.toThrow("undelivered");
    await owner.mutation(api.deals.confirmCollection, { ...first, expectedVersion: 3, requestId: "collection-2", collectedAt: Date.now() });
    const batch = await t.run(ctx => ctx.db.get("batches", batchId));
    expect(batch?.locations).toEqual([{ slot: "1A01", qty: 2 }]);
    expect((await t.run(ctx => ctx.db.get("deals", dealId)))?.collectedQty).toBe(2);
    expect((await t.run(ctx => ctx.db.get("deals", dealId)))?.status).toBe("collected");
  });

  it("invalidates approval and releases bays when an undelivered order is revised", async () => {
    const f = await fixture(); const { dealId, quoteId } = await f.prepare(); await f.approve(dealId, quoteId);
    await expect(f.owner.mutation(api.quotes.setUnloading, { actor, quoteId, expectedVersion: 2, unloading: "included" })).rejects.toThrow("not open");
    await f.owner.mutation(api.deals.revise, { actor, dealId, expectedVersion: 2, expectedStateVersion: 5, reason: "Buyer changed requirements; cancelled carrier externally" });
    const snap = (await f.owner.query(api.ledger.snapshot, { since: 0 }))!;
    expect(snap.reservations).toHaveLength(0); expect(snap.deals[0]?.version).toBe(3);
    expect(snap.deals[0]?.decision).toBeUndefined(); expect(snap.deals[0]?.booking).toBeUndefined();
    await expect(f.owner.mutation(api.deals.submit, { actor, dealId, expectedVersion: 3, quoteId })).rejects.toThrow();
  });

  it("blocks sandbox approval and invalid or unverified manual charges", async () => {
    const f = await fixture(); const { dealId, quoteId } = await f.prepare();
    await f.t.run(ctx => ctx.db.patch("quotes", quoteId, { source: "lalamove_sandbox" }));
    await expect(f.approve(dealId, quoteId)).rejects.toThrow("Sandbox");
    await expect(f.owner.mutation(api.quotes.addManual, { actor, dealId, expectedVersion: 2, carrier: "C", service: "Van", totalSen: 100, unloading: "excluded", unloadingSen: -50, validHours: 24, reference: "Q", terms: "Confirmed", confirmed: true })).rejects.toThrow("unloading");
    const before = (await f.owner.query(api.ledger.snapshot, { since: 0 }))!;
    expect(before.reservations).toHaveLength(0);
  });

  it("does not hide an existing open deal behind twenty historical closed records", async () => {
    const f = await fixture();
    const { dealId } = await f.prepare();
    await f.t.run(async ctx => {
      const d = (await ctx.db.get("deals", dealId))!;
      const { _id, _creationTime, ...values } = d;
      await ctx.db.patch("deals", dealId, { status: "closed" });
      for (let i = 0; i < 22; i++) await ctx.db.insert("deals", { ...values, code: `OLD-${i}`, status: "closed" });
    });
    await f.owner.mutation(api.deals.create, { actor, batchId: f.batchId, assignee: "Sales" });
    await expect(f.owner.mutation(api.deals.create, { actor, batchId: f.batchId, assignee: "Other" })).rejects.toThrow("Already with sales");
  });

  it("records only confirmed purchases, preserves physical stock and deduplicates references", async () => {
    const f = await fixture();
    const order = { actor, skuCode: "CHAIR-REAL-001", qty: 2, rationale: "Actual supplier order", supplier: "Supplier", orderRef: "PO-EXT-1", confirmedAt: Date.now(), unitCostSen: 10000, confirmed: true };
    const code = await f.owner.mutation(api.replenish.createPO, order);
    expect(await f.owner.mutation(api.replenish.createPO, order)).toBe(code);
    await expect(f.owner.mutation(api.replenish.createPO, { ...order, qty: 3 })).rejects.toThrow("different details");
    const snap = (await f.owner.query(api.ledger.snapshot, { since: 0 }))!;
    expect(snap.purchaseOrders).toHaveLength(1); expect(snap.purchaseOrders[0]?.qtyReceived).toBe(0);
    expect(snap.batches[0]?.qtyReceived).toBe(4); expect(snap.movements).toHaveLength(0);
    await expect(f.owner.mutation(api.replenish.createPO, { ...order, orderRef: "PO-EXT-2", confirmed: false })).rejects.toThrow();
  });

  it("uses different bay picks for simultaneous approvals even with legacy duplicate deals", async () => {
    const f = await fixture(); const first = await f.prepare();
    const second = await f.t.run(async ctx => {
      const deal = (await ctx.db.get("deals", first.dealId))!;
      const quote = (await ctx.db.get("quotes", first.quoteId))!;
      const { _id, _creationTime, ...d } = deal;
      const { _id: qid, _creationTime: qtime, ...q } = quote;
      const dealId = await ctx.db.insert("deals", { ...d, code: "LEGACY-DUPLICATE" });
      const quoteId = await ctx.db.insert("quotes", { ...q, dealId, dedupeKey: "legacy-duplicate" });
      await ctx.db.patch("deals", dealId, { proposal: { ...d.proposal!, quoteId } });
      return { dealId, quoteId };
    });
    await Promise.all([f.approve(first.dealId, first.quoteId), f.approve(second.dealId, second.quoteId)]);
    const snap = (await f.owner.query(api.ledger.snapshot, { since: 0 }))!;
    expect(snap.reservations).toHaveLength(2);
    const picks = snap.reservations.flatMap(r => r.pick);
    expect(new Set(picks.map(p => p.slot)).size).toBe(2);
    expect(picks.reduce((sum, p) => sum + p.qty, 0)).toBe(4);
  });

  it("rejects expired proposals and invalidates a pending proposal when charges change", async () => {
    const f = await fixture(); const { dealId, quoteId } = await f.prepare();
    await f.owner.mutation(api.quotes.setUnloading, { actor, quoteId, expectedVersion: 2, unloading: "excluded", unloadingSen: 1000 });
    let deal = await f.t.run(ctx => ctx.db.get("deals", dealId));
    expect(deal?.version).toBe(3); expect(deal?.proposal).toBeUndefined();
    await f.owner.mutation(api.deals.submit, { actor, dealId, expectedVersion: 3, quoteId });
    await f.t.run(ctx => ctx.db.patch("quotes", quoteId, { expiresAt: Date.now() - 1 }));
    await expect(f.owner.mutation(api.deals.decide, { actor, dealId, expectedVersion: 3, quoteId, approve: true })).rejects.toThrow("expired");
    expect((await f.owner.query(api.ledger.snapshot, { since: 0 }))?.reservations).toHaveLength(0);
  });

  it("keeps the live ledger usable beyond a thousand historical documents and pages older records", async () => {
    const f = await fixture(); const { dealId } = await f.prepare();
    await f.t.run(async ctx => {
      const { _id, _creationTime, ...deal } = (await ctx.db.get("deals", dealId))!;
      for (let i = 0; i < 1001; i++) {
        await ctx.db.insert("deals", { ...deal, code: `HISTORY-${i}`, status: "closed" });
        await ctx.db.insert("receipts", { code: `HISTORY-R-${i}`, status: "posted", evidence: [], lines: [], extraction: { status: "idle" }, createdBy: actor, createdAt: Date.now(), synthetic: false });
      }
    });
    const snap = (await f.owner.query(api.ledger.snapshot, { since: 0 }))!;
    expect(snap.deals.some(d => d._id === dealId)).toBe(true);
    expect(snap.receipts).toHaveLength(25);
    const first = await f.owner.query(api.ledger.receiptHistory, { paginationOpts: { numItems: 25, cursor: null } });
    expect(first.page).toHaveLength(25); expect(first.isDone).toBe(false);
    const next = await f.owner.query(api.ledger.receiptHistory, { paginationOpts: { numItems: 25, cursor: first.continueCursor } });
    expect(next.page).toHaveLength(25); expect(next.page[0]?._id).not.toBe(first.page[0]?._id);
    const past = await f.owner.query(api.ledger.dealHistory, { paginationOpts: { numItems: 25, cursor: null } });
    expect(past.page).toHaveLength(25);
    expect((await f.owner.query(api.deals.get, { dealId: past.page[0]!._id }))?._id).toBe(past.page[0]!._id);
  });

  it("refuses an old close intent after approval changes the same offer version", async () => {
    const f = await fixture(); const { dealId, quoteId } = await f.prepare();
    const old = (await f.owner.query(api.deals.get, { dealId }))!;
    await f.approve(dealId, quoteId);
    await expect(f.owner.mutation(api.deals.close, { actor, dealId, expectedVersion: old.version, expectedStateVersion: old.stateVersion ?? 0, reason: "Old unapproved request" })).rejects.toThrow("workflow changed");
    expect((await f.owner.query(api.ledger.snapshot, { since: 0 }))?.reservations).toHaveLength(1);
  });
});
