// Read-only warehouse tools for the local agent. Each call reads the live ledger through the same
// authorised Convex query the UI uses, and reuses the UI's domain rules. None of them can change data.
import type { FunctionReturnType } from "convex/server";
import { Type } from "@earendil-works/pi-ai";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { api } from "../../convex/_generated/api";
import { SLOT_BY_ID } from "../data/layout";
import { netSalesBySku } from "../domain/ageing";
import { historyStart, replenishmentPlan } from "../domain/replenish";
import { batchQty, freeSlotSet, slotCode } from "../domain/stock";
import { DAY } from "../domain/types";

export type Snapshot = NonNullable<FunctionReturnType<typeof api.ledger.snapshot>>;

const rm = (sen: number | null | undefined) => (typeof sen === "number" && sen > 0 ? Math.round(sen) / 100 : null);
const match = (needle: string | undefined, ...hay: string[]) => !needle || hay.some((h) => h.toLowerCase().includes(needle.trim().toLowerCase()));

export function inventoryView(s: Snapshot, p: { sku?: string; search?: string }) {
  const threshold = s.settings.lowStockThreshold;
  const items = s.skus.filter((k) => match(p.sku, k.code) && match(p.search, k.code, k.model, k.variant, k.category)).map((k) => {
    const batches = s.batches.filter((b) => b.skuCode === k.code);
    const onHand = batches.reduce((a, b) => a + batchQty(b), 0);
    const reserved = s.reservations.filter((r) => r.skuCode === k.code).reduce((a, r) => a + r.qty, 0);
    const incoming = s.purchaseOrders.filter((o) => o.skuCode === k.code).reduce((a, o) => a + o.qty - o.qtyReceived, 0);
    return {
      sku: k.code, item: `${k.model} · ${k.variant}`, category: k.category,
      onHand, reserved, available: onHand - reserved, incoming,
      bays: batches.flatMap((b) => b.locations.filter((l) => l.qty > 0).map((l) => `${slotCode(l.slot)}×${l.qty}`)),
      unitsPerBay: k.cap, unitCostRM: rm(k.price.unitCostSen), listPriceRM: rm(k.price.listSen),
      lowStock: onHand - reserved <= threshold, synthetic: k.synthetic === true,
    };
  });
  const free = freeSlotSet(s.batches).size;
  return {
    items,
    warehouse: { totalBays: SLOT_BY_ID.size, occupiedBays: SLOT_BY_ID.size - free, freeBays: free, lowStockThreshold: threshold },
    note: "Units are counted stock from posted receipts minus confirmed dispatches. Available = on hand − reserved for approved deals. Incoming = open confirmed purchase orders not yet received. Unit cost null means unknown.",
  };
}

export function movementsView(s: Snapshot, p: { sku?: string; days?: number; kind?: "receive" | "dispatch" }, now: number) {
  const days = Math.min(Math.max(Math.round(p.days ?? 30), 1), 365);
  const since = now - days * DAY;
  const rows = s.movements.filter((m) => m.at >= since && match(p.sku, m.skuCode) && (!p.kind || m.kind === p.kind));
  const sales = netSalesBySku(rows, since);
  const bySku = new Map<string, { received: number; dispatched: number; netSales: number }>();
  for (const m of rows) {
    const t = bySku.get(m.skuCode) ?? { received: 0, dispatched: 0, netSales: 0 };
    if (m.kind === "receive") t.received += m.qty; else t.dispatched += m.qty;
    t.netSales = sales.get(m.skuCode) ?? 0;
    bySku.set(m.skuCode, t);
  }
  const start = historyStart(s);
  return {
    windowDays: days,
    recordedHistoryDays: Math.max(0, Math.floor((now - start) / DAY)),
    historyStartsAt: new Date(start).toISOString().slice(0, 10),
    totals: [...bySku].map(([sku, t]) => ({ sku, ...t })).sort((a, b) => b.netSales - a.netSales),
    recent: rows.slice(0, 40).map((m) => ({ date: new Date(m.at).toISOString().slice(0, 10), kind: m.kind, reason: m.reason, sku: m.skuCode, qty: m.qty, ref: m.ref ?? null, synthetic: m.synthetic })),
    omittedOlderRows: Math.max(0, rows.length - 40),
    syntheticRows: rows.filter((m) => m.synthetic).length,
  };
}

