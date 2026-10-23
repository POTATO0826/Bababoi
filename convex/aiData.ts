// Read helpers and write-backs for the Claude actions in ai.ts (which run in the Node runtime).
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { activeBatches, activeReservations } from "./lib";
import { flagBatches } from "../src/domain/ageing";
import { missingFields } from "../src/domain/deal";
import { slotCode } from "../src/domain/stock";
import { DAY } from "../src/domain/types";

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
    const skus = await ctx.db.query("skus").take(500);
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
        .take(3000),
      ctx.db.query("skus").take(500),
      ctx.db.query("deals").take(200),
    ]);
    const flags = flagBatches({ batches, reservations, movements, rule: settings.ageing, now, historyFrom: settings.seededAt - 90 * DAY });
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
    const deals = await ctx.db.query("deals").take(200);
    const receipts = await ctx.db
      .query("receipts")
      .withIndex("by_status", (q) => q.eq("status", "needs_review"))
      .take(20);
    const turn: Record<string, string[]> = {
      owner: ["pending_approval"],
      sales: ["finding_buyer", "offer_ready", "rejected"],
      warehouse: ["approved"],
    };
    return {
      deals: deals.filter((d) => turn[role]!.includes(d.status)).map((d) => ({ deal: d.code, sku_code: d.skuCode, status: d.status, buyer: d.buyer?.name ?? null })),
      receipts_to_verify: role === "warehouse" ? receipts.map((r) => r.docRef ?? r.code) : [],
    };
  },
});

/** A deal by its code ("D-1001") or by words of the model name; newest open match first. */
export const dealByRef = internalQuery({
  args: { ref: v.string() },
  handler: async (ctx, { ref }) => {
    const deals = await ctx.db.query("deals").order("desc").take(200);
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
        }) ??
      deals.find(open);
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
          expires_in_s: q.expiresAt ? Math.round((q.expiresAt - Date.now()) / 1000) : null,
          unloading: q.unloading,
          error: q.error?.message ?? null,
        })),
    };
  },
});
