import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { action, env, internalMutation, internalQuery, mutation, query, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Actor, Role } from "../src/domain/types";
import { role } from "./schema";
import { audit, fail } from "./lib";

type DbCtx = QueryCtx | MutationCtx;
type Staff = Doc<"staff">;

const normalEmail = (value: string) => value.trim().toLowerCase();
const profile = (staff: Staff) => ({
  _id: staff._id,
  name: staff.name,
  email: staff.email,
  role: staff.role,
  active: staff.status === "active",
  status: staff.status,
});

/** The only source of business authority: a verified Convex token and active staff row. */
export async function getViewer(ctx: DbCtx): Promise<Staff> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return fail("Sign in required");
  const staff = await ctx.db.query("staff")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!staff || staff.status !== "active") return fail("Staff access is not active");
  return staff;
}

export async function getActor(ctx: DbCtx, ...allowedRoles: Role[]): Promise<Actor> {
  const staff = await getViewer(ctx);
  if (allowedRoles.length && !allowedRoles.includes(staff.role)) return fail(`${allowedRoles.join(" or ")} only`);
  return { role: staff.role, name: staff.name, staffId: staff._id };
}

export async function getActionActor(ctx: ActionCtx, ...allowedRoles: Role[]): Promise<Actor> {
  const actor: Actor = await ctx.runQuery(internal.access.actionViewer, {});
  if (allowedRoles.length && !allowedRoles.includes(actor.role)) return fail(`${allowedRoles.join(" or ")} only`);
  return actor;
}

export const actionViewer = internalQuery({
  args: {},
  handler: async (ctx) => await getActor(ctx),
});

/** Scheduled provider work rechecks the staff who originally authorized it. */
export const providerStaffActive = internalQuery({
  args: { staffId: v.string(), roles: v.array(role) },
  handler: async (ctx, { staffId, roles }) => {
    const id = ctx.db.normalizeId("staff", staffId);
    const staff = id ? await ctx.db.get("staff", id) : null;
    return !!staff && staff.status === "active" && roles.includes(staff.role);
  },
});

/** No business data leaks to signed-out or unprovisioned accounts. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const staff = await ctx.db.query("staff")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    return staff?.status === "active" ? profile(staff) : null;
  },
});

/** Lets a signed-in first owner give the deployment administrator an exact binding key. */
export const bootstrapIdentity = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return {
      tokenIdentifier: identity.tokenIdentifier,
      issuer: identity.issuer,
      subject: identity.subject,
      email: identity.email ?? null,
      emailVerified: identity.emailVerified === true,
    };
  },
});

export const listStaff = query({
  args: {},
  handler: async (ctx) => {
    await getActor(ctx, "owner");
    return (await ctx.db.query("staff").take(500)).map(profile);
  },
});

export const inviteStaff = mutation({
  args: { email: v.string(), name: v.string(), role },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, "owner");
    const email = normalEmail(args.email);
    const name = args.name.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) fail("Valid email required");
    if (!name || name.length > 100) fail("Name must be 1–100 characters");
    const existing = await ctx.db.query("staff").withIndex("by_email", (q) => q.eq("email", email)).unique();
    if (existing) fail("This email already has a staff record");
    const now = Date.now();
    const staffId = await ctx.db.insert("staff", { email, name, role: args.role, status: "invited", invitedAt: now, updatedAt: now });
    await audit(ctx, actor, "invite_staff", `staff:${staffId}`, `${email} invited as ${args.role}`);
    return staffId;
  },
});

export const updateStaff = mutation({
  args: { staffId: v.id("staff"), role: v.optional(role), active: v.optional(v.boolean()), name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, "owner");
    const staff = (await ctx.db.get("staff", args.staffId)) ?? fail("Staff member not found");
    const name = args.name?.trim();
    if (name !== undefined && (!name || name.length > 100)) fail("Name must be 1–100 characters");
    const nextRole = args.role ?? staff.role;
    const nextStatus = args.active === undefined ? staff.status : args.active ? (staff.tokenIdentifier ? "active" : "invited") : "inactive";
    if (staff.role === "owner" && staff.status === "active" && (nextRole !== "owner" || nextStatus !== "active")) {
      const owners = await ctx.db.query("staff")
        .withIndex("by_role_and_status", (q) => q.eq("role", "owner").eq("status", "active"))
        .take(2);
      if (owners.length < 2) fail("Keep at least one active owner");
    }
    await ctx.db.patch("staff", staff._id, {
      role: nextRole,
      status: nextStatus,
      ...(name !== undefined ? { name } : {}),
      updatedAt: Date.now(),
    });
    await audit(ctx, actor, "update_staff", `staff:${staff._id}`, `${staff.email}: ${nextRole}, ${nextStatus}${name !== undefined ? `, ${name}` : ""}`);
    return profile({ ...staff, role: nextRole, status: nextStatus, name: name ?? staff.name });
  },
});

