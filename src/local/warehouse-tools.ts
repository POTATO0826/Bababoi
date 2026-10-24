// Read-only warehouse tools for the local agent. Each call reads the live ledger through the same
// authorised Convex query the UI uses, and reuses the UI's domain rules. None of them can change data.
import type { FunctionReturnType } from "convex/server";
import { Type } from "@earendil-works/pi-ai";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { api } from "../../convex/_generated/api";
import { SLOT_BY_ID } from "../data/layout";
import { netSalesBySku } from "../domain/ageing";
import { historyStart, replenishmentRows } from "../domain/replenish";
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
    const unitCostSen = o.unitCostSen ?? sku?.price.unitCostSen ?? 0;
    return {
      po: o.code, sku: o.skuCode, ordered: o.qty, received: o.qtyReceived, outstanding: o.qty - o.qtyReceived,
      supplier: o.supplier ?? null, supplierReference: o.orderRef ?? null, unitCostRM: rm(unitCostSen),
      outstandingValueRM: rm((o.qty - o.qtyReceived) * unitCostSen), confirmedAt: o.confirmedAt ? new Date(o.confirmedAt).toISOString().slice(0, 10) : null,
    };
  });
  return { openOrders: orders, committedRM: Math.round(orders.reduce((a, o) => a + (o.outstandingValueRM ?? 0), 0) * 100) / 100 };
}

export function reorderView(s: Snapshot, p: { sku?: string }, now: number) {
  const rule = s.settings.replenish;
  const rows = replenishmentRows(s, now).filter((r) => match(p.sku, r.code));
  const items = rows.map((r) => {
    const x = r.inputs;
    return {
      sku: r.code, item: r.title, status: r.s.status, recommendedQty: r.s.suggested,
      reasoning: r.s.lines,
      targetCoverUnits: r.s.target, shortfallBeforeLimits: r.s.raw, limitedBy: r.s.limitedBy,
      inputs: {
        netSalesInWindow: x.netSales, windowDays: rule.windowDays, coverageDays: rule.coverageDays, recordedHistoryDays: x.historyDays,
        onHand: x.onHand, reserved: x.reserved, available: x.onHand - x.reserved, incoming: x.incoming,
        unitCostRM: rm(x.unitCostSen), budgetLeftRM: rm(x.budgetLeftSen) ?? 0, freeBays: x.freeBays, unitsPerBay: x.cap,
        maxUnitsBySpace: x.freeBays * x.cap, maxUnitsByBudget: x.unitCostSen > 0 ? Math.floor(x.budgetLeftSen / x.unitCostSen) : null,
      },
      estimatedCostRM: rm(r.s.suggested * x.unitCostSen),
      baysNeeded: r.s.suggested > 0 ? Math.ceil(r.s.suggested / x.cap) : 0,
    };
  }).sort((a, b) => (b.recommendedQty - a.recommendedQty) || a.status.localeCompare(b.status));
  const recommended = items.filter((i) => i.recommendedQty > 0);
  const budgetLeftRM = items[0]?.inputs.budgetLeftRM ?? rm(rule.budgetSen) ?? 0;
  const freeBays = freeSlotSet(s.batches).size;
  const totalCostRM = Math.round(recommended.reduce((a, i) => a + (i.estimatedCostRM ?? 0), 0) * 100) / 100;
  const totalBays = recommended.reduce((a, i) => a + i.baysNeeded, 0);
  return {
    rule: { windowDays: rule.windowDays, coverageDays: rule.coverageDays, purchaseBudgetRM: rm(rule.budgetSen) },
    items,
    combined: {
      recommendedLines: recommended.length, totalCostRM, budgetLeftRM, totalBaysNeeded: totalBays, freeBays,
      warnings: [
        ...(totalCostRM > budgetLeftRM ? [`Combined recommendations cost RM${totalCostRM}, above the RM${budgetLeftRM} budget left after open orders; prioritise.`] : []),
        ...(totalBays > freeBays ? [`Combined recommendations need ${totalBays} bays but only ${freeBays} are free; prioritise.`] : []),
      ],
    },
    insufficientData: items.filter((i) => i.status === "insufficient").map((i) => ({ sku: i.sku, why: i.reasoning.join("; ") })),
    note: "Each item is limited by the shared budget and free bays independently; check 'combined' before ordering everything. Recording a purchase is a human step in Replenish.",
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
      description: "Open confirmed supplier purchase orders: outstanding quantity, supplier, reference, unit cost and committed value.",
      parameters: Type.Object({}),
      execute: async () => read((s) => purchaseOrdersView(s)),
    },
    {
      name: "analyze_reorder", label: "Reorder analysis",
      description: "The warehouse replenishment rule per SKU: sales in the window → cover target, minus available and incoming, limited by free bays and remaining purchase budget. Marks items with insufficient data. Returns the exact inputs used.",
      parameters: Type.Object({ sku: Type.Optional(Type.String({ description: "Limit to one SKU" })) }),
      execute: async (_id, p) => read((s) => reorderView(s, p as { sku?: string }, now())),
    },
  ];
}
