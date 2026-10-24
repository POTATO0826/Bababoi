// Jarvis's delivery tools (local demo). They read the same deal and quote records the Delivery screen shows,
// apply the same completeness and vehicle-fit rules, and request sandbox quotes through the same Convex
// mutation as the "Get sandbox quotes" button. Quote requests are the only external operation; nothing here
// books, approves, dispatches, posts stock or calls arbitrary URLs.
import { Type } from "@earendil-works/pi-ai";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { comparable, quoteState } from "../domain/costs";
import { missingFields } from "../domain/deal";
import { breakdownLines } from "../domain/lalamove";
import { WAREHOUSE } from "../domain/places";
import { cargoSummary, CARGO_SOURCE_LABEL, planCargo, serviceFits, type ConfirmedCargo, type MeasuredLine } from "../domain/shipment";
import type { LalamoveStatus, ServicesResult } from "./lalamove";
import type { Snapshot } from "./warehouse-tools";

type Deal = Snapshot["deals"][number];
export interface QuoteRecord {
  _id: string;
  dealVersion: number;
  source: "lalamove_sandbox" | "manual" | "demo_fallback";
  carrier: string;
  service: string;
  status: "pending" | "ok" | "error";
  requestedAt: number;
  expiresAt?: number;
  currency?: string;
  totalSen?: number;
  breakdownRaw?: string;
  unloading: "included" | "excluded" | "unknown";
  unloadingSen?: number;
  note?: string;
  error?: { kind: string; message: string };
}

/** What the tools may do, all as the signed-in presenter through the app's own authorised functions. */
export interface DeliveryBackend {
  snapshot(): Promise<Snapshot | null>;
  quotes(dealId: string): Promise<QuoteRecord[]>;
  receipt(receiptId: string): Promise<{ id: string; lines: MeasuredLine[] } | null>;
  requestQuotes(dealId: string, expectedVersion: number, services: { key: string; specialRequests: string[] }[]): Promise<{ requested: number; reused: number; inFlight: number }>;
  lalamove: { status(): LalamoveStatus; services(): Promise<ServicesResult> };
}

const DELIVERY_STATES = ["finding_buyer", "offer_ready", "pending_approval", "rejected"];
const SOURCE_LABEL: Record<QuoteRecord["source"], string> = { lalamove_sandbox: "Lalamove sandbox", manual: "Carrier reply", demo_fallback: "Saved demo (not a live price)" };
const iso = (t: number | undefined) => (t ? new Date(t).toISOString() : null);

function findDeal(s: Snapshot, ref: string): { deal: Deal } | { error: string; candidates?: string[] } {
  const r = ref.trim().toLowerCase();
  const open = s.deals.filter((d) => DELIVERY_STATES.includes(d.status));
  const byCode = s.deals.find((d) => d.code.toLowerCase() === r.replace(/\s/g, ""));
  if (byCode) return { deal: byCode };
  const words = r.split(/\s+/).filter((w) => w.length > 2);
  const hits = open.filter((d) => {
    const sku = s.skus.find((k) => k.code === d.skuCode);
    const hay = `${d.code} ${d.skuCode} ${sku?.model ?? ""} ${sku?.variant ?? ""} ${d.buyer?.name ?? ""}`.toLowerCase();
    return words.length > 0 && words.every((w) => hay.includes(w));
  });
  if (hits.length === 1) return { deal: hits[0]! };
  if (hits.length > 1) return { error: "Several deals match; ask which one.", candidates: hits.map((d) => d.code) };
  return { error: `No open deal matches "${ref}".`, candidates: open.map((d) => d.code).slice(0, 10) };
}

export function quoteView(q: QuoteRecord, deal: Pick<Deal, "version" | "unloading" | "priceSen" | "packingSen" | "freightPayer">, now: number) {
  const state = quoteState(q, deal, now);
  const c = q.status === "ok" ? comparable(q, deal) : null;
  return {
    source: SOURCE_LABEL[q.source], carrier: q.carrier, vehicle: q.service, state,
    totalRM: q.totalSen != null ? q.totalSen / 100 : null, currency: q.currency ?? null,
    breakdown: breakdownLines(q.breakdownRaw).map((b) => ({ item: b.name, rm: b.sen / 100 })),
    requestedAt: iso(q.requestedAt), expiresAt: iso(q.expiresAt), noExpiryReturned: q.status === "ok" && q.expiresAt == null,
    unloading: q.unloading, unloadingRM: q.unloadingSen != null ? q.unloadingSen / 100 : null,
    comparableRM: c?.kind === "complete" ? c.sen / 100 : null, unresolved: c?.kind === "incomplete" ? c.missing : [],
    error: q.error?.message ?? null,
  };
}

