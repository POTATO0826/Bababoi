// Which batches have sat unsold long enough to need attention. Explainable flags only — never an order to dispose.
import { batchQty, slotCode } from "./stock";
import { DAY, type AgeingRule, type BatchLike, type MovementLike, type ReservationLike } from "./types";

export interface BatchFlag {
  batch: BatchLike;
  ageDays: number;
  qty: number;
  unreserved: number;
  salesInWindow: number;
  bays: string[];
  flagged: boolean;
  reasons: string[];
  caveats: string[];
}

/** Confirmed sales minus customer returns per SKU, from `since`. Quotes, offers and approvals are not sales. */
export function netSalesBySku(movements: readonly MovementLike[], since: number): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of movements) {
    if (x.at < since) continue;
    const d = x.reason === "sale" && x.kind === "dispatch" ? x.qty : x.reason === "customer_return" ? -x.qty : 0;
    if (d) m.set(x.skuCode, (m.get(x.skuCode) ?? 0) + d);
  }
  return m;
}

export function flagBatches(input: {
  batches: readonly BatchLike[];
  reservations: readonly ReservationLike[];
  movements: readonly MovementLike[];
  rule: AgeingRule;
  now: number;
  /** Earliest time the movement history covers. */
  historyFrom: number;
}): BatchFlag[] {
  const { rule, now } = input;
  const sales = netSalesBySku(input.movements, now - rule.windowDays * DAY);
  const active = input.batches.filter((b) => b.status === "active" && batchQty(b) > 0);
  const flags = active.map((b): BatchFlag => {
    const qty = batchQty(b);
    const reserved = input.reservations
      .filter((r) => r.status === "active" && r.batchId === b._id)
      .reduce((a, r) => a + r.qty, 0);
    const unreserved = qty - reserved;
    const ageDays = Math.floor((now - b.receivedAt) / DAY);
    const salesInWindow = sales.get(b.skuCode) ?? 0;
    const flagged = ageDays >= rule.minAgeDays && salesInWindow <= rule.maxSales && unreserved > 0;
    const bays = b.locations.map((l) => slotCode(l.slot));
    const younger = active.find((o) => o.skuCode === b.skuCode && o._id !== b._id && o.receivedAt > b.receivedAt);
    const caveats: string[] = [];
    if (younger) caveats.push(`Newer batch ${younger.code} of this model is ${Math.floor((now - younger.receivedAt) / DAY)} days old`);
    if (input.historyFrom > now - rule.windowDays * DAY) caveats.push("Sales history is shorter than the window");
    return {
      batch: b,
      ageDays,
      qty,
      unreserved,
      salesInWindow,
      bays,
      flagged,
      reasons: [
        `${ageDays} days since received`,
        `${salesInWindow} sold in ${rule.windowDays} days`,
        `${bays.length} ${bays.length === 1 ? "bay" : "bays"} · ${bays.join(", ")}`,
      ],
      caveats,
    };
  });
  return flags.sort((a, b) => Number(b.flagged) - Number(a.flagged) || b.ageDays * b.bays.length - a.ageDays * a.bays.length);
}
