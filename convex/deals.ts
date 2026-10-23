// Deal = ageing batch → sales hand-off → buyer offer → quotes → owner decision → warehouse collection.
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { actor } from "./schema";
import { activeReservations, audit, fail, nextCode, requireRole, skuByCode } from "./lib";
import { comparable, netRecovery, quoteState } from "../src/domain/costs";
import { missingFields, OPEN_DEAL } from "../src/domain/deal";
import { inMalaysia } from "../src/domain/places";
import { applyPick, batchQty, planPick, slotCode } from "../src/domain/stock";
import { DAY } from "../src/domain/types";

async function load(ctx: MutationCtx, dealId: Id<"deals">, expectedVersion?: number) {
  const deal = (await ctx.db.get("deals", dealId)) ?? fail("Deal not found");
  if (expectedVersion != null && deal.version !== expectedVersion) fail("This deal changed — refresh and try again");
  return deal;
}

async function unreservedIn(ctx: MutationCtx, batch: Doc<"batches">, exceptDeal?: Id<"deals">) {
  const held = (await activeReservations(ctx))
    .filter((r) => r.batchId === batch._id && r.dealId !== exceptDeal)
    .reduce((a, r) => a + r.qty, 0);
  return batchQty(batch) - held;
}

/** A quote that can be submitted or approved: this version, unexpired, real, complete. */
async function usableQuote(ctx: MutationCtx, deal: Doc<"deals">, quoteId: Id<"quotes">) {
  const q = (await ctx.db.get("quotes", quoteId)) ?? fail("Quote not found");
  if (q.dealId !== deal._id) fail("Quote belongs to another deal");
  const st = quoteState(q, deal, Date.now());
  if (st === "stale") fail("Quote is for an older version of this deal");
  if (st === "expired") fail("Quote expired — refresh it");
  if (st !== "current") fail("Quote is not ready");
  if (q.source === "demo_fallback") fail("Saved demo quotes can't be used");
  const c = comparable(q, deal);
  if (c.kind === "incomplete") fail(`Incomplete: confirm ${c.missing.join(", ")}`);
  return { q, cost: c };
}

/** Owner hands an ageing batch to a salesperson. */
export const create = mutation({
  args: { actor, batchId: v.id("batches"), assignee: v.string() },
  handler: async (ctx, { actor, batchId, assignee }) => {
    requireRole(actor, "owner");
    const batch = (await ctx.db.get("batches", batchId)) ?? fail("Batch not found");
    if (batch.status !== "active") fail("Batch is empty");
    const open = await ctx.db
      .query("deals")
      .withIndex("by_batchId", (q) => q.eq("batchId", batchId))
      .take(20);
    if (open.some((d) => (OPEN_DEAL as readonly string[]).includes(d.status))) fail("Already with sales");
    const sku = (await skuByCode(ctx, batch.skuCode)) ?? fail("SKU not found");
    const qty = await unreservedIn(ctx, batch);
    if (qty <= 0) fail("Nothing unreserved in this batch");
    const now = Date.now();
    const code = await nextCode(ctx, "D", 1001);
    const id = await ctx.db.insert("deals", {
      code,
      batchId,
      skuCode: batch.skuCode,
      assignee: assignee.trim() || "Sales",
      status: "finding_buyer",
      brief: {
        ageDays: Math.floor((now - batch.receivedAt) / DAY),
        qty,
        bays: batch.locations.map((l) => slotCode(l.slot)),
        guideSen: sku.price.clearanceSen,
      },
      qty,
      priceSen: sku.price.clearanceSen * qty,
      access: { floor: 0, lift: true },
      unloading: "requested",
      freightPayer: "merchant",
      packingSen: 0,
      version: 1,
      createdBy: actor,
      createdAt: now,
      updatedAt: now,
    });
    await audit(ctx, actor, "handoff", `deal:${id}`, `${batch.code} → ${assignee}`);
    return id;
  },
});

const patch = v.object({
  buyer: v.optional(v.object({ name: v.string(), phone: v.optional(v.string()) })),
  qty: v.optional(v.number()),
  priceSen: v.optional(v.number()),
  destination: v.optional(v.object({ label: v.string(), address: v.string(), lat: v.number(), lng: v.number() })),
  access: v.optional(v.object({ floor: v.number(), lift: v.boolean() })),
  collectAt: v.optional(v.number()),
  unloading: v.optional(v.union(v.literal("requested"), v.literal("not_needed"))),
  freightPayer: v.optional(v.union(v.literal("merchant"), v.literal("buyer"))),
  packingSen: v.optional(v.number()),
});

