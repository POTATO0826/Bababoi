/// <reference types="vite/client" />
// The synthetic demo dataset in an isolated in-memory database (convex-test): internal consistency, the
// labelled synthetic records, the app's own rules applied to them, and repeatable resets.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";
import { quoteState } from "../src/domain/costs";
import { OPEN_DEAL } from "../src/domain/deal";
import { flagBatches } from "../src/domain/ageing";
import { historyStart, replenishmentPlan } from "../src/domain/replenish";
import { applyPick, batchQty } from "../src/domain/stock";

const modules = import.meta.glob("./**/*.ts");
const actor = { role: "owner" as const, name: "Client-supplied" };
const ownerToken = "https://wareorb.local-demo|demo-presenter";
const NOW = Date.UTC(2026, 9, 24, 8);

let fetchCalls = 0;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("WAREORB_ALLOW_DEMO_SEED", "true");
  fetchCalls = 0;
  vi.stubGlobal("fetch", async () => { fetchCalls++; throw new Error("Seeding must not call external services"); });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function seeded() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  await t.mutation(internal.access.bootstrapOwner, { tokenIdentifier: ownerToken, email: "presenter@wareorb.local", name: "Demo presenter" });
  const owner = t.withIdentity({ tokenIdentifier: ownerToken, issuer: "https://wareorb.local-demo", subject: "demo-presenter" });
  await t.mutation(internal.seed.run, {});
  return { t, owner };
}

interface Dump {
  skus: Doc<"skus">[]; batches: Doc<"batches">[]; reservations: Doc<"reservations">[]; purchaseOrders: Doc<"purchaseOrders">[];
  movements: Doc<"movements">[]; receipts: Doc<"receipts">[]; deals: Doc<"deals">[]; quotes: Doc<"quotes">[];
  collections: Doc<"collections">[]; audit: Doc<"audit">[]; kv: Doc<"kv">[]; settings: Doc<"settings">[]; scheduled: unknown[];
}

/** Every table the seed writes, read in full (small in the demo). */
const dump = (t: ReturnType<typeof convexTest>): Promise<Dump> => t.run(async (ctx) => ({
  skus: await ctx.db.query("skus").collect(),
  batches: await ctx.db.query("batches").collect(),
  reservations: await ctx.db.query("reservations").collect(),
  purchaseOrders: await ctx.db.query("purchaseOrders").collect(),
  movements: await ctx.db.query("movements").collect(),
  receipts: await ctx.db.query("receipts").collect(),
  deals: await ctx.db.query("deals").collect(),
  quotes: await ctx.db.query("quotes").collect(),
  collections: await ctx.db.query("collections").collect(),
  audit: await ctx.db.query("audit").collect(),
  kv: await ctx.db.query("kv").collect(),
  settings: await ctx.db.query("settings").collect(),
  scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
}));

const byCode = <T extends { code: string }>(rows: T[], code: string) => rows.find((r) => r.code === code) ?? expect.fail(`missing ${code}`);
const unique = (values: string[]) => expect(new Set(values).size).toBe(values.length);

