import { v } from "convex/values";
import { query } from "./_generated/server";
import { activeBatches, activeReservations } from "./lib";

/** Everything the map and the stage lists need, in one reactive query. `since` is day-bucketed by the client. */
export const snapshot = query({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "main"))
      .unique();
    if (!settings) return null;
    const [skus, batches, reservations, purchaseOrders, movements, receipts, deals] = await Promise.all([
      ctx.db.query("skus").take(500),
      activeBatches(ctx),
      activeReservations(ctx),
      ctx.db
        .query("purchaseOrders")
        .withIndex("by_status", (q) => q.eq("status", "open"))
        .take(500),
      ctx.db
        .query("movements")
        .withIndex("by_at", (q) => q.gte("at", since))
        .order("desc")
        .take(3000),
      ctx.db.query("receipts").order("desc").take(50),
      ctx.db.query("deals").order("desc").take(200),
    ]);
    return { settings, skus, batches, reservations, purchaseOrders, movements, receipts, deals };
  },
});

export const history = query({
  args: { entity: v.string() },
  handler: async (ctx, { entity }) =>
    await ctx.db
      .query("audit")
      .withIndex("by_entity_and_at", (q) => q.eq("entity", entity))
      .order("desc")
      .take(20),
});
