import type { Id, TableNames } from "./_generated/dataModel";
import { env, internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { actor } from "./schema";
import { audit, fail } from "./lib";
import { getActor } from "./access";
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
  "settings",
  "kv",
];

async function wipe(ctx: MutationCtx) {
  for (const t of TABLES) {
    for await (const doc of ctx.db.query(t)) await ctx.db.delete(t, doc._id);
  }
}

async function load(ctx: MutationCtx) {
  const now = Date.now();
  const s = buildSeed(now);
  for (const sku of s.skus) await ctx.db.insert("skus", sku);
  const batchIds = new Map<string, Id<"batches">>();
  for (const b of s.batches) {
    batchIds.set(b.code, await ctx.db.insert("batches", { ...b, status: "active", synthetic: true }));
  }
  for (const r of s.reservations) {
    await ctx.db.insert("reservations", {
      skuCode: r.skuCode,
      batchId: batchIds.get(r.batchCode)!,
      qty: r.qty,
      pick: [],
      status: "active",
      label: r.label,
      createdAt: now - 3 * 86_400_000,
    });
  }
  for (const p of s.purchaseOrders) {
    await ctx.db.insert("purchaseOrders", {
      ...p,
      qtyReceived: 0,
      status: "open",
      createdBy: { role: "owner", name: "Seed" },
    });
  }
  for (const m of s.movements) {
    const { batchCode, ...rest } = m;
    await ctx.db.insert("movements", { ...rest, ...(batchCode ? { batchId: batchIds.get(batchCode) } : {}), synthetic: true });
  }
  for (const r of s.receipts) {
    await ctx.db.insert("receipts", {
      code: r.code,
      status: "needs_review",
      supplier: r.supplier,
      docRef: r.docRef,
      evidence: [{ kind: "note", text: r.note, at: now - 2 * 3_600_000 }],
      lines: r.lines.map((l, i) => ({
        key: `l${i}`,
        rawText: l.rawText,
        skuCode: l.skuCode,
        candidates: [l.skuCode],
        qty: l.qty,
        condition: "good",
        confidence: l.confidence,
        questions: [],
        verified: false,
        source: "seed" as const,
      })),
      extraction: { status: "done", at: now - 2 * 3_600_000 },
      createdBy: { role: "warehouse", name: "Seed" },
      createdAt: now - 2 * 3_600_000,
      synthetic: true,
    });
  }
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