/** `fresh`: straight from the seed, so every record must be labelled synthetic. */
function expectConsistent(d: Dump, fresh = true) {
  // Codes are unique and every reference resolves.
  unique(d.skus.map((s) => s.code));
  unique(d.batches.map((b) => b.code));
  unique(d.receipts.map((r) => r.code));
  unique(d.deals.map((x) => x.code));
  unique(d.purchaseOrders.map((p) => p.code));
  const ids = new Set<string>([...d.batches, ...d.receipts, ...d.deals, ...d.quotes, ...d.reservations, ...d.purchaseOrders].map((x) => x._id));
  const skus = new Set(d.skus.map((s) => s.code));
  for (const b of d.batches) {
    expect(skus.has(b.skuCode)).toBe(true);
    if (b.receiptId) expect(ids.has(b.receiptId)).toBe(true);
    if (fresh) expect(b.synthetic).toBe(true);
  }
  for (const m of d.movements) {
    expect(skus.has(m.skuCode)).toBe(true);
    if (m.batchId) expect(ids.has(m.batchId)).toBe(true);
    if (fresh) expect(m.synthetic).toBe(true);
  }
  for (const r of d.reservations) expect(ids.has(r.batchId) && (!r.dealId || ids.has(r.dealId))).toBe(true);
  for (const r of d.receipts) {
    expect(r.synthetic).toBe(true);
    for (const l of r.lines) if (l.purchaseOrderId) expect(ids.has(l.purchaseOrderId)).toBe(true);
  }
  for (const q of d.quotes) expect(ids.has(q.dealId)).toBe(true);
  for (const x of d.deals) {
    expect(ids.has(x.batchId)).toBe(true);
    expect(x.synthetic).toBe(true);
    for (const id of [x.proposal?.quoteId, x.decision?.quoteId, x.reservationId, x.cargo?.receiptId]) if (id) expect(ids.has(id)).toBe(true);
  }
  // Bays: no bay holds two batches, and every active hold is inside its batch's bays.
  const slots = d.batches.filter((b) => b.status === "active").flatMap((b) => b.locations.map((l) => l.slot));
  unique(slots);
  for (const r of d.reservations.filter((x) => x.status === "active" && x.pick.length)) {
    const batch = d.batches.find((b) => b._id === r.batchId)!;
    expect(() => applyPick(batch.locations, r.pick)).not.toThrow();
    expect(r.pick.reduce((a, p) => a + p.qty, 0)).toBe(r.qty);
  }
  // Every seeded sale and receipt explains itself in History.
  for (const x of d.deals) expect(d.audit.some((a) => a.entity === `deal:${x._id}`)).toBe(true);
  for (const r of d.receipts) expect(d.audit.some((a) => a.entity === `receipt:${r._id}`)).toBe(true);
  // Seeding schedules nothing: no AI reading, icon or quote jobs.
  expect(d.scheduled).toHaveLength(0);
}