/** Deployment administrator binds the first owner to an exact Clerk token identifier. */
export const bootstrapOwner = internalMutation({
  args: { tokenIdentifier: v.string(), email: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    if ((await ctx.db.query("staff").first()) !== null) fail("Staff has already been provisioned");
    const email = normalEmail(args.email);
    const name = args.name.trim();
    if (!args.tokenIdentifier.trim() || !email || !name) fail("Exact token identifier, email and name required");
    const now = Date.now();
    const staffId = await ctx.db.insert("staff", {
      tokenIdentifier: args.tokenIdentifier.trim(), email, name, role: "owner", status: "active",
      invitedAt: now, activatedAt: now, updatedAt: now,
    });
    const settings = await ctx.db.query("settings").withIndex("by_key", (q) => q.eq("key", "main")).unique();
    if (!settings) await ctx.db.insert("settings", defaultSettings(now));
    await audit(ctx, { role: "owner", name, staffId }, "bootstrap_owner", `staff:${staffId}`, `Initial owner ${email} provisioned by deployment administrator`);
    return staffId;
  },
});

export const ensureBusinessSettings = mutation({
  args: {},
  handler: async (ctx) => {
    await getActor(ctx, "owner");
    const existing = await ctx.db.query("settings").withIndex("by_key", (q) => q.eq("key", "main")).unique();
    if (!existing) await ctx.db.insert("settings", defaultSettings(Date.now()));
    return null;
  },
});

function defaultSettings(now: number) {
  return {
    key: "main", ageing: { minAgeDays: 90, windowDays: 30, maxSales: 0 },
    replenish: { windowDays: 30, coverageDays: 21, budgetSen: 2_000_000 },
    lowStockThreshold: 2, demoMode: false, seededAt: now,
  };
}

/** Clerk's backend response is the proof of email ownership, not a browser or JWT email claim. */
export const activate = action({
  args: {},
  handler: async (ctx): Promise<ReturnType<typeof profile> | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return fail("Sign in required");
    if (!env.CLERK_SECRET_KEY || !env.CLERK_JWT_ISSUER_DOMAIN) return fail("Clerk verification is not configured");
    if (identity.issuer.replace(/\/$/, "") !== env.CLERK_JWT_ISSUER_DOMAIN.replace(/\/$/, "")) return fail("Unexpected identity provider");
    const res = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(identity.subject)}`, {
      headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` },
    });
    if (!res.ok) return fail("Could not verify email with Clerk");
    const body: unknown = await res.json();
    if (!body || typeof body !== "object") return fail("Invalid Clerk response");
    const user = body as { id?: unknown; banned?: unknown; email_addresses?: unknown };
    if (user.id !== identity.subject || user.banned === true || !Array.isArray(user.email_addresses)) return fail("Invalid Clerk user");
    const verifiedEmails = user.email_addresses.flatMap((row: unknown) => {
      if (!row || typeof row !== "object") return [];
      const address = row as { email_address?: unknown; verification?: { status?: unknown } | null };
      return typeof address.email_address === "string" && address.verification?.status === "verified"
        ? [normalEmail(address.email_address)] : [];
    });
    if (!verifiedEmails.length) return fail("Verify your email in Clerk first");
    return await ctx.runMutation(internal.access.bindInvitation, {
      tokenIdentifier: identity.tokenIdentifier,
      verifiedEmails,
    });
  },
});

export const bindInvitation = internalMutation({
  args: { tokenIdentifier: v.string(), verifiedEmails: v.array(v.string()) },
  handler: async (ctx, args) => {
    const bound = await ctx.db.query("staff")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", args.tokenIdentifier)).unique();
    if (bound) return bound.status === "active" ? profile(bound) : null;
    const matches: Staff[] = [];
    for (const email of args.verifiedEmails) {
      const staff = await ctx.db.query("staff").withIndex("by_email", (q) => q.eq("email", normalEmail(email))).unique();
      if (staff?.status === "invited" && !staff.tokenIdentifier) matches.push(staff);
    }
    if (matches.length > 1) return fail("Multiple invitations match this account; ask the owner to resolve them");
    const staff = matches[0];
    if (!staff) return null;
    const now = Date.now();
    await ctx.db.patch("staff", staff._id, { tokenIdentifier: args.tokenIdentifier, status: "active", activatedAt: now, updatedAt: now });
    await audit(ctx, { role: staff.role, name: staff.name, staffId: staff._id }, "activate_staff", `staff:${staff._id}`, `${staff.email} activated`);
    return profile({ ...staff, tokenIdentifier: args.tokenIdentifier, status: "active" });
  },
});