export function purchaseOrdersView(s: Snapshot) {
  const orders = s.purchaseOrders.map((o) => {
    const sku = s.skus.find((k) => k.code === o.skuCode);
    const own = typeof o.unitCostSen === "number" && o.unitCostSen > 0 ? o.unitCostSen : null;
    const catalogue = sku && sku.price.unitCostSen > 0 ? sku.price.unitCostSen : null;
    const unitCostSen = own ?? catalogue;
    const outstanding = Math.max(0, o.qty - o.qtyReceived);
    return {
      po: o.code, sku: o.skuCode, ordered: o.qty, received: o.qtyReceived, outstanding,
      supplier: o.supplier ?? null, supplierReference: o.orderRef ?? null,
      unitCostRM: rm(unitCostSen), unitCostSource: own ? "recorded on the order" : catalogue ? "catalogue estimate (order has no recorded cost)" : "unknown",
      outstandingValueRM: unitCostSen ? rm(outstanding * unitCostSen) : null,
      baysNeededOnArrival: Math.ceil(outstanding / Math.max(1, sku?.cap ?? 1)),
      confirmedAt: o.confirmedAt ? new Date(o.confirmedAt).toISOString().slice(0, 10) : null,
    };
  });
  const unknown = orders.filter((o) => o.outstandingValueRM === null).map((o) => o.po);
  return {
    openOrders: orders,
    committedRM: unknown.length ? null : Math.round(orders.reduce((a, o) => a + (o.outstandingValueRM ?? 0), 0) * 100) / 100,
    ...(unknown.length ? { committedUnknownBecause: `${unknown.join(", ")} has no unit cost` } : {}),
    baysNeededOnArrival: orders.reduce((a, o) => a + o.baysNeededOnArrival, 0),
  };
}

/** The same jointly feasible plan the Replenish panel shows. */
export function reorderView(s: Snapshot, p: { sku?: string }, now: number) {
  const rule = s.settings.replenish;
  const plan = replenishmentPlan(s, now);
  const c = plan.commitments;
  const items = plan.rows.filter((r) => match(p.sku, r.code)).map((r) => {
    const x = r.inputs;
    return {
      sku: r.code, item: r.title, status: r.s.status,
      recommendedQty: r.s.status === "ok" ? r.s.suggested : null,
      candidateQtyBeforeSharedLimits: r.candidateQty,
      allocationPriority: r.priority,
      coverDaysAtRecentRate: r.coverDays,
      limitedBy: r.s.limitedBy,
      reasoning: r.s.lines,
      targetCoverUnits: r.s.target,
      inputs: {
        netSalesInWindow: x.netSales, windowDays: rule.windowDays, coverageDays: rule.coverageDays, recordedHistoryDays: x.historyDays,
        onHand: x.onHand, reserved: x.reserved, available: x.onHand - x.reserved, incoming: x.incoming,
        unitCostRM: rm(x.unitCostSen), unitsPerBay: x.cap,
        budgetLeftForThisItemRM: r.budgetBeforeSen === null ? null : r.budgetBeforeSen / 100, baysLeftForThisItem: r.baysBefore,
      },
      estimatedCostRM: r.costSen / 100,
      baysNeeded: r.bays,
    };
  }).sort((a, b) => (a.allocationPriority ?? 1e9) - (b.allocationPriority ?? 1e9) || a.sku.localeCompare(b.sku));
  return {
    rule: { windowDays: rule.windowDays, coverageDays: rule.coverageDays, purchaseBudgetRM: rule.budgetSen / 100 },
    sharedLimits: {
      openOrdersCommittedRM: c.openOrderSen === null ? null : c.openOrderSen / 100,
      budgetLeftBeforePlanRM: c.budgetLeftSen === null ? null : c.budgetLeftSen / 100,
      freeBays: c.freeBays, baysKeptForIncomingOrders: c.incomingBays, baysLeftBeforePlan: c.baysLeft,
    },
    plan: {
      recommendedLines: plan.totals.recommendedLines, units: plan.totals.units,
      totalCostRM: plan.totals.costSen / 100, totalBays: plan.totals.bays,
      budgetLeftAfterRM: plan.totals.budgetLeftAfterSen === null ? null : plan.totals.budgetLeftAfterSen / 100,
      baysLeftAfter: plan.totals.baysLeftAfter, itemsCutBySharedLimits: plan.totals.limitedLines,
    },
    notes: plan.notes,
    items,
    insufficientData: items.filter((i) => i.status === "insufficient").map((i) => ({ sku: i.sku, why: i.reasoning.join("; ") })),
    howToRead: "recommendedQty values are feasible together: SKUs claim the one shared remaining budget and the free bays (after open orders) in allocationPriority order, least cover first. candidateQtyBeforeSharedLimits is what the coverage rule alone asks for. Recording a purchase is a human step in Replenish.",
  };
}

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }], details: value });