describe("demo dataset", () => {
  it("is internally consistent, labelled synthetic, and makes no external calls", async () => {
    const { t } = await seeded();
    const d = await dump(t);
    expectConsistent(d);
    expect(fetchCalls).toBe(0);
    expect(d.kv.find((k) => k.key === "seq:D")?.value).toBe("1008");
  });

  it("keeps the scripted anchors", async () => {
    const { t } = await seeded();
    const d = await dump(t);
    expect(byCode(d.batches, "B-2140-A").locations).toEqual([{ slot: "1A00", qty: 2 }, { slot: "1A01", qty: 2 }]);
    expect(byCode(d.receipts, "DN-2291").status).toBe("needs_review");
    const onHand = d.batches.filter((b) => b.skuCode === "SOFA-NORDE-3301").reduce((a, b) => a + batchQty(b), 0);
    expect(onHand).toBe(5);
    const flags = flagBatches({ batches: d.batches, reservations: d.reservations, movements: d.movements, rule: d.settings[0]!.ageing, now: NOW, historyFrom: historyStart({ settings: d.settings[0]!, movements: d.movements }) });
    expect(flags.filter((f) => f.flagged).length).toBe(5);
  });

  it("has a sale at every workflow stage, with coherent stock for approval and collection", async () => {
    const { t } = await seeded();
    const d = await dump(t);
    expect(new Set(d.deals.map((x) => x.status))).toEqual(new Set(["finding_buyer", "offer_ready", "pending_approval", "approved", "collected", "rejected", "closed"]));

    const approved = byCode(d.deals, "D-1005");
    const hold = d.reservations.find((r) => r._id === approved.reservationId)!;
    expect([hold.status, hold.qty, hold.dealId]).toEqual(["active", approved.qty, approved._id]);

    const collected = byCode(d.deals, "D-1006");
    const batch = d.batches.find((b) => b._id === collected.batchId)!;
    const out = d.movements.filter((m) => m.ref === collected.code && m.kind === "dispatch" && m.reason === "sale");
    expect(out).toHaveLength(1);
    expect(out[0]!.batchId).toBe(batch._id);
    expect(batchQty(batch) + out[0]!.qty).toBe(batch.qtyReceived);
    expect(out[0]!.lines.some((l) => batch.locations.some((b) => b.slot === l.slot))).toBe(false);
    const consumed = d.reservations.find((r) => r.dealId === collected._id)!;
    expect([consumed.status, consumed.qty, consumed.pick]).toEqual(["consumed", 0, []]);
    expect(d.collections.find((c) => c.dealId === collected._id)?.qty).toBe(collected.collectedQty);
    expect(collected.booking?.simulated).toBe(true);

    const rejected = byCode(d.deals, "D-1007");
    expect(rejected.decision?.approved).toBe(false);
    expect(rejected.decision?.reason).toBeTruthy();
  });

  it("delivery details: confirmed buyers and coordinates, future collection, measured cargo with provenance", async () => {
    const { t } = await seeded();
    const d = await dump(t);
    const open = d.deals.filter((x) => (OPEN_DEAL as readonly string[]).includes(x.status) && x.status !== "finding_buyer");
    for (const x of open) {
      expect(x.buyer?.name).toMatch(/\(synthetic\)$/);
      expect(x.collectAt! > NOW).toBe(true);
    }
    const sources = new Set(d.deals.flatMap((x) => (x.cargo ? [x.cargo.source] : [])));
    expect(sources).toEqual(new Set(["receipt", "catalogue", "staff"]));
    const measured = byCode(d.deals, "D-1002");
    const batch = d.batches.find((b) => b._id === measured.batchId)!;
    expect(measured.cargo?.receiptId).toBe(batch.receiptId);
    const line = d.receipts.find((r) => r._id === batch.receiptId)!.lines.find((l) => l.key === measured.cargo?.lineKey)!;
    expect(line.skuCode).toBe(measured.skuCode);
    expect(measured.cargo?.packages[0]).toMatchObject({ lCm: line.packageDimsCm!.lCm, kg: line.packageWeightKg });
    expect(measured.destination?.confirmedBy).toBeTruthy();
  });

  it("quotes are synthetic and show current, incomplete, expired and failed results", async () => {
    const { t } = await seeded();
    const d = await dump(t);
    for (const q of d.quotes) {
      expect(q.note).toBe("Synthetic");
      expect(q.verifiedAt ?? q.reference ?? q.terms).toBeUndefined();
      expect(q.carrier === "Lalamove" ? q.status === "error" && q.totalSen === undefined : /\(synthetic\)$/.test(q.carrier)).toBe(true);
    }
    const offer = byCode(d.deals, "D-1002");
    const states = d.quotes.filter((q) => q.dealId === offer._id).map((q) => (q.status === "ok" && q.unloading === "unknown" ? "incomplete" : quoteState(q, offer, NOW)));
    expect(new Set(states)).toEqual(new Set(["current", "incomplete", "expired", "error"]));
  });

  it("receipts: needs review (unknown SKU, unreadable quantity), posted with measurements, rejected; a part-received order", async () => {
    const { t } = await seeded();
    const d = await dump(t);
    const review = byCode(d.receipts, "RC-474");
    expect(review.lines.some((l) => l.skuCode === null)).toBe(true);
    expect(review.lines.some((l) => l.qty === null)).toBe(true);
    expect(review.lines.some((l) => l.packageDimsCm == null)).toBe(true);
    expect(byCode(d.receipts, "RC-475")).toMatchObject({ status: "rejected" });
    expect(byCode(d.receipts, "RC-475").rejectReason).toBeTruthy();
    const po = byCode(d.purchaseOrders, "PO-3050");
    expect([po.status, po.qtyReceived, po.qty]).toEqual(["open", 3, 6]);
    const partial = byCode(d.receipts, "RC-472");
    expect(partial.status).toBe("posted");
    expect(partial.docKey).toBeTruthy();
    expect(partial.lines[0]!.purchaseOrderId).toBe(po._id);
    expect(d.batches.some((b) => b.receiptId === partial._id && b.qtyReceived === 3)).toBe(true);
  });

  it("replenishment has suggestions and honest gaps (unknown unit cost, no recent sales)", async () => {
    const { t } = await seeded();
    const d = await dump(t);
    const plan = replenishmentPlan({
      settings: d.settings[0]!, skus: d.skus, batches: d.batches.filter((b) => b.status === "active"),
      reservations: d.reservations.filter((r) => r.status === "active"), purchaseOrders: d.purchaseOrders.filter((p) => p.status === "open"), movements: d.movements,
    }, NOW);
    expect(plan.totals.recommendedLines).toBeGreaterThan(0);
    const why = (code: string) => plan.rows.find((r) => r.code === code)!.s;
    expect(why("LAMP-ORBI-0450")).toMatchObject({ status: "insufficient", lines: ["Record the purchase unit cost before estimating a replenishment budget"] });
    expect(why("TABLE-VELA-2000").status).toBe("insufficient");
  });
});

