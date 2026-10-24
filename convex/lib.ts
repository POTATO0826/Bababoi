import { ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Actor, Role } from "../src/domain/types";

export function fail(message: string): never {
  throw new ConvexError(message);
}

export async function audit(ctx: MutationCtx, actor: Actor, action: string, entity: string, summary: string, reason?: string) {
  await ctx.db.insert("audit", { at: Date.now(), actor, action, entity, summary, ...(reason ? { reason } : {}) });
}

export async function getSettings(ctx: QueryCtx): Promise<Doc<"settings">> {
  const s = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", "main"))
    .unique();
  return s ?? fail("Ask the owner to complete business setup");
}

export async function skuByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("skus")
    .withIndex("by_code", (q) => q.eq("code", code))
    .unique();
}

export async function activeBatches(ctx: QueryCtx) {
  const rows = await ctx.db
    .query("batches")
    .withIndex("by_status", (q) => q.eq("status", "active"))
    .take(1001);
  if (rows.length > 1000) fail("Active batch limit reached; archive or paginate inventory before continuing");
  return rows;
}

export async function activeReservations(ctx: QueryCtx) {
  const rows = await ctx.db
    .query("reservations")
    .withIndex("by_status", (q) => q.eq("status", "active"))
    .take(1001);
  if (rows.length > 1000) fail("Active reservation limit reached; reconcile allocations before continuing");
  return rows;
}

/** Short sequential-looking codes ("D-1042"). */
export async function nextCode(ctx: MutationCtx, prefix: string, start: number) {
  const key = `seq:${prefix}`;
  const row = await ctx.db
    .query("kv")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  const n = row ? Number(row.value) + 1 : start;
  if (row) await ctx.db.patch("kv", row._id, { value: String(n), updatedAt: Date.now() });
  else await ctx.db.insert("kv", { key, value: String(n), updatedAt: Date.now() });
  return `${prefix}-${n}`;
}