/** Everything the Delivery screen shows for one deal, as data. */
export async function deliveryBrief(b: DeliveryBackend, s: Snapshot, deal: Deal, now: number) {
  const sku = s.skus.find((k) => k.code === deal.skuCode);
  const batch = s.batches.find((x) => x._id === deal.batchId);
  const receipt = batch?.receiptId ? await b.receipt(batch.receiptId) : null;
  const plan = planCargo({ qty: deal.qty, skuCode: deal.skuCode, cargo: (deal.cargo as ConfirmedCargo | undefined) ?? null, catalogue: sku?.packages ?? [], receipt });
  const status = b.lalamove.status();
  const services = status.connected ? await b.lalamove.services() : null;
  const fits = services && services.source !== "none" ? serviceFits(plan, services.services) : [];
  const quotes = (await b.quotes(deal._id)).filter((q) => q.dealVersion === deal.version);
  const missing = missingFields(deal);
  if (plan.status !== "confirmed") missing.push("Confirmed shipment measurements");
  return {
    deal: deal.code, status: deal.status, item: sku ? `${sku.model} · ${sku.variant}` : deal.skuCode, sku: deal.skuCode,
    stock: { batch: batch?.code ?? null, quantity: deal.qty },
    buyer: deal.buyer?.name ?? null, priceRM: deal.priceSen / 100,
    pickup: { place: WAREHOUSE.label, address: WAREHOUSE.address, lat: WAREHOUSE.lat, lng: WAREHOUSE.lng },
    destination: deal.destination ? { place: deal.destination.label, address: deal.destination.address, lat: deal.destination.lat, lng: deal.destination.lng, confirmedWithBuyer: !!deal.destination.confirmedBy } : null,
    collectionTime: iso(deal.collectAt), access: deal.access, unloading: deal.unloading,
    cargo: plan.status === "confirmed" || plan.status === "suggested"
      ? { status: plan.status, source: CARGO_SOURCE_LABEL[plan.source], packagesPerUnit: plan.perUnit, ...cargoSummary(plan.pieces), note: plan.note }
      : { status: plan.status, note: plan.note, ...(plan.status === "ambiguous" ? { receiptLines: plan.candidates.map((c) => ({ line: c.rawText, usable: !!c.perUnit, reason: c.reason })) } : {}) },
    missing,
    lalamove: status.connected
      ? { connected: true, environment: "sandbox", market: status.market, vehiclesFrom: services?.source ?? "none", ...(services && services.source !== "none" ? { vehiclesFetchedAt: iso(services.fetchedAt) } : { error: services && "error" in services ? services.error : null }) }
      : { connected: false, reason: status.reason },
    vehicles: fits.map((f) => ({ key: f.service.key, label: f.service.label, fit: f.status, reason: f.reason, eligibleForQuote: f.eligible, maxKg: f.service.loadKg, cargoSpaceCm: [f.service.lengthCm, f.service.widthCm, f.service.heightCm] })),
    quotes: quotes.map((q) => quoteView(q, deal, now)),
    note: "Vehicle fit is a size/weight estimate; staff confirm physical loading. Quotes are Lalamove sandbox prices for review, not bookings.",
  };
}

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }], details: value });

