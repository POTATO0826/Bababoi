import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";
import { activeBatches, activeReservations, fail } from "./lib";
import { getViewer } from "./access";

/** Everything the map and the stage lists need, in one reactive query. `since` is day-bucketed by the client. */
export const snapshot = query({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    await getViewer(ctx);
    if (!Number.isFinite(since) || since < 0) fail("Invalid history start time");
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "main"))
      .unique();
    if (!settings) return null;
    const [skus, batches, reservations, purchaseOrders, movements, receipts, deals] = await Promise.all([
      ctx.db.query("skus").take(501),
      activeBatches(ctx),
      activeReservations(ctx),
      ctx.db
        .query("purchaseOrders")
        .withIndex("by_status", (q) => q.eq("status", "open"))
        .take(501),
      ctx.db
        .query("movements")
        .withIndex("by_at", (q) => q.gte("at", since))
        .order("desc")
        .take(3001),
      (async () => {
        const active = await ctx.db.query("receipts").withIndex("by_status", q => q.eq("status", "needs_review")).take(1001);
        if (active.length > 1000) fail("Too many open receipts; finish or reject outstanding drafts");
        const finished = (await Promise.all((["posted", "rejected"] as const).map(status => ctx.db.query("receipts").withIndex("by_status", q => q.eq("status", status)).order("desc").take(25)))).flat();
        return [...active, ...finished].sort((a, b) => b._creationTime - a._creationTime);
      })(),
      (async () => {
        const open = (await Promise.all((["finding_buyer", "offer_ready", "pending_approval", "approved", "rejected"] as const).map(status => ctx.db.query("deals").withIndex("by_status", q => q.eq("status", status)).take(1001)))).flat();
        if (open.length > 1000) fail("Too many open deals; close completed work before continuing");
        const finished = (await Promise.all((["collected", "closed"] as const).map(status => ctx.db.query("deals").withIndex("by_status", q => q.eq("status", status)).order("desc").take(25)))).flat();
        return [...open, ...finished].sort((a, b) => b._creationTime - a._creationTime);
      })(),
    ]);
    if (skus.length > 500 || purchaseOrders.length > 500 || movements.length > 3000) {
      fail("Warehouse overview limit reached. Add pagination or archive completed records before continuing; partial balances are not shown.");
    }
    return { settings, skus, batches, reservations, purchaseOrders, movements, receipts, deals };
  },
});

export const history = query({
  args: { entity: v.string() },
  handler: async (ctx, { entity }) => {
    await getViewer(ctx);
    return await ctx.db
      .query("audit")
      .withIndex("by_entity_and_at", (q) => q.eq("entity", entity))
      .order("desc")
      .take(20);
  },
});

/** Older business documents load independently from the live stock overview. */
export const receiptHistory = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    await getViewer(ctx);
    return await ctx.db.query("receipts").order("desc").paginate(paginationOpts);
  },
});

export const dealHistory = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    await getViewer(ctx);
    return await ctx.db.query("deals").order("desc").paginate(paginationOpts);
  },
});
