// Delivery quotes for a deal: Lalamove sandbox (scheduled action), manual carrier replies, demo replies.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { actor, extraStatus } from "./schema";
import { audit, fail, getSettings } from "./lib";
import { getActor, getViewer } from "./access";
import { limiter } from "./limits";
import { missingFields } from "../src/domain/deal";
import { WAREHOUSE } from "../src/domain/places";

const HOUR = 3_600_000;
const QUOTABLE = ["offer_ready", "pending_approval", "rejected"];

async function quotableDeal(ctx: MutationCtx, dealId: Id<"deals">, expectedVersion: number) {
  const deal = (await ctx.db.get("deals", dealId)) ?? fail("Deal not found");
  if (deal.version !== expectedVersion) fail("This deal changed — refresh and try again");
  if (!QUOTABLE.includes(deal.status)) fail("Deal is not open for quotes");
  const missing = missingFields(deal);
  if (missing.length) fail(`Missing: ${missing.join(", ")}`);
  return deal;
}

const initialUnloading = (deal: Doc<"deals">) => (deal.unloading === "requested" ? "unknown" : "included") as "unknown" | "included";

export const forDeal = query({
  args: { dealId: v.id("deals") },
  handler: async (ctx, { dealId }) => {
    await getViewer(ctx);
    return await ctx.db
      .query("quotes")
      .withIndex("by_dealId", (q) => q.eq("dealId", dealId))
      .order("desc")
      .take(40);
  },
});

/** Request Lalamove quotations. Unchanged, unexpired quotes are reused and repeat clicks are ignored. */
export const request = mutation({
  args: {
    actor,
    dealId: v.id("deals"),
    expectedVersion: v.number(),
    services: v.array(v.object({ key: v.string(), specialRequests: v.array(v.string()) })),
  },
  handler: async (ctx, { dealId, expectedVersion, services }) => {
    const actor = await getActor(ctx, "owner", "sales");
    const deal = await quotableDeal(ctx, dealId, expectedVersion);
    if (!deal.cargo) fail("Confirm the shipment measurements (packages, sizes and weights) before requesting quotes");
    if (!services.length || services.length > 4) fail("Pick 1–4 vehicles");
    if (new Set(services.map((s) => s.key)).size !== services.length || services.some((s) => !/^[A-Z0-9_]{2,40}$/.test(s.key) || s.specialRequests.length > 10)) fail("Choose valid vehicle types");
    const now = Date.now();
    const out = { requested: 0, reused: 0, inFlight: 0 };
    for (const s of services) {
      const dedupeKey = `${dealId}:${deal.version}:${s.key}:${[...s.specialRequests].sort().join("+")}`;
      const prior = await ctx.db
        .query("quotes")
        .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", dedupeKey))
        .order("desc")
        .take(5);
      const live = prior.find((q) => q.source === "lalamove_sandbox");
      if (live?.status === "pending") {
        out.inFlight++;
        continue;
      }
      if (live?.status === "ok" && (live.expiresAt ?? 0) > now + 30_000) {
        out.reused++;
        continue;
      }
      const quoteId = await ctx.db.insert("quotes", {
        dealId,
        dealVersion: deal.version,
        source: "lalamove_sandbox",
        carrier: "Lalamove",
        service: s.key,
        status: "pending",
        dedupeKey,
        requestedAt: now,
        requestedBy: actor,
        unloading: initialUnloading(deal),
        ...(s.specialRequests.length ? { note: s.specialRequests.join(", ") } : {}),
      });
      await ctx.scheduler.runAfter(0, internal.lalamove.fetchQuote, { quoteId, specialRequests: s.specialRequests });
      out.requested++;
    }
    if (out.requested) await audit(ctx, actor, "quote", `deal:${dealId}`, `${out.requested} Lalamove request(s)`);
    return out;
  },
});

