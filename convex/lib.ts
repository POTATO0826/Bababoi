import { ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Actor, Role } from "../src/domain/types";

const ROLE_NAME: Record<Role, string> = { owner: "Owner", sales: "Sales", warehouse: "Warehouse" };

/** Simulated roles: the client says who is acting, and every write checks it here. */
export function requireRole(actor: Actor, ...allowed: Role[]) {
  if (!allowed.includes(actor.role)) {
    throw new ConvexError(`${allowed.map((r) => ROLE_NAME[r]).join(" or ")} only`);
  }
}

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
  return s ?? fail("Run the seed first");
}

export async function skuByCode(ctx: QueryCtx, code: string) {
  return await ctx.db
    .query("skus")
    .withIndex("by_code", (q) => q.eq("code", code))
    .unique();
}

export async function activeBatches(ctx: QueryCtx) {
  return await ctx.db
    .query("batches")
    .withIndex("by_status", (q) => q.eq("status", "active"))
    .take(1000);
}

export async function activeReservations(ctx: QueryCtx) {
  return await ctx.db
    .query("reservations")
    .withIndex("by_status", (q) => q.eq("status", "active"))
    .take(1000);
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
