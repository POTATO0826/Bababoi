// Replenishment advice (AdvancedWareorb.md §7): a transparent coverage rule, bounded by space and budget.
// One plan allocates the shared remaining budget and free bays across all SKUs, so the recommended
// orders are feasible together. The Replenish panel and the local agent both read this plan.
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

/** Why the rule cannot give a number for this SKU, or null when it can. */
function insufficiency(x: Pick<ReplenishInput, "unitCostSen" | "historyDays" | "netSales" | "rule">): string | null {
  if (!Number.isSafeInteger(x.unitCostSen) || x.unitCostSen <= 0) return "Record the purchase unit cost before estimating a replenishment budget";
  if (x.historyDays < x.rule.windowDays) return `Only ${x.historyDays} days of history (the rule needs ${x.rule.windowDays})`;
  if (x.netSales <= 0) return `No sales in ${x.rule.windowDays} days`;
  return null;
}

/** One SKU on its own, given the budget and bays still available to it. */
export function suggest(x: ReplenishInput): Suggestion {
  const { rule } = x;
  const available = x.onHand - x.reserved;
  const why = insufficiency(x);
  if (why) return { status: "insufficient", target: 0, raw: 0, suggested: 0, limitedBy: null, lines: [why] };
  const target = Math.ceil((x.netSales / rule.windowDays) * rule.coverageDays);
  const raw = Math.max(0, target - available - x.incoming);
  const bySpace = Math.max(0, x.freeBays) * x.cap;
  const byBudget = Math.floor(Math.max(0, x.budgetLeftSen) / x.unitCostSen);
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
      ...(limitedBy === "space" ? [`Space for ${bySpace} (${x.freeBays} bays left × ${x.cap})`] : limitedBy === "budget" ? [`Budget for ${byBudget} at ${(x.unitCostSen / 100).toFixed(2)} RM`] : []),
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
  purchaseOrders: readonly { code?: string; skuCode: string; qty: number; qtyReceived: number; unitCostSen?: number }[];
  movements: readonly MovementLike[];
}

export interface ReplenishRow {
  code: string;
  title: string;
  netSales: number;
  onHand: number;
  reserved: number;
  incoming: number;
  /** The final, jointly feasible suggestion: `s.suggested` already shares budget and bays with earlier rows. */
  s: Suggestion;
  /** Units the coverage rule asks for before any shared limit (0 when data is insufficient). */
  candidateQty: number;
  /** Allocation order (1 = first claim on budget and bays); null when not allocated. */
  priority: number | null;
  /** Days the available + incoming stock lasts at the recent sales rate; null without a rate. */
  coverDays: number | null;
  /** Cost and bays of `s.suggested`. */
  costSen: number;
  bays: number;
  /** What was left for this SKU when its turn came. */
  budgetBeforeSen: number | null;
  baysBefore: number;
  /** The exact numbers the rule used, so advice can be explained. */
  inputs: ReplenishInput;
}

export interface Commitments {
  /** Outstanding value of open purchase orders at each order's own unit cost; null if any order's cost is unknown. */
  openOrderSen: number | null;
  /** Orders without a recorded unit cost whose value was estimated from the catalogue cost. */
  estimatedOrders: string[];
  /** Orders with no cost at all: the remaining budget is then unknown. */
  unknownCostOrders: string[];
  /** Bays the outstanding purchase orders will need when they arrive. */
  incomingBays: number;
  freeBays: number;
  /** Free bays not already promised to incoming orders. */
  baysLeft: number;
  budgetSen: number;
  /** Budget left after open orders; null when unknown. */
  budgetLeftSen: number | null;
}