/** A carrier's reply entered by staff (phone/WhatsApp quote). */
export const addManual = mutation({
  args: {
    actor,
    dealId: v.id("deals"),
    expectedVersion: v.number(),
    carrier: v.string(),
    service: v.string(),
    totalSen: v.number(),
    unloading: extraStatus,
    unloadingSen: v.optional(v.number()),
    validHours: v.number(),
    reference: v.string(),
    terms: v.string(),
    confirmed: v.boolean(),
  },
  handler: async (ctx, a) => {
    const actor = await getActor(ctx, "owner", "sales");
    const deal = await quotableDeal(ctx, a.dealId, a.expectedVersion);
    if (!a.carrier.trim()) fail("Carrier name");
    if (!Number.isSafeInteger(a.totalSen) || a.totalSen <= 0) fail("Total must be positive whole sen");
    if (!Number.isFinite(a.validHours) || a.validHours <= 0 || a.validHours > 720) fail("Quote validity must be between 0 and 720 hours");
    if (!a.service.trim() || !a.confirmed || !a.reference.trim() || !a.terms.trim()) fail("Confirm the actual carrier reply, vehicle, reference and full terms");
    if (a.carrier.length > 200 || a.reference.length > 500 || a.terms.length > 2000) fail("Carrier details are too long");
    if (a.unloadingSen != null && (!Number.isSafeInteger(a.unloadingSen) || a.unloadingSen < 0)) fail("Invalid unloading cost");
    if (a.unloading === "excluded" && a.unloadingSen == null) fail("Enter the confirmed unloading charge");
    if (a.unloading === "included" && a.unloadingSen != null) fail("Unloading is already in the total");
    const now = Date.now();
    await ctx.db.insert("quotes", {
      dealId: a.dealId,
      dealVersion: deal.version,
      source: "manual",
      carrier: a.carrier.trim(),
      service: a.service.trim() || "—",
      status: "ok",
      dedupeKey: `${a.dealId}:${deal.version}:manual:${now}`,
      requestedAt: now,
      expiresAt: now + Math.max(0.1, a.validHours) * HOUR,
      currency: "MYR",
      totalSen: Math.round(a.totalSen),
      unloading: a.unloading,
      ...(a.unloading === "excluded" && a.unloadingSen != null ? { unloadingSen: Math.round(a.unloadingSen) } : {}),
      enteredBy: actor,
      reference: a.reference.trim(),
      terms: a.terms.trim(),
      verifiedAt: now,
    });
    await audit(ctx, actor, "quote", `deal:${a.dealId}`, `${a.carrier.trim()} quote added`);
    return null;
  },
});

/** Demo only: the three synthetic carrier replies from AdvancedWareorb.md §8. */
export const addDemoReplies = mutation({
  args: { actor, dealId: v.id("deals"), expectedVersion: v.number() },
  handler: async (ctx, { dealId, expectedVersion }) => {
    const actor = await getActor(ctx, "owner", "sales");
    if (!(await getSettings(ctx)).demoMode) fail("Demo mode is off");
    const deal = await quotableDeal(ctx, dealId, expectedVersion);
    const now = Date.now();
    const replies = [
      { carrier: "Carrier A", service: "Lorry 10ft", totalSen: 28_000, unloading: "included" as const, expiresAt: now + 24 * HOUR },
      { carrier: "Carrier B", service: "Van", totalSen: 22_000, unloading: "unknown" as const, expiresAt: now + 24 * HOUR },
      { carrier: "Carrier C", service: "Lorry 14ft", totalSen: 30_000, unloading: "included" as const, expiresAt: now - HOUR },
    ];
    for (const r of replies) {
      await ctx.db.insert("quotes", {
        dealId,
        dealVersion: deal.version,
        source: "manual",
        status: "ok",
        dedupeKey: `${dealId}:${deal.version}:demo:${r.carrier}`,
        requestedAt: now,
        currency: "MYR",
        note: "Synthetic",
        enteredBy: actor,
        ...r,
      });
    }
    await audit(ctx, actor, "quote", `deal:${dealId}`, "3 synthetic carrier replies");
    return null;
  },
});

/** Record whether unloading is inside a quote, or its confirmed extra charge. */
export const setUnloading = mutation({
  args: { actor, quoteId: v.id("quotes"), expectedVersion: v.number(), unloading: extraStatus, unloadingSen: v.optional(v.number()) },
  handler: async (ctx, { quoteId, expectedVersion, unloading, unloadingSen }) => {
    const actor = await getActor(ctx, "owner", "sales");
    const q = (await ctx.db.get("quotes", quoteId)) ?? fail("Quote not found");
    const deal = await quotableDeal(ctx, q.dealId, expectedVersion);
    if (q.dealVersion !== deal.version || (q.expiresAt ?? 0) <= Date.now()) fail("Quote is stale or expired");
    if (unloadingSen != null && (!Number.isSafeInteger(unloadingSen) || unloadingSen < 0)) fail("Invalid unloading charge");
    if (unloading === "included" && unloadingSen != null) fail("Unloading is already in the total");
    if (unloading === "excluded" && !(unloadingSen != null && unloadingSen >= 0)) fail("Enter the unloading charge");
    await ctx.db.patch("quotes", quoteId, {
      unloading,
      unloadingSen: unloading === "excluded" ? Math.round(unloadingSen!) : undefined,
      dealVersion: deal.version + 1,
    });
    await ctx.db.patch("deals", deal._id, { stateVersion: (deal.stateVersion ?? 0) + 1, version: deal.version + 1, status: "offer_ready", proposal: undefined, decision: undefined, updatedAt: Date.now() });
    await audit(ctx, actor, "quote_extra", `deal:${q.dealId}`, `Unloading ${unloading}`);
    return null;
  },
});

