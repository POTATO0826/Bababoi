// Deal = ageing batch → sales hand-off → buyer offer → quotes → owner decision → warehouse collection.
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { actor, loc } from "./schema";
import { audit, fail, nextCode, skuByCode } from "./lib";
import { getActor } from "./access";

export const get = query({
  args: { dealId: v.id("deals") },
  handler: async (ctx, { dealId }) => {
    await getActor(ctx);
    return await ctx.db.get("deals", dealId);
  },
});
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
  return (await availableLocations(ctx, batch, exceptDeal)).reduce((sum, l) => sum + l.qty, 0);
}

async function availableLocations(ctx: MutationCtx, batch: Doc<"batches">, exceptDeal?: Id<"deals">) {
  const holds = await ctx.db.query("reservations").withIndex("by_batchId_and_status", q => q.eq("batchId", batch._id).eq("status", "active")).take(1001);
  if (holds.length > 1000) fail("Too many active allocations; ask the owner to reconcile this batch");
  let free = batch.locations;
  for (const hold of holds) if (hold.dealId !== exceptDeal) free = applyPick(free, hold.pick);
  return free;
}

function editable(deal: Doc<"deals">) {
  if (!["finding_buyer", "offer_ready", "pending_approval", "rejected"].includes(deal.status)) fail("Revise the approved deal before changing its terms");
}

/** A quote that can be submitted or approved: this version, unexpired, real, complete. */
async function usableQuote(ctx: MutationCtx, deal: Doc<"deals">, quoteId: Id<"quotes">) {
  const q = (await ctx.db.get("quotes", quoteId)) ?? fail("Quote not found");
  if (q.dealId !== deal._id) fail("Quote belongs to another deal");
  const st = quoteState(q, deal, Date.now());
  if (st === "stale") fail("Quote is for an older version of this deal");
  if (st === "expired") fail("Quote expired — refresh it");
  if (st !== "current") fail("Quote is not ready");
  if (q.source !== "manual") fail("Sandbox and demo quotes cannot authorize real stock operations");
  if (!q.verifiedAt || !q.reference?.trim() || !q.terms?.trim() || q.note === "Synthetic") fail("Record and verify the carrier's actual reply and terms");
  if (q.currency !== "MYR") fail("Only MYR quotes are supported");
  const c = comparable(q, deal);
  if (c.kind === "incomplete") fail(`Incomplete: confirm ${c.missing.join(", ")}`);
  return { q, cost: c };
}