/** What open purchase orders already commit: their actual cost and the bays they will occupy. */
export function commitments(l: ReplenishLedger): Commitments {
  const estimatedOrders: string[] = [];
  const unknownCostOrders: string[] = [];
  let openOrderSen = 0, incomingBays = 0;
  for (const po of l.purchaseOrders) {
    const outstanding = Math.max(0, po.qty - po.qtyReceived);
    if (!outstanding) continue;
    const sku = l.skus.find((s) => s.code === po.skuCode);
    const name = po.code ?? `${po.skuCode} order`;
    const own = Number.isSafeInteger(po.unitCostSen) && po.unitCostSen! > 0 ? po.unitCostSen! : null;
    const catalogue = sku && Number.isSafeInteger(sku.price.unitCostSen) && sku.price.unitCostSen > 0 ? sku.price.unitCostSen : null;
    if (own === null && catalogue !== null) estimatedOrders.push(name);
    if (own === null && catalogue === null) unknownCostOrders.push(name);
    openOrderSen += outstanding * (own ?? catalogue ?? 0);
    // An order for an item without a known bay capacity is assumed to need one bay per unit.
    incomingBays += Math.ceil(outstanding / Math.max(1, sku?.cap ?? 1));
  }
  const freeBays = freeSlotSet(l.batches).size;
  const budgetSen = l.settings.replenish.budgetSen;
  const known = unknownCostOrders.length === 0;
  return {
    openOrderSen: known ? openOrderSen : null,
    estimatedOrders,
    unknownCostOrders,
    incomingBays,
    freeBays,
    baysLeft: Math.max(0, freeBays - incomingBays),
    budgetSen,
    budgetLeftSen: known ? Math.max(0, budgetSen - openOrderSen) : null,
  };
}

export interface ReplenishPlan {
  rows: ReplenishRow[];
  commitments: Commitments;
  totals: {
    recommendedLines: number;
    units: number;
    costSen: number;
    bays: number;
    budgetLeftAfterSen: number | null;
    baysLeftAfter: number;
    /** SKUs whose candidate need was cut by the shared budget or space. */
    limitedLines: number;
  };
  /** Plain explanations of plan-wide limits. */
  notes: string[];
}

/** Only the period with recorded observations can support sales-rate claims. */
export function historyStart(l: Pick<ReplenishLedger, "settings" | "movements">): number {
  if (!l.settings.demoMode) return l.settings.seededAt;
  return l.movements.reduce((start, movement) => Math.min(start, movement.at), l.settings.seededAt);
}

const rmText = (sen: number) => `RM${(sen / 100).toFixed(2)}`;

/**
 * Advice for every catalogue item. SKUs with enough data claim the shared remaining budget and bays
 * in a deterministic order: least days of cover first, then the larger shortfall, then SKU code.
 */