/** Sales records or edits the buyer's request. Every edit is a new version; older quotes go stale. */
export const update = mutation({
  args: { actor, dealId: v.id("deals"), expectedVersion: v.number(), patch },
  handler: async (ctx, { actor, dealId, expectedVersion, patch: p }) => {
    requireRole(actor, "sales");
    const deal = await load(ctx, dealId, expectedVersion);
    if (!["finding_buyer", "offer_ready", "pending_approval", "rejected"].includes(deal.status)) fail("Deal is locked");
    const batch = (await ctx.db.get("batches", deal.batchId)) ?? fail("Batch not found");
    if (p.qty != null) {
      if (!Number.isInteger(p.qty) || p.qty <= 0) fail("Quantity must be a whole number");
      const free = await unreservedIn(ctx, batch, dealId);
      if (p.qty > free) fail(`Only ${free} unreserved in this batch`);
    }
    if (p.priceSen != null && (p.priceSen < 0 || !Number.isInteger(p.priceSen))) fail("Invalid price");
    if (p.packingSen != null && (p.packingSen < 0 || !Number.isInteger(p.packingSen))) fail("Invalid packing cost");
    if (p.destination && !inMalaysia(p.destination.lat, p.destination.lng)) fail("Coordinates are outside Malaysia");
    const next = { ...deal, ...p };
    const keepConfirm =
      p.destination && deal.destination?.confirmedBy && p.destination.lat === deal.destination.lat && p.destination.lng === deal.destination.lng;
    await ctx.db.patch("deals", dealId, {
      ...p,
      ...(p.destination ? { destination: keepConfirm ? { ...p.destination, confirmedBy: deal.destination!.confirmedBy } : p.destination } : {}),
      ...(p.qty != null && p.qty !== deal.qty ? { fitConfirmedBy: undefined } : {}),
      status: next.buyer?.name.trim() ? "offer_ready" : "finding_buyer",
      proposal: undefined,
      version: deal.version + 1,
      updatedAt: Date.now(),
    });
    await audit(ctx, actor, "edit", `deal:${dealId}`, `v${deal.version + 1}`);
    return deal.version + 1;
  },
});

/** Sales confirms the destination pin with the buyer (coordinates are never guessed). */
export const confirmDestination = mutation({
  args: { actor, dealId: v.id("deals"), expectedVersion: v.number() },
  handler: async (ctx, { actor, dealId, expectedVersion }) => {
    requireRole(actor, "sales");
    const deal = await load(ctx, dealId, expectedVersion);
    if (!deal.destination) fail("No destination");
    await ctx.db.patch("deals", dealId, { destination: { ...deal.destination, confirmedBy: actor.name }, updatedAt: Date.now() });
    await audit(ctx, actor, "confirm_location", `deal:${dealId}`, deal.destination.label);
    return null;
  },
});

export const confirmFit = mutation({
  args: { actor, dealId: v.id("deals"), expectedVersion: v.number() },
  handler: async (ctx, { actor, dealId, expectedVersion }) => {
    requireRole(actor, "sales", "warehouse");
    await load(ctx, dealId, expectedVersion);
    await ctx.db.patch("deals", dealId, { fitConfirmedBy: actor.name, updatedAt: Date.now() });
    await audit(ctx, actor, "confirm_fit", `deal:${dealId}`, "Vehicle fit checked");
    return null;
  },
});

/** Sales sends the deal with one quote to the owner. */
export const submit = mutation({
  args: { actor, dealId: v.id("deals"), expectedVersion: v.number(), quoteId: v.id("quotes") },
  handler: async (ctx, { actor, dealId, expectedVersion, quoteId }) => {
    requireRole(actor, "sales");
    const deal = await load(ctx, dealId, expectedVersion);
    if (!["offer_ready", "rejected"].includes(deal.status)) fail("Deal is not ready to submit");
    const missing = missingFields(deal);
    if (missing.length) fail(`Missing: ${missing.join(", ")}`);
    await usableQuote(ctx, deal, quoteId);
    await ctx.db.patch("deals", dealId, {
      status: "pending_approval",
      proposal: { version: deal.version, quoteId, submittedBy: actor, submittedAt: Date.now() },
      decision: undefined,
      updatedAt: Date.now(),
    });
    await audit(ctx, actor, "submit", `deal:${dealId}`, `v${deal.version} for approval`);
    return null;
  },
});