/** Owner hands an ageing batch to a salesperson. */
export const create = mutation({
  args: { actor, batchId: v.id("batches"), assignee: v.string() },
  handler: async (ctx, { batchId, assignee }) => {
    const actor = await getActor(ctx, "owner");
    const batch = (await ctx.db.get("batches", batchId)) ?? fail("Batch not found");
    if (batch.status !== "active") fail("Batch is empty");
    for (const status of OPEN_DEAL) {
      if (await ctx.db.query("deals").withIndex("by_batchId_and_status", q => q.eq("batchId", batchId).eq("status", status)).first()) fail("Already with sales");
    }
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
      stateVersion: 0,
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
  handler: async (ctx, { dealId, expectedVersion, patch: p }) => {
    const actor = await getActor(ctx, "owner", "sales");
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
    if (p.collectAt != null && (!Number.isFinite(p.collectAt) || p.collectAt <= Date.now())) fail("Choose a future collection time");
    if (p.access && (!Number.isSafeInteger(p.access.floor) || p.access.floor < 0 || p.access.floor > 200)) fail("Invalid delivery floor");
    const next = { ...deal, ...p };
    const keepConfirm =
      p.destination && deal.destination?.confirmedBy && p.destination.lat === deal.destination.lat && p.destination.lng === deal.destination.lng && p.destination.address === deal.destination.address;
    await ctx.db.patch("deals", dealId, { stateVersion: (deal.stateVersion ?? 0) + 1,
      ...p,
      ...(p.destination ? { destination: keepConfirm ? { ...p.destination, confirmedBy: deal.destination!.confirmedBy } : p.destination } : {}),
      fitConfirmedBy: undefined,
      status: next.buyer?.name.trim() ? "offer_ready" : "finding_buyer",
      proposal: undefined,
      decision: undefined,
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
  handler: async (ctx, { dealId, expectedVersion }) => {
    const actor = await getActor(ctx, "owner", "sales");
    const deal = await load(ctx, dealId, expectedVersion);
    editable(deal);
    if (!deal.destination) fail("No destination");
    await ctx.db.patch("deals", dealId, { stateVersion: (deal.stateVersion ?? 0) + 1, destination: { ...deal.destination, confirmedBy: actor.name }, updatedAt: Date.now() });
    await audit(ctx, actor, "confirm_location", `deal:${dealId}`, deal.destination.label);
    return null;
  },
});

export const confirmFit = mutation({
  args: { actor, dealId: v.id("deals"), expectedVersion: v.number() },
  handler: async (ctx, { dealId, expectedVersion }) => {
    const actor = await getActor(ctx, "owner", "sales", "warehouse");
    const deal = await load(ctx, dealId, expectedVersion);
    editable(deal);
    await ctx.db.patch("deals", dealId, { stateVersion: (deal.stateVersion ?? 0) + 1, fitConfirmedBy: actor.name, updatedAt: Date.now() });
    await audit(ctx, actor, "confirm_fit", `deal:${dealId}`, "Vehicle fit checked");
    return null;
  },
});

/** Sales sends the deal with one quote to the owner. */
export const submit = mutation({
  args: { actor, dealId: v.id("deals"), expectedVersion: v.number(), quoteId: v.id("quotes") },
  handler: async (ctx, { dealId, expectedVersion, quoteId }) => {
    const actor = await getActor(ctx, "owner", "sales");
    const deal = await load(ctx, dealId, expectedVersion);
    if (!["offer_ready", "rejected"].includes(deal.status)) fail("Deal is not ready to submit");
    const missing = missingFields(deal);
    if (missing.length) fail(`Missing: ${missing.join(", ")}`);
    if (!deal.fitConfirmedBy) fail("Confirm cargo and vehicle fit before submission");
    if (deal.collectAt! <= Date.now()) fail("Collection time has passed");
    await usableQuote(ctx, deal, quoteId);
    await ctx.db.patch("deals", dealId, { stateVersion: (deal.stateVersion ?? 0) + 1,
      status: "pending_approval",
      proposal: { version: deal.version, quoteId, submittedBy: actor, submittedAt: Date.now() },
      decision: undefined,
      updatedAt: Date.now(),
    });
    await audit(ctx, actor, "submit", `deal:${dealId}`, `v${deal.version} for approval`);
    return null;
  },
});

/** Approval reserves a specific bay allocation. Carrier booking is recorded separately. */
export const decide = mutation({
  args: {
    actor,
    dealId: v.id("deals"),
    expectedVersion: v.number(),
    quoteId: v.id("quotes"),
    approve: v.boolean(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { dealId, expectedVersion, quoteId, approve, reason }) => {
    const actor = await getActor(ctx, "owner");
    const deal = await load(ctx, dealId, expectedVersion);
    if (deal.status !== "pending_approval" || !deal.proposal) fail("Nothing to decide");
    if (deal.proposal.version !== deal.version) fail("Proposal is out of date");
    const now = Date.now();
    const why = reason?.trim();

    if (!approve) {
      if (!why) fail("Give a reason");
      await ctx.db.patch("deals", dealId, { stateVersion: (deal.stateVersion ?? 0) + 1,
        status: "rejected",
        decision: { approved: false, by: actor, at: now, reason: why },
        updatedAt: now,
      });
      await audit(ctx, actor, "reject", `deal:${dealId}`, "Rejected", why);
      return null;
    }

    if (missingFields(deal).length || !deal.fitConfirmedBy || (deal.collectAt ?? 0) <= now) fail("Delivery details need reconfirmation");
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
      pick = planPick(await availableLocations(ctx, batch), deal.qty);
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
    await ctx.db.patch("deals", dealId, { stateVersion: (deal.stateVersion ?? 0) + 1,
      status: "approved",
      reservationId,
      booking: undefined,
      decision: { approved: true, quoteId, netSen: net, deliverySen: cost.kind === "complete" ? cost.sen : 0, quoteReference: q.reference, terms: q.terms, by: actor, at: now, ...(why ? { reason: why } : {}) },
      updatedAt: now,
    });
    await audit(ctx, actor, "approve", `deal:${dealId}`, `Reserved ${deal.qty} · awaiting real carrier reference`, why);
    return null;
  },
});

/** Record an arrangement already confirmed with the carrier; this never places an order. */
export const recordBooking = mutation({
  args: { actor, dealId: v.id("deals"), expectedVersion: v.number(), expectedStateVersion: v.number(), reference: v.string(), confirmed: v.boolean() },
  handler: async (ctx, { dealId, expectedVersion, expectedStateVersion, reference, confirmed }) => {
    const actor = await getActor(ctx, "owner", "sales");
    const deal = await load(ctx, dealId, expectedVersion);
    if ((deal.stateVersion ?? 0) !== expectedStateVersion) fail("Sale workflow changed — review it again before recording a carrier");
    if (deal.status !== "approved" || !deal.decision?.quoteId) fail("Approve the sale first");
    if (!confirmed || !reference.trim() || reference.length > 200) fail("Confirm the carrier arrangement and enter its reference");
    if (deal.booking && !deal.booking.simulated) {
      if (deal.booking.ref === reference.trim()) return null;
      fail("Revise the deal before changing a confirmed carrier arrangement");
    }
    const { q } = await usableQuote(ctx, deal, deal.decision.quoteId);
    await ctx.db.patch("deals", dealId, { stateVersion: (deal.stateVersion ?? 0) + 1, booking: { ref: reference.trim(), carrier: q.carrier, simulated: false, recordedBy: actor, recordedAt: Date.now() }, updatedAt: Date.now() });
    await audit(ctx, actor, "carrier_confirmed", `deal:${dealId}`, `${q.carrier} · ${reference.trim()}`);
    return null;
  },
});

/** Re-open approval only before dispatch; released holds and old quotes cannot be reused. */
export const revise = mutation({
  args: { actor, dealId: v.id("deals"), expectedVersion: v.number(), expectedStateVersion: v.number(), reason: v.string() },
  handler: async (ctx, { dealId, expectedVersion, expectedStateVersion, reason }) => {
    const actor = await getActor(ctx, "owner", "sales");
    const deal = await load(ctx, dealId, expectedVersion);
    if ((deal.stateVersion ?? 0) !== expectedStateVersion) fail("Sale workflow changed — review it again before revising");
    if (deal.status !== "approved" || (deal.collectedQty ?? 0) > 0) fail("Only an undelivered approved deal can be revised; close the remaining order after partial collection");
    if (!reason.trim()) fail("Give a revision reason and confirm any carrier cancellation outside WareOrb");
    if (deal.reservationId) {
      const reservation = await ctx.db.get("reservations", deal.reservationId);
      if (reservation?.status === "active") await ctx.db.patch("reservations", reservation._id, { status: "released" });
    }
    await ctx.db.patch("deals", dealId, { stateVersion: (deal.stateVersion ?? 0) + 1, status: "offer_ready", proposal: undefined, decision: undefined, booking: undefined, reservationId: undefined, fitConfirmedBy: undefined, version: deal.version + 1, updatedAt: Date.now() });
    await audit(ctx, actor, "revise", `deal:${dealId}`, "Released allocation; new quote and approval required", reason.trim());
    return null;
  },
});

/** Warehouse records counted bay quantities. Partial collections retain only the remaining hold. */
export const confirmCollection = mutation({
  args: { actor, dealId: v.id("deals"), expectedVersion: v.number(), requestId: v.string(), lines: v.array(loc), collectedAt: v.number(), confirmed: v.boolean() },
  handler: async (ctx, { dealId, expectedVersion, requestId, lines, collectedAt, confirmed }) => {
    const actor = await getActor(ctx, "owner", "warehouse");
    const deal = await load(ctx, dealId);
    if (!requestId.trim() || requestId.length > 100) fail("A collection request ID is required");
    const payload = JSON.stringify({ lines: [...lines].sort((a, b) => a.slot.localeCompare(b.slot)), collectedAt, confirmed });
    const prior = await ctx.db.query("collections").withIndex("by_dealId_and_requestId", q => q.eq("dealId", dealId).eq("requestId", requestId)).unique();
    if (prior) {
      if (prior.payload !== payload) fail("This request ID already recorded a different collection");
      return { qty: prior.qty, repeated: true };
    }
    if (deal.version !== expectedVersion) fail("This deal changed — refresh and try again");
    if (deal.status !== "approved" || !deal.reservationId) fail("Not awaiting collection");
    if (!deal.booking || deal.booking.simulated) fail("Record the actual carrier arrangement first");
    if (!confirmed || !lines.length) fail("Confirm the actual quantities that left the warehouse");
    if (!Number.isFinite(collectedAt) || collectedAt > Date.now() || collectedAt < (deal.decision?.at ?? deal.createdAt)) fail("Collection time must be after approval and no later than now");
    const res = (await ctx.db.get("reservations", deal.reservationId)) ?? fail("Reservation missing");
    if (res.status !== "active") fail("Reservation is not active");
    const batch = (await ctx.db.get("batches", res.batchId)) ?? fail("Batch not found");
    let locations;
    try {
      applyPick(res.pick, lines);
      locations = applyPick(batch.locations, lines);
    } catch (e) {
      throw new ConvexError(e instanceof Error ? e.message : "Bay counts changed");
    }
    const now = Date.now();
    const qty = lines.reduce((sum, line) => sum + line.qty, 0);
    const remaining = applyPick(res.pick, lines);
    await ctx.db.insert("collections", { dealId, requestId, payload, qty, at: collectedAt, lines, actor });
    await ctx.db.patch("batches", batch._id, { locations, status: locations.length ? "active" : "depleted" });
    await ctx.db.insert("movements", {
      at: collectedAt,
      skuCode: deal.skuCode,
      batchId: batch._id,
      kind: "dispatch",
      reason: "sale",
      qty,
      lines,
      ref: deal.code,
      actor,
      synthetic: false,
    });
    await ctx.db.patch("reservations", res._id, { status: remaining.length ? "active" : "consumed", qty: res.qty - qty, pick: remaining });
    await ctx.db.patch("deals", dealId, { stateVersion: (deal.stateVersion ?? 0) + 1, status: remaining.length ? "approved" : "collected", collectedQty: (deal.collectedQty ?? 0) + qty, collectedAt, version: deal.version + 1, updatedAt: now });
    await audit(ctx, actor, "collect", `deal:${dealId}`, `${qty} out · ${lines.map((p) => `${slotCode(p.slot)} ×${p.qty}`).join(", ")}`);
    return { qty, repeated: false };
  },
});

/** Close a deal (no buyer, buyer cancelled). Releases any reservation. */
export const close = mutation({
  args: { actor, dealId: v.id("deals"), expectedVersion: v.number(), expectedStateVersion: v.number(), reason: v.string() },
  handler: async (ctx, { dealId, expectedVersion, expectedStateVersion, reason }) => {
    const actor = await getActor(ctx, "owner", "sales");
    const deal = await load(ctx, dealId, expectedVersion);
    if ((deal.stateVersion ?? 0) !== expectedStateVersion) fail("Sale workflow changed — review it again before closing");
    if (deal.status === "collected" || deal.status === "closed") fail("Already finished");
    if (!reason.trim()) fail("Give a reason");
    if (deal.reservationId) {
      const res = await ctx.db.get("reservations", deal.reservationId);
      if (res?.status === "active") await ctx.db.patch("reservations", res._id, { status: "released" });
    }
    await ctx.db.patch("deals", dealId, { stateVersion: (deal.stateVersion ?? 0) + 1, status: "closed", version: deal.version + 1, updatedAt: Date.now() });
    await audit(ctx, actor, "close", `deal:${dealId}`, "Closed", reason.trim());
    return null;
  },
});
