// Read helpers and write-backs for the Claude actions in ai.ts (which run in the Node runtime).
import { v } from "convex/values";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { activeBatches, activeReservations, fail } from "./lib";
import { flagBatches } from "../src/domain/ageing";
import { missingFields, OPEN_DEAL } from "../src/domain/deal";
import { slotCode } from "../src/domain/stock";
import { DAY } from "../src/domain/types";

async function openDeals(ctx: QueryCtx) {
  const rows = (await Promise.all(OPEN_DEAL.map(status => ctx.db.query("deals").withIndex("by_status", q => q.eq("status", status)).take(1001)))).flat();
  if (rows.length > 1000) fail("Too many open deals; close completed work first");
  return rows;
}

export const skuForIcon = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, { code }) =>
    await ctx.db
      .query("skus")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique(),
});

export const setIcon = internalMutation({
  args: { code: v.string(), svg: v.optional(v.string()), status: v.union(v.literal("ready"), v.literal("failed"), v.literal("unavailable")) },
  handler: async (ctx, { code, svg, status }) => {
    const sku = await ctx.db
      .query("skus")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (sku) await ctx.db.patch("skus", sku._id, { iconStatus: status, ...(svg ? { icon: svg } : {}) });
    return null;
  },
});

/** Stock lookup for Jarvis: best word matches with counts and bays. */
export const searchStock = internalQuery({
  args: { query: v.string() },
  handler: async (ctx, { query }) => {
    const words = query.toLowerCase().split(/[\s,·-]+/).filter((w) => w.length > 1);
    const skus = await ctx.db.query("skus").take(501);
    if (skus.length > 500) fail("Catalogue needs pagination before stock search can continue");
    const batches = await activeBatches(ctx);
    const res = await activeReservations(ctx);
    const scored = skus
      .map((s) => {
        const hay = `${s.code} ${s.model} ${s.variant} ${s.category}`.toLowerCase();
        return { s, score: words.filter((w) => hay.includes(w)).length };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return scored.map(({ s }) => {
      const mine = batches.filter((b) => b.skuCode === s.code);
      const onHand = mine.reduce((a, b) => a + b.locations.reduce((x, l) => x + l.qty, 0), 0);
      const reserved = res.filter((r) => r.skuCode === s.code).reduce((a, r) => a + r.qty, 0);
      return {
        sku_code: s.code,
        name: `${s.model} · ${s.variant}`,
        on_hand: onHand,
        available: onHand - reserved,
        bays: mine.flatMap((b) => b.locations.map((l) => slotCode(l.slot))),
      };
    });
  },
});

/** Ageing batches that need attention (same rule as the Ageing panel). */
export const attention = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "main"))
      .unique();
    if (!settings) return [];
    const [batches, reservations, movements, skus, deals] = await Promise.all([
      activeBatches(ctx),
      activeReservations(ctx),
      ctx.db
        .query("movements")
        .withIndex("by_at", (q) => q.gte("at", now - 95 * DAY))
        .take(3001),
      ctx.db.query("skus").take(501),
      openDeals(ctx),
    ]);
    if (movements.length > 3000 || skus.length > 500) fail("History or catalogue needs pagination before ageing analysis can continue");
    const historyFrom = settings.demoMode ? movements.reduce((start, m) => Math.min(start, m.at), settings.seededAt) : settings.seededAt;
    const flags = flagBatches({ batches, reservations, movements, rule: settings.ageing, now, historyFrom });
    return flags
      .filter((f) => f.flagged)
      .slice(0, 6)
      .map((f) => {
        const sku = skus.find((s) => s.code === f.batch.skuCode);
        const deal = deals.find((d) => d.batchId === f.batch._id && !["collected", "closed"].includes(d.status));
        return {
          batch: f.batch.code,
          sku_code: f.batch.skuCode,
          name: sku ? `${sku.model} · ${sku.variant}` : f.batch.skuCode,
          age_days: f.ageDays,
          units: f.qty,
          bays: f.bays,
          deal: deal ? `${deal.code} (${deal.status})` : null,
        };
      });
  },
});

/** What is waiting for a role right now. */
export const work = internalQuery({
  args: { role: v.union(v.literal("owner"), v.literal("sales"), v.literal("warehouse")) },
  handler: async (ctx, { role }) => {
    const deals = await openDeals(ctx);
    const receipts = await ctx.db
      .query("receipts")
      .withIndex("by_status", (q) => q.eq("status", "needs_review"))
      .take(1001);
    if (receipts.length > 1000) fail("Too many open receipts; finish outstanding reviews first");
    const turn: Record<string, string[]> = {
      owner: ["pending_approval"],
      sales: ["finding_buyer", "offer_ready", "rejected"],
      warehouse: ["approved"],
    };
    return {
      deals: deals.filter((d) => turn[role]!.includes(d.status)).map((d) => ({ deal: d.code, sku_code: d.skuCode, status: d.status, buyer: d.buyer?.name ?? null })),
      receipts_to_verify: role === "warehouse" || role === "owner" ? receipts.map((r) => r.docRef ?? r.code) : [],
    };
  },
});

/** A deal by its code ("D-1001") or by words of the model name; newest open match first. */
export const dealByRef = internalQuery({
  args: { ref: v.string() },
  handler: async (ctx, { ref }) => {
    const deals = (await openDeals(ctx)).sort((a, b) => b._creationTime - a._creationTime);
    const skus = await ctx.db.query("skus").take(500);
    const r = ref.toLowerCase();
    const open = (d: (typeof deals)[number]) => !["collected", "closed"].includes(d.status);
    const byCode = deals.find((d) => d.code.toLowerCase() === r.replace(/\s/g, ""));
    const byWords =
      byCode ??
      deals
        .filter(open)
        .find((d) => {
          const s = skus.find((x) => x.code === d.skuCode);
          const hay = `${d.code} ${d.skuCode} ${s?.model} ${s?.variant} ${d.buyer?.name ?? ""}`.toLowerCase();
          return r.split(/\s+/).some((w) => w.length > 2 && hay.includes(w));
        });
    if (!byWords) return null;
    const d = byWords;
    const sku = skus.find((x) => x.code === d.skuCode);
    const quotes = await ctx.db
      .query("quotes")
      .withIndex("by_dealId", (q) => q.eq("dealId", d._id))
      .order("desc")
      .take(20);
    return {
      id: d._id,
      batchId: d.batchId,
      code: d.code,
      version: d.version,
      sku_code: d.skuCode,
      name: sku ? `${sku.model} · ${sku.variant}` : d.skuCode,
      packages: sku?.packages ?? [],
      status: d.status,
      buyer: d.buyer?.name ?? null,
      qty: d.qty,
      price_rm: d.priceSen / 100,
      destination: d.destination?.label ?? null,
      missing: missingFields(d),
      quotes: quotes
        .filter((q) => q.dealVersion === d.version)
        .map((q) => ({
          carrier: q.carrier,
          vehicle: q.service,
          source: q.note === "Synthetic" ? "synthetic carrier reply" : q.source,
          status: q.status,
          total_rm: q.totalSen != null ? q.totalSen / 100 : null,
          expires_at_utc: q.expiresAt ? new Date(q.expiresAt).toISOString() : null,
          unloading: q.unloading,
          error: q.error?.message ?? null,
        })),
    };
  },
});