describe("demo dataset under the app's own rules", () => {
  it("refuses to approve, book or collect with synthetic carrier replies; rejection still works", async () => {
    const { t, owner } = await seeded();
    const d = await dump(t);
    const pending = byCode(d.deals, "D-1004");
    await expect(owner.mutation(api.deals.decide, { actor, dealId: pending._id, expectedVersion: pending.version, quoteId: pending.proposal!.quoteId, approve: true })).rejects.toThrow("Record and verify the carrier's actual reply");
    await owner.mutation(api.deals.decide, { actor, dealId: pending._id, expectedVersion: pending.version, quoteId: pending.proposal!.quoteId, approve: false, reason: "Test rejection" });

    const approved = byCode(d.deals, "D-1005");
    await expect(owner.mutation(api.deals.recordBooking, { actor, dealId: approved._id, expectedVersion: approved.version, expectedStateVersion: approved.stateVersion ?? 0, reference: "X-1", confirmed: true })).rejects.toThrow("Record and verify");
    await expect(owner.mutation(api.deals.confirmCollection, { actor, dealId: approved._id, expectedVersion: approved.version, requestId: "r1", lines: [{ slot: "2B15", qty: 1 }], collectedAt: NOW, confirmed: true })).rejects.toThrow("Record the actual carrier arrangement first");
    await expect(owner.mutation(api.receiving.post, { actor, receiptId: byCode(d.receipts, "RC-474")._id, expectedVersion: 1 })).rejects.toThrow();
  });

  it("the ready sale can be walked for real: verified reply → approval → carrier → collection", async () => {
    const { t, owner } = await seeded();
    const before = await dump(t);
    const deal = byCode(before.deals, "D-1002");
    await owner.mutation(api.quotes.addManual, { actor, dealId: deal._id, expectedVersion: deal.version, carrier: "Test carrier", service: "Van", totalSen: 25_000, unloading: "included", validHours: 24, reference: "Test reply 1", terms: "Transport and unloading included", confirmed: true });
    const quote = (await dump(t)).quotes.find((q) => q.dealId === deal._id && q.carrier === "Test carrier")!;
    await owner.mutation(api.deals.submit, { actor, dealId: deal._id, expectedVersion: deal.version, quoteId: quote._id });
    await owner.mutation(api.deals.decide, { actor, dealId: deal._id, expectedVersion: deal.version, quoteId: quote._id, approve: true });
    let now = byCode((await dump(t)).deals, "D-1002") as Doc<"deals">;
    await owner.mutation(api.deals.recordBooking, { actor, dealId: deal._id, expectedVersion: now.version, expectedStateVersion: now.stateVersion ?? 0, reference: "Test booking 1", confirmed: true });
    const mid = await dump(t);
    now = byCode(mid.deals, "D-1002");
    const hold = mid.reservations.find((r) => r._id === now.reservationId)!;
    await owner.mutation(api.deals.confirmCollection, { actor, dealId: deal._id, expectedVersion: now.version, requestId: "walk-1", lines: hold.pick, collectedAt: NOW, confirmed: true });
    const after = await dump(t);
    expect(byCode(after.deals, "D-1002").status).toBe("collected");
    const batchBefore = before.batches.find((b) => b._id === deal.batchId)!;
    expect(batchQty(after.batches.find((b) => b._id === deal.batchId)!)).toBe(batchQty(batchBefore) - deal.qty);
    // The presenter's own actions are real records (not synthetic); references and bays must still hold.
    expectConsistent({ ...after, scheduled: [] }, false);
    // The app's next sale continues after the seeded codes.
    const free = after.batches.find((b) => b.status === "active" && !after.deals.some((x) => x.batchId === b._id))!;
    const id = await owner.mutation(api.deals.create, { actor, batchId: free._id, assignee: "Presenter" });
    expect((await t.run(async (ctx) => ctx.db.get("deals", id)))?.code).toBe("D-1009");
  });

  it("a second reset gives the same dataset with no duplicates or broken references", async () => {
    const { t } = await seeded();
    const first = await dump(t);
    await t.mutation(internal.seed.run, {});
    const second = await dump(t);
    expectConsistent(second);
    const shape = (x: Dump) => ({
      skus: x.skus.map((s) => s.code).sort(), batches: x.batches.map((b) => `${b.code}:${batchQty(b)}`).sort(), deals: x.deals.map((y) => `${y.code}:${y.status}`).sort(),
      receipts: x.receipts.map((r) => `${r.code}:${r.status}`).sort(), quotes: x.quotes.length, reservations: x.reservations.length, movements: x.movements.length,
      audit: x.audit.length, collections: x.collections.length, purchaseOrders: x.purchaseOrders.map((p) => `${p.code}:${p.qtyReceived}`).sort(),
    });
    expect(shape(second)).toEqual(shape(first));
    expect(fetchCalls).toBe(0);
  });
});
