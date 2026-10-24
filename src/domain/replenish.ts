// Replenishment advice (AdvancedWareorb.md §7): a transparent coverage rule, bounded by space and budget.
import { netSalesBySku } from "./ageing";
import { freeSlotSet } from "./stock";
import { DAY, type BatchLike, type MovementLike, type ReplenishRule } from "./types";

export interface ReplenishInput {
  netSales: number;
  /** Days of movement history available. */
  historyDays: number;
  onHand: number;
  reserved: number;
  incoming: number;
  freeBays: number;
  cap: number;
  unitCostSen: number;
  budgetLeftSen: number;
  rule: ReplenishRule;
}

export interface Suggestion {
  status: "ok" | "insufficient";
  target: number;
  raw: number;
  suggested: number;
  /** Which limit cut the raw number, if any. */
  limitedBy: "space" | "budget" | null;
  lines: string[];
}

export function suggest(x: ReplenishInput): Suggestion {
  const { rule } = x;
  const available = x.onHand - x.reserved;
  if (!Number.isSafeInteger(x.unitCostSen) || x.unitCostSen <= 0) {
    return { status: "insufficient", target: 0, raw: 0, suggested: 0, limitedBy: null, lines: ["Record the purchase unit cost before estimating a replenishment budget"] };
  }
  if (x.historyDays < rule.windowDays || x.netSales <= 0) {
    return {
      status: "insufficient",
      target: 0,
      raw: 0,
      suggested: 0,
      limitedBy: null,
      lines: [x.netSales <= 0 ? `No sales in ${rule.windowDays} days` : `Only ${x.historyDays} days of history`],
    };
  }
  const target = Math.ceil((x.netSales / rule.windowDays) * rule.coverageDays);
  const raw = Math.max(0, target - available - x.incoming);
  const bySpace = x.freeBays * x.cap;
  const byBudget = x.unitCostSen > 0 ? Math.floor(x.budgetLeftSen / x.unitCostSen) : raw;
  const suggested = Math.min(raw, bySpace, byBudget);
  const limitedBy = suggested < raw ? (bySpace <= byBudget ? "space" : "budget") : null;
  return {
    status: "ok",
    target,
    raw,
    suggested,
    limitedBy,
    lines: [
      `${x.netSales} sold in ${rule.windowDays} days → ${rule.coverageDays}-day target ${target}`,
      `${target} − ${available} available − ${x.incoming} incoming = ${raw}`,
      ...(limitedBy === "space" ? [`Space for ${bySpace}`] : limitedBy === "budget" ? [`Budget for ${byBudget}`] : []),
    ],
  };
}

/** The ledger fields the replenishment rule reads (a Convex snapshot satisfies this). */
export interface ReplenishLedger {
  settings: { replenish: ReplenishRule; demoMode: boolean; seededAt: number };
  skus: readonly { code: string; model: string; variant: string; cap: number; price: { unitCostSen: number } }[];
  /** Active batches. */
  batches: readonly BatchLike[];
  /** Active reservations. */
  reservations: readonly { skuCode: string; qty: number }[];
  /** Open purchase orders. */
  purchaseOrders: readonly { skuCode: string; qty: number; qtyReceived: number }[];
  movements: readonly MovementLike[];
}

export interface ReplenishRow {
  code: string;
  title: string;
  netSales: number;
  onHand: number;
  reserved: number;
  incoming: number;
  s: Suggestion;
  /** The exact numbers the rule used, so advice can be explained. */
  inputs: ReplenishInput;
}

/** Only the period with recorded observations can support sales-rate claims. */
export function historyStart(l: Pick<ReplenishLedger, "settings" | "movements">): number {
  if (!l.settings.demoMode) return l.settings.seededAt;
  return l.movements.reduce((start, movement) => Math.min(start, movement.at), l.settings.seededAt);
}

/** Advice for every catalogue item, including items without enough data to estimate. */
export function replenishmentRows(l: ReplenishLedger, now: number): ReplenishRow[] {
  const { replenish } = l.settings;
  const sales = netSalesBySku(l.movements, now - replenish.windowDays * DAY);
  const historyDays = Math.max(0, Math.floor((now - historyStart(l)) / DAY));
  const freeBays = freeSlotSet(l.batches).size;
  const openPoSen = l.purchaseOrders.reduce((a, p) => {
    const sku = l.skus.find((x) => x.code === p.skuCode);
    return a + (sku ? (p.qty - p.qtyReceived) * sku.price.unitCostSen : 0);
  }, 0);
  return l.skus.map((sku) => {
    const onHand = l.batches.filter((b) => b.skuCode === sku.code).reduce((a, b) => a + b.locations.reduce((x, loc) => x + loc.qty, 0), 0);
    const reserved = l.reservations.filter((r) => r.skuCode === sku.code).reduce((a, r) => a + r.qty, 0);
    const incoming = l.purchaseOrders.filter((p) => p.skuCode === sku.code).reduce((a, p) => a + p.qty - p.qtyReceived, 0);
    const netSales = sales.get(sku.code) ?? 0;
    const inputs: ReplenishInput = {
      netSales, historyDays, onHand, reserved, incoming, freeBays, cap: sku.cap,
      unitCostSen: sku.price.unitCostSen, budgetLeftSen: Math.max(0, replenish.budgetSen - openPoSen), rule: replenish,
    };
    return { code: sku.code, title: `${sku.model} · ${sku.variant}`, netSales, onHand, reserved, incoming, s: suggest(inputs), inputs };
  });
}
