import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { actor } from "./schema";
import { audit, fail, nextCode, requireRole, skuByCode } from "./lib";

/** Owner turns a suggestion into a purchase order; it shows as incoming until received. */
export const createPO = mutation({
  args: { actor, skuCode: v.string(), qty: v.number(), rationale: v.string() },
  handler: async (ctx, { actor, skuCode, qty, rationale }) => {
    requireRole(actor, "owner");
    if (!Number.isInteger(qty) || qty <= 0 || qty > 500) fail("Quantity must be 1–500");
    if (!(await skuByCode(ctx, skuCode))) fail("Unknown SKU");
    const code = await nextCode(ctx, "PO", 3101);
    await ctx.db.insert("purchaseOrders", {
      code,
      skuCode,
      qty,
      qtyReceived: 0,
      status: "open",
      rationale: rationale.slice(0, 500),
      createdBy: actor,
      createdAt: Date.now(),
    });
    await audit(ctx, actor, "po", `sku:${skuCode}`, `${code} · ${qty} units`);
    return code;
  },
});
