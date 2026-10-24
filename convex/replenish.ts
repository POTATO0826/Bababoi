import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { actor } from "./schema";
import { activeBatches, audit, fail, getSettings, nextCode, skuByCode } from "./lib";
import { getActor } from "./access";
import { freeSlotSet } from "../src/domain/stock";

/** Owner turns a suggestion into a purchase order; it shows as incoming until received. */
export const createPO = mutation({
  args: { actor, skuCode: v.string(), qty: v.number(), rationale: v.string(), supplier: v.string(), orderRef: v.string(), confirmedAt: v.number(), unitCostSen: v.number(), confirmed: v.boolean() },
  handler: async (ctx, { skuCode, qty, rationale, supplier, orderRef, confirmedAt, unitCostSen, confirmed }) => {
    const actor = await getActor(ctx, "owner");
    if (!Number.isInteger(qty) || qty <= 0 || qty > 500) fail("Quantity must be 1–500");
    const sku = (await skuByCode(ctx, skuCode)) ?? fail("Unknown SKU");
    if (!confirmed || !supplier.trim() || !orderRef.trim() || supplier.length > 200 || orderRef.length > 200) fail("Record the supplier and confirmed external purchase reference");
    if (!Number.isSafeInteger(unitCostSen) || unitCostSen <= 0) fail("Enter the actual purchase unit cost in whole sen");
    if (!Number.isFinite(confirmedAt) || confirmedAt <= 0 || confirmedAt > Date.now()) fail("Invalid order confirmation time");
    const orderKey = `${supplier.trim().toLowerCase()}:${orderRef.trim().toLowerCase()}:${skuCode}`;
    const prior = await ctx.db.query("purchaseOrders").withIndex("by_orderKey", q => q.eq("orderKey", orderKey)).unique();
    if (prior) {
      if (prior.qty !== qty || prior.unitCostSen !== unitCostSen || prior.confirmedAt !== confirmedAt) fail("This purchase reference already records different details");
      return prior.code;
    }
    const open = await ctx.db.query("purchaseOrders").withIndex("by_status", q => q.eq("status", "open")).take(501);
    if (open.length > 500) fail("Open purchase limit reached");
    const settings = await getSettings(ctx);
    let committed = 0;
    let plannedBays = 0;
    for (const po of open) {
      const item = await skuByCode(ctx, po.skuCode);
      const cost = po.unitCostSen ?? item?.price.unitCostSen;
      if (!item || !cost) fail("Record costs for existing open purchases first");
      committed += (po.qty - po.qtyReceived) * cost;
      plannedBays += Math.ceil((po.qty - po.qtyReceived) / item.cap);
    }
    if (committed + qty * unitCostSen > settings.replenish.budgetSen) fail("Purchase exceeds the configured remaining order budget");
    if (plannedBays + Math.ceil(qty / sku.cap) > freeSlotSet(await activeBatches(ctx)).size) fail("Insufficient planned receiving space for open purchases");
    const code = await nextCode(ctx, "PO", 3101);
    await ctx.db.insert("purchaseOrders", {
      code,
      skuCode,
      qty,
      qtyReceived: 0,
      status: "open",
      rationale: rationale.slice(0, 500),
      supplier: supplier.trim(), orderRef: orderRef.trim(), orderKey, confirmedAt, unitCostSen,
      createdBy: actor,
      createdAt: Date.now(),
    });
    await audit(ctx, actor, "po", `sku:${skuCode}`, `${code} · ${qty} units · ${supplier.trim()}/${orderRef.trim()}`);
    return code;
  },
});