/** Pi tool definitions. `snapshot` must fetch fresh data on every call. */
export function warehouseTools(snapshot: () => Promise<Snapshot | null>, now: () => number = Date.now): ToolDefinition[] {
  const read = async <T,>(f: (s: Snapshot) => T) => {
    const s = await snapshot();
    return text(s ? f(s) : { error: "The warehouse has not been set up yet (no settings record)." });
  };
  return [
    {
      name: "get_inventory", label: "Inventory",
      description: "Current stock per SKU: on hand, reserved, available, incoming, bays, units per bay, unit cost; plus warehouse bay capacity. Filter by exact SKU or search text.",
      parameters: Type.Object({ sku: Type.Optional(Type.String({ description: "SKU code, e.g. SOFA-HAVN-2150" })), search: Type.Optional(Type.String({ description: "Model, variant or category words" })) }),
      execute: async (_id, p) => read((s) => inventoryView(s, p as { sku?: string; search?: string })),
    },
    {
      name: "get_movements", label: "Movements",
      description: "Recorded stock movements (receipts and dispatches) with per-SKU totals and net sales, for a window of days. Reports how many days of history exist and how many rows are synthetic demo data.",
      parameters: Type.Object({ sku: Type.Optional(Type.String()), days: Type.Optional(Type.Integer({ minimum: 1, maximum: 365, description: "Window in days, default 30" })), kind: Type.Optional(Type.Union([Type.Literal("receive"), Type.Literal("dispatch")])) }),
      execute: async (_id, p) => read((s) => movementsView(s, p as { sku?: string; days?: number; kind?: "receive" | "dispatch" }, now())),
    },
    {
      name: "get_purchase_orders", label: "Purchase orders",
      description: "Open confirmed supplier purchase orders: outstanding quantity, supplier, reference, each order's own unit cost, committed value and bays needed on arrival.",
      parameters: Type.Object({}),
      execute: async () => read((s) => purchaseOrdersView(s)),
    },
    {
      name: "analyze_reorder", label: "Reorder analysis",
      description: "The warehouse replenishment plan (the same one the Replenish panel shows): per SKU, sales in the window → cover target, minus available and incoming; then one shared remaining budget (after open orders at their own cost) and the free bays (after space kept for incoming orders) are allocated across SKUs in priority order, so recommended quantities are feasible together. Marks items with insufficient data and returns the exact inputs used.",
      parameters: Type.Object({ sku: Type.Optional(Type.String({ description: "Limit to one SKU" })) }),
      execute: async (_id, p) => read((s) => reorderView(s, p as { sku?: string }, now())),
    },
  ];
}