export function replenishmentPlan(l: ReplenishLedger, now: number): ReplenishPlan {
  const { replenish: rule } = l.settings;
  const sales = netSalesBySku(l.movements, now - rule.windowDays * DAY);
  const historyDays = Math.max(0, Math.floor((now - historyStart(l)) / DAY));
  const c = commitments(l);
  const base = l.skus.map((sku) => {
    const onHand = l.batches.filter((b) => b.skuCode === sku.code).reduce((a, b) => a + b.locations.reduce((x, loc) => x + loc.qty, 0), 0);
    const reserved = l.reservations.filter((r) => r.skuCode === sku.code).reduce((a, r) => a + r.qty, 0);
    const incoming = l.purchaseOrders.filter((p) => p.skuCode === sku.code).reduce((a, p) => a + Math.max(0, p.qty - p.qtyReceived), 0);
    const netSales = sales.get(sku.code) ?? 0;
    // The unconstrained need: what the rule asks for with unlimited budget and space.
    const free = suggest({ netSales, historyDays, onHand, reserved, incoming, freeBays: Number.MAX_SAFE_INTEGER, cap: Math.max(1, sku.cap), unitCostSen: sku.price.unitCostSen, budgetLeftSen: Number.MAX_SAFE_INTEGER, rule });
    const rate = netSales > 0 ? netSales / rule.windowDays : 0;
    const coverDays = rate > 0 ? Math.round(((onHand - reserved + incoming) / rate) * 10) / 10 : null;
    return { sku, onHand, reserved, incoming, netSales, free, coverDays };
  });

  const order = base
    .filter((b) => b.free.status === "ok" && b.free.raw > 0)
    .sort((a, b) => (a.coverDays! - b.coverDays!) || (b.free.raw - a.free.raw) || a.sku.code.localeCompare(b.sku.code));
  const priority = new Map(order.map((b, i) => [b.sku.code, i + 1]));

  let budgetLeft = c.budgetLeftSen;
  let baysLeft = c.baysLeft;
  const allocated = new Map<string, { s: Suggestion; costSen: number; bays: number; budgetBeforeSen: number | null; baysBefore: number; inputs: ReplenishInput }>();
  for (const b of order) {
    const cap = Math.max(1, b.sku.cap);
    const inputs: ReplenishInput = {
      netSales: b.netSales, historyDays, onHand: b.onHand, reserved: b.reserved, incoming: b.incoming,
      freeBays: baysLeft, cap, unitCostSen: b.sku.price.unitCostSen, budgetLeftSen: budgetLeft ?? 0, rule,
    };
    if (budgetLeft === null) {
      const s: Suggestion = { ...b.free, status: "insufficient", suggested: 0, limitedBy: null, lines: [...b.free.lines, `Remaining budget unknown: ${c.unknownCostOrders.join(", ")} has no recorded unit cost`] };
      allocated.set(b.sku.code, { s, costSen: 0, bays: 0, budgetBeforeSen: null, baysBefore: baysLeft, inputs });
      continue;
    }
    const s = suggest(inputs);
    const costSen = s.suggested * inputs.unitCostSen;
    const bays = Math.ceil(s.suggested / cap);
    s.lines.push(`Shared limits at priority ${priority.get(b.sku.code)}: ${rmText(budgetLeft)} budget and ${baysLeft} bays left → order ${s.suggested} (${rmText(costSen)}, ${bays} ${bays === 1 ? "bay" : "bays"})`);
    allocated.set(b.sku.code, { s, costSen, bays, budgetBeforeSen: budgetLeft, baysBefore: baysLeft, inputs });
    budgetLeft -= costSen;
    baysLeft -= bays;
  }

  const rows: ReplenishRow[] = base.map((b) => {
    const a = allocated.get(b.sku.code);
    const fallbackInputs: ReplenishInput = {
      netSales: b.netSales, historyDays, onHand: b.onHand, reserved: b.reserved, incoming: b.incoming,
      freeBays: c.baysLeft, cap: Math.max(1, b.sku.cap), unitCostSen: b.sku.price.unitCostSen, budgetLeftSen: c.budgetLeftSen ?? 0, rule,
    };
    return {
      code: b.sku.code, title: `${b.sku.model} · ${b.sku.variant}`,
      netSales: b.netSales, onHand: b.onHand, reserved: b.reserved, incoming: b.incoming,
      s: a?.s ?? { ...b.free, suggested: 0 },
      candidateQty: b.free.status === "ok" ? b.free.raw : 0,
      priority: priority.get(b.sku.code) ?? null,
      coverDays: b.coverDays,
      costSen: a?.costSen ?? 0,
      bays: a?.bays ?? 0,
      budgetBeforeSen: a ? a.budgetBeforeSen : c.budgetLeftSen,
      baysBefore: a?.baysBefore ?? c.baysLeft,
      inputs: a?.inputs ?? fallbackInputs,
    };
  });

  const recommended = rows.filter((r) => r.s.status === "ok" && r.s.suggested > 0);
  const notes: string[] = [];
  if (c.unknownCostOrders.length) notes.push(`Remaining budget is unknown because ${c.unknownCostOrders.join(", ")} ${c.unknownCostOrders.length === 1 ? "has" : "have"} no recorded unit cost; no order quantities are recommended.`);
  if (c.estimatedOrders.length) notes.push(`${c.estimatedOrders.join(", ")} ${c.estimatedOrders.length === 1 ? "has" : "have"} no recorded order cost; the catalogue unit cost was used for the committed budget.`);
  if (c.incomingBays) notes.push(`${c.incomingBays} of ${c.freeBays} free bays are kept for open purchase orders still to arrive.`);
  const limited = rows.filter((r) => r.priority !== null && r.s.status === "ok" && r.s.suggested < r.candidateQty);
  if (limited.length) notes.push(`${limited.length} ${limited.length === 1 ? "item gets" : "items get"} less than the coverage rule asks for because the shared budget or bays ran out.`);
  return {
    rows,
    commitments: c,
    totals: {
      recommendedLines: recommended.length,
      units: recommended.reduce((a, r) => a + r.s.suggested, 0),
      costSen: recommended.reduce((a, r) => a + r.costSen, 0),
      bays: recommended.reduce((a, r) => a + r.bays, 0),
      budgetLeftAfterSen: budgetLeft,
      baysLeftAfter: baysLeft,
      limitedLines: limited.length,
    },
    notes,
  };
}

/** Advice for every catalogue item, including items without enough data to estimate. */
export function replenishmentRows(l: ReplenishLedger, now: number): ReplenishRow[] {
  return replenishmentPlan(l, now).rows;
}