// ── Internal: used by the Lalamove action ──────────────────────────────────

export const forFetch = internalQuery({
  args: { quoteId: v.id("quotes") },
  handler: async (ctx, { quoteId }) => {
    const quote = await ctx.db.get("quotes", quoteId);
    if (!quote || quote.status !== "pending") return null;
    const deal = await ctx.db.get("deals", quote.dealId);
    if (!deal?.destination || deal.version !== quote.dealVersion || !QUOTABLE.includes(deal.status)) return null;
    const staffId = quote.requestedBy?.staffId ? ctx.db.normalizeId("staff", quote.requestedBy.staffId) : null;
    const staff = staffId ? await ctx.db.get("staff", staffId) : null;
    if (!staff || staff.status !== "active" || !["owner", "sales"].includes(staff.role)) return null;
    return {
      service: quote.service,
      qty: deal.qty,
      cargo: deal.cargo?.packages ?? null,
      collectAt: deal.collectAt,
      stops: [
        { lat: WAREHOUSE.lat, lng: WAREHOUSE.lng, address: WAREHOUSE.address },
        { lat: deal.destination.lat, lng: deal.destination.lng, address: deal.destination.address },
      ],
    };
  },
});

export const takeSlot = internalMutation({
  args: { name: v.union(v.literal("lalamoveQuote"), v.literal("lalamoveCities"), v.literal("fish"), v.literal("claude")) },
  handler: async (ctx, { name }) => {
    const r = await limiter.limit(ctx, name);
    return { ok: r.ok, retryAfter: r.ok ? 0 : r.retryAfter };
  },
});

/** Demo prices per vehicle class — only ever stored as `demo_fallback`, never ranked or approved. */
const DEMO_SEN: Record<string, number> = { MOTORCYCLE: 1_500, CAR: 3_800, VAN: 9_500 };

export const save = internalMutation({
  args: {
    quoteId: v.id("quotes"),
    ok: v.optional(
      v.object({ quotationId: v.string(), expiresAt: v.optional(v.number()), currency: v.optional(v.string()), totalSen: v.number(), breakdownRaw: v.string() }),
    ),
    error: v.optional(v.object({ kind: v.string(), message: v.string(), retryAfterMs: v.optional(v.number()) })),
    fallback: v.optional(v.boolean()),
  },
  handler: async (ctx, { quoteId, ok, error, fallback }) => {
    const q = await ctx.db.get("quotes", quoteId);
    if (!q || q.status !== "pending") return null;
    if (ok) {
      await ctx.db.patch("quotes", quoteId, { status: "ok", ...ok });
      return null;
    }
    await ctx.db.patch("quotes", quoteId, { status: "error", error: error ?? { kind: "unavailable", message: "Failed" } });
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_key", (x) => x.eq("key", "main"))
      .unique();
    if (fallback && settings?.demoMode) {
      const now = Date.now();
      await ctx.db.insert("quotes", {
        dealId: q.dealId,
        dealVersion: q.dealVersion,
        source: "demo_fallback",
        carrier: "Lalamove",
        service: q.service,
        status: "ok",
        dedupeKey: `${q.dedupeKey}:demo:${now}`,
        requestedAt: now,
        expiresAt: now + 5 * 60_000,
        currency: "MYR",
        totalSen: DEMO_SEN[q.service] ?? 16_000,
        unloading: q.unloading,
        note: "Saved demo",
      });
    }
    return null;
  },
});

export const kvGet = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) =>
    await ctx.db
      .query("kv")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique(),
});

export const kvSet = internalMutation({
  args: { key: v.string(), value: v.string() },
  handler: async (ctx, { key, value }) => {
    const row = await ctx.db
      .query("kv")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (row) await ctx.db.patch("kv", row._id, { value, updatedAt: Date.now() });
    else await ctx.db.insert("kv", { key, value, updatedAt: Date.now() });
    return null;
  },
});
