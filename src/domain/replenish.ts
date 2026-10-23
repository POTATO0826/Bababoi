// Replenishment advice (AdvancedWareorb.md §7): a transparent coverage rule, bounded by space and budget.
import type { ReplenishRule } from "./types";

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