/** Owner approves (reserves stock, simulated booking) or rejects with a reason. Stock does not move here. */
export const decide = mutation({
  args: {
    actor,
    dealId: v.id("deals"),
    expectedVersion: v.number(),
    quoteId: v.id("quotes"),
    approve: v.boolean(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { actor, dealId, expectedVersion, quoteId, approve, reason }) => {
    requireRole(actor, "owner");
    const deal = await load(ctx, dealId, expectedVersion);
    if (deal.status !== "pending_approval" || !deal.proposal) fail("Nothing to decide");
    if (deal.proposal.version !== deal.version) fail("Proposal is out of date");
    const now = Date.now();
    const why = reason?.trim();

    if (!approve) {
      if (!why) fail("Give a reason");
      await ctx.db.patch("deals", dealId, {
        status: "rejected",
        decision: { approved: false, by: actor, at: now, reason: why },
        updatedAt: now,
      });
      await audit(ctx, actor, "reject", `deal:${dealId}`, "Rejected", why);
      return null;
    }

    const { q, cost } = await usableQuote(ctx, deal, quoteId);
    if (quoteId !== deal.proposal.quoteId) {
      const proposed = await ctx.db.get("quotes", deal.proposal.quoteId);
      const refresh = proposed && proposed.source === q.source && proposed.service === q.service && proposed.carrier === q.carrier;
      if (!refresh && !why) fail("Choosing a different quote needs a reason");
    }
    const batch = (await ctx.db.get("batches", deal.batchId)) ?? fail("Batch not found");
    if ((await unreservedIn(ctx, batch)) < deal.qty) fail("Not enough unreserved stock");
    let pick;
    try {
      pick = planPick(batch.locations, deal.qty);
    } catch (e) {
      throw new ConvexError(e instanceof Error ? e.message : "Cannot plan pick");
    }
    const reservationId = await ctx.db.insert("reservations", {
      skuCode: deal.skuCode,
      batchId: batch._id,
      qty: deal.qty,
      pick,
      status: "active",
      dealId,
      label: deal.code,
      createdAt: now,
    });
    const net = netRecovery(deal, cost).netSen;
    const ref = await nextCode(ctx, "SIM", 7001);
    await ctx.db.patch("deals", dealId, {
      status: "approved",
      reservationId,
      booking: { ref, carrier: q.carrier, simulated: true },
      decision: { approved: true, quoteId, netSen: net, by: actor, at: now, ...(why ? { reason: why } : {}) },
      updatedAt: now,
    });
    await audit(ctx, actor, "approve", `deal:${dealId}`, `Reserved ${deal.qty} · ${ref}`, why);
    return null;
  },
});

/** Warehouse confirms the goods physically left. Only now does stock fall and bays free up. */
export const confirmCollection = mutation({
  args: { actor, dealId: v.id("deals") },
  handler: async (ctx, { actor, dealId }) => {
    requireRole(actor, "warehouse");
    const deal = await load(ctx, dealId);
    if (deal.status !== "approved" || !deal.reservationId) fail("Not awaiting collection");
    const res = (await ctx.db.get("reservations", deal.reservationId)) ?? fail("Reservation missing");
    if (res.status !== "active") fail("Reservation is not active");
    const batch = (await ctx.db.get("batches", res.batchId)) ?? fail("Batch not found");
    let locations;
    try {
      locations = applyPick(batch.locations, res.pick);
    } catch (e) {
      throw new ConvexError(e instanceof Error ? e.message : "Bay counts changed");
    }
    const now = Date.now();
    await ctx.db.patch("batches", batch._id, { locations, status: locations.length ? "active" : "depleted" });
    await ctx.db.insert("movements", {
      at: now,
      skuCode: deal.skuCode,
      batchId: batch._id,
      kind: "dispatch",
      reason: "sale",
      qty: res.qty,
      lines: res.pick,
      ref: deal.code,
      actor,
      synthetic: false,
    });
    await ctx.db.patch("reservations", res._id, { status: "consumed" });
    await ctx.db.patch("deals", dealId, { status: "collected", collectedAt: now, updatedAt: now });
    await audit(ctx, actor, "collect", `deal:${dealId}`, `${res.qty} out · ${res.pick.map((p) => slotCode(p.slot)).join(", ")}`);
    return null;
  },
});

/** Close a deal (no buyer, buyer cancelled). Releases any reservation. */
export const close = mutation({
  args: { actor, dealId: v.id("deals"), reason: v.string() },
  handler: async (ctx, { actor, dealId, reason }) => {
    requireRole(actor, "owner", "sales");
    const deal = await load(ctx, dealId);
    if (deal.status === "collected" || deal.status === "closed") fail("Already finished");
    if (!reason.trim()) fail("Give a reason");
    if (deal.reservationId) {
      const res = await ctx.db.get("reservations", deal.reservationId);
      if (res?.status === "active") await ctx.db.patch("reservations", res._id, { status: "released" });
    }
    await ctx.db.patch("deals", dealId, { status: "closed", updatedAt: Date.now() });
    await audit(ctx, actor, "close", `deal:${dealId}`, "Closed", reason.trim());
    return null;
  },
});
