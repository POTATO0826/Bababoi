import type { Id, TableNames } from "./_generated/dataModel";
import { env, internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { actor } from "./schema";
import { audit, fail } from "./lib";
import { getActor } from "./access";
import { documentKey } from "./receiving";
import { buildSeed } from "../src/domain/seed";

const TABLES: TableNames[] = [
  "skus",
  "batches",
  "reservations",
  "purchaseOrders",
  "movements",
  "audit",
  "receipts",
  "deals",
  "quotes",
  "collections",
  "settings",
  "kv",
];

async function wipe(ctx: MutationCtx) {
  for (const t of TABLES) {
    for await (const doc of ctx.db.query(t)) await ctx.db.delete(t, doc._id);
  }
}

/** Insert the synthetic ledger from `buildSeed`. Records refer to each other by code until they have IDs. */
async function load(ctx: MutationCtx) {
  const now = Date.now();
  const s = buildSeed(now);
  const seedActor = { role: "owner" as const, name: "Seed" };
  const need = <T,>(map: Map<string, T>, code: string, what: string): T => map.get(code) ?? fail(`Seed data is inconsistent: no ${what} ${code}`);

  for (const sku of s.skus) await ctx.db.insert("skus", sku);

  const poIds = new Map<string, Id<"purchaseOrders">>();
  for (const { qtyReceived = 0, status = "open", ...p } of s.purchaseOrders) {
    poIds.set(p.code, await ctx.db.insert("purchaseOrders", { ...p, qtyReceived, status, createdBy: seedActor }));
  }

  const receiptIds = new Map<string, Id<"receipts">>();
  for (const { lines, ...r } of s.receipts) {
    receiptIds.set(r.code, await ctx.db.insert("receipts", {
      ...r,
      ...(r.status === "posted" ? { docKey: documentKey(r.supplier, r.docRef) } : {}),
      lines: lines.map(({ poCode, ...l }) => ({ ...l, ...(poCode ? { purchaseOrderId: need(poIds, poCode, "purchase order") } : {}) })),
      synthetic: true,
    }));
  }

  const batchIds = new Map<string, Id<"batches">>();
  for (const { receiptCode, ...b } of s.batches) {
    batchIds.set(b.code, await ctx.db.insert("batches", {
      ...b,
      status: b.locations.length ? "active" : "depleted",
      ...(receiptCode ? { receiptId: need(receiptIds, receiptCode, "receipt") } : {}),
      synthetic: true,
    }));
  }

  const dealIds = new Map<string, Id<"deals">>();
  for (const { batchCode, cargo, proposal: _p, decision: _d, ...d } of s.deals) {
    dealIds.set(d.code, await ctx.db.insert("deals", {
      ...d,
      batchId: need(batchIds, batchCode, "batch"),
      ...(cargo ? {
        cargo: {
          packages: cargo.packages, source: cargo.source, confirmedBy: cargo.confirmedBy, confirmedAt: cargo.confirmedAt,
          ...(cargo.receiptCode ? { receiptId: need(receiptIds, cargo.receiptCode, "receipt"), lineKey: cargo.lineKey } : {}),
        },
      } : {}),
      synthetic: true,
    }));
  }

  const quoteIds = new Map<string, Id<"quotes">>();
  for (const { key, dealCode, ...q } of s.quotes) {
    const dealId = need(dealIds, dealCode, "deal");
    quoteIds.set(key, await ctx.db.insert("quotes", { ...q, dealId, dedupeKey: `${dealId}:${q.dealVersion}:seed:${key}` }));
  }

  const holdIds = new Map<string, Id<"reservations">>();
  for (const r of s.reservations) {
    const id = await ctx.db.insert("reservations", {
      skuCode: r.skuCode,
      batchId: need(batchIds, r.batchCode, "batch"),
      qty: r.qty,
      pick: r.pick ?? [],
      status: r.status ?? "active",
      label: r.label,
      createdAt: r.createdAt ?? now - 3 * 86_400_000,
      ...(r.dealCode ? { dealId: need(dealIds, r.dealCode, "deal") } : {}),
    });
    if (r.dealCode) holdIds.set(r.dealCode, id);
  }

  // Proposals, decisions and holds point at quotes and reservations created above.
  for (const d of s.deals) {
    const { proposal, decision } = d;
    if (!proposal && !decision && !holdIds.has(d.code)) continue;
    await ctx.db.patch("deals", need(dealIds, d.code, "deal"), {
      ...(proposal ? { proposal: { version: proposal.version, quoteId: need(quoteIds, proposal.quoteKey, "quote"), submittedBy: proposal.submittedBy, submittedAt: proposal.submittedAt } } : {}),
      ...(decision ? {
        decision: {
          approved: decision.approved, by: decision.by, at: decision.at,
          ...(decision.quoteKey ? { quoteId: need(quoteIds, decision.quoteKey, "quote") } : {}),
          ...(decision.netSen !== undefined ? { netSen: decision.netSen } : {}),
          ...(decision.deliverySen !== undefined ? { deliverySen: decision.deliverySen } : {}),
          ...(decision.reason ? { reason: decision.reason } : {}),
        },
      } : {}),
      ...(holdIds.has(d.code) ? { reservationId: holdIds.get(d.code)! } : {}),
    });
  }

  for (const { batchCode, ...m } of s.movements) {
    await ctx.db.insert("movements", { ...m, ...(batchCode ? { batchId: need(batchIds, batchCode, "batch") } : {}), synthetic: true });
  }
  for (const { dealCode, ...c } of s.collections) await ctx.db.insert("collections", { ...c, dealId: need(dealIds, dealCode, "deal") });

  for (const a of s.audit) {
    const id = a.entity.kind === "deal" ? need(dealIds, a.entity.code, "deal") : a.entity.kind === "receipt" ? need(receiptIds, a.entity.code, "receipt") : a.entity.code;
    await ctx.db.insert("audit", { at: a.at, actor: a.actor, action: a.action, entity: `${a.entity.kind}:${id}`, summary: a.summary, ...(a.reason ? { reason: a.reason } : {}) });
  }

  // The app's next sale continues the seeded D-#### codes.
  await ctx.db.insert("kv", { key: "seq:D", value: String(s.lastDealNo), updatedAt: now });
  await ctx.db.insert("settings", { key: "main", ...s.settings, seededAt: now });
}

/** `bunx convex run seed:run` — wipe and load the synthetic ledger. */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (env.WAREORB_ALLOW_DEMO_SEED !== "true") fail("Demo data is disabled on this deployment");
    await wipe(ctx);
    await load(ctx);
    return null;
  },
});

/** Owner "Reset demo": only while the deployment is in demo mode. */
export const reset = mutation({
  args: { actor },
  handler: async (ctx) => {
    const actor = await getActor(ctx, "owner");
    if (env.WAREORB_ALLOW_DEMO_SEED !== "true") fail("Demo data is disabled on this deployment");
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "main"))
      .unique();
    if (settings && !settings.demoMode) throw new Error("Demo mode is off");
    await wipe(ctx);
    await load(ctx);
    await audit(ctx, actor, "reset", "ledger", "Demo data reset");
    return null;
  },
});

/** Compatibility setup: never creates synthetic business records. */
export const ensure = mutation({
  args: {},
  handler: async (ctx) => {
    await getActor(ctx, "owner");
    const existing = await ctx.db.query("settings").withIndex("by_key", (q) => q.eq("key", "main")).unique();
    if (!existing) await ctx.db.insert("settings", {
      key: "main", ageing: { minAgeDays: 90, windowDays: 30, maxSales: 0 },
      replenish: { windowDays: 30, coverageDays: 21, budgetSen: 2_000_000 },
      lowStockThreshold: 2, demoMode: false, seededAt: Date.now(),
    });
    return null;
  },
});