export function deliveryTools(b: DeliveryBackend, now: () => number = Date.now, wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): ToolDefinition[] {
  const withDeal = async <T,>(ref: string | undefined, f: (s: Snapshot, d: Deal) => Promise<T>) => {
    const s = await b.snapshot();
    if (!s) return text({ error: "The warehouse has not been set up yet." });
    if (!ref?.trim()) return text({ error: "Which deal? Give its code (e.g. D-1001) or the item." });
    const found = findDeal(s, ref);
    return "deal" in found ? text(await f(s, found.deal)) : text(found);
  };
  return [
    {
      name: "list_delivery_deals", label: "Delivery deals",
      description: "Open deals that may need delivery quotes, with what each still needs (buyer, price, confirmed destination, collection time, access, confirmed shipment measurements).",
      parameters: Type.Object({}),
      execute: async () => {
        const s = await b.snapshot();
        if (!s) return text({ error: "The warehouse has not been set up yet." });
        const deals = s.deals.filter((d) => DELIVERY_STATES.includes(d.status)).map((d) => {
          const sku = s.skus.find((k) => k.code === d.skuCode);
          return { deal: d.code, status: d.status, item: sku ? `${sku.model} · ${sku.variant}` : d.skuCode, quantity: d.qty, missing: [...missingFields(d), ...(d.cargo ? [] : ["Confirmed shipment measurements"])] };
        });
        return text({ deals, lalamove: b.lalamove.status().connected ? "connected (sandbox, MY)" : "not connected", note: deals.length ? undefined : "No open deals. A sale starts from a stock batch (Deals → Start sale from stock)." });
      },
    },
    {
      name: "get_delivery", label: "Delivery brief",
      description: "One deal's shipment: stock and quantity, packages with sizes/weights and where they came from, pickup and destination with coordinates, collection time, what is missing, Lalamove connection, vehicle fit per service, and current quotes.",
      parameters: Type.Object({ deal: Type.String({ description: "Deal code like D-1001, or item/buyer words" }) }),
      execute: async (_id, p) => withDeal((p as { deal: string }).deal, async (s, d) => await deliveryBrief(b, s, d, now())),
    },
    {
      name: "get_delivery_quotes", label: "Delivery quotes",
      description: "The stored quotes for a deal's current version: source, vehicle, amount, currency, breakdown, request and expiry times, unresolved extras, errors.",
      parameters: Type.Object({ deal: Type.String() }),
      execute: async (_id, p) => withDeal((p as { deal: string }).deal, async (_s, d) => ({
        deal: d.code, version: d.version,
        quotes: (await b.quotes(d._id)).filter((q) => q.dealVersion === d.version).map((q) => quoteView(q, d, now())),
      })),
    },
    {
      name: "request_delivery_quotes", label: "Request sandbox quotes",
      description: "Request Lalamove SANDBOX quotations (prices only, never a booking) for 1–4 eligible vehicle types of a complete deal, then return the stored results. Refuses incomplete shipments; ask the user for missing details instead.",
      parameters: Type.Object({ deal: Type.String(), services: Type.Array(Type.String({ description: "Vehicle key from get_delivery, e.g. VAN" }), { minItems: 1, maxItems: 4 }) }),
      execute: async (_id, p) => withDeal((p as { deal: string }).deal, async (s, d) => {
        const keys = [...new Set((p as { services: string[] }).services ?? [])];
        const brief = await deliveryBrief(b, s, d, now());
        if (!["offer_ready", "pending_approval", "rejected"].includes(d.status)) return { refused: true, reason: `Deal ${d.code} is ${d.status}; quotes need buyer details first.`, missing: brief.missing };
        if (brief.missing.length) return { refused: true, reason: "The shipment is incomplete; ask the user for these details.", missing: brief.missing };
        if (!brief.lalamove.connected) return { refused: true, reason: "Lalamove isn't connected. Ask the user to connect the sandbox in Delivery." };
        const bad = keys.filter((k) => !brief.vehicles.some((v) => v.key === k && v.eligibleForQuote));
        if (!keys.length || bad.length) return { refused: true, reason: `Not eligible for this cargo or not offered: ${bad.join(", ") || "none chosen"}.`, vehicles: brief.vehicles };
        const result = await b.requestQuotes(d._id, d.version, keys.map((key) => ({ key, specialRequests: [] })));
        // The quote request runs in the background; wait briefly for Lalamove's answer.
        let quotes = (await b.quotes(d._id)).filter((q) => q.dealVersion === d.version && keys.includes(q.service));
        for (let i = 0; i < 20 && quotes.some((q) => q.status === "pending"); i++) {
          await wait(1000);
          quotes = (await b.quotes(d._id)).filter((q) => q.dealVersion === d.version && keys.includes(q.service));
        }
        return { deal: d.code, version: d.version, ...result, quotes: quotes.map((q) => quoteView(q, d, now())), note: "Sandbox prices for review only. Nothing was booked." };
      }),
    },
  ];
}
