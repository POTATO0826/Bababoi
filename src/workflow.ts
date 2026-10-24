// Derived workflow views over the Convex snapshot: ageing flags, deal turns, map overlay, replenishment.
import { useEffect, useMemo, useState } from "react";
import { flagBatches, netSalesBySku, type BatchFlag } from "@/domain/ageing";
import { OPEN_DEAL } from "@/domain/deal";
import { suggest, type Suggestion } from "@/domain/replenish";
import { freeSlotSet } from "@/domain/stock";
import { DAY, type Role } from "@/domain/types";
import type { Deal } from "@/ledger";
import { useWare, type Snapshot, type Stage } from "@/store";

/** A clock that ticks once a minute (ages, expiries). */
export function useNow(ms = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export type DealStatus = Deal["status"];
type BadgeTone = "ageing" | "reserved" | "dispatch" | "ok" | "brand" | "warn" | "neutral" | "tag";

export const DEAL_STATUS: Record<DealStatus, { label: string; tone: BadgeTone; turn: Role | null }> = {
  finding_buyer: { label: "Finding buyer", tone: "ageing", turn: "sales" },
  offer_ready: { label: "Offer", tone: "brand", turn: "sales" },
  pending_approval: { label: "Approval", tone: "warn", turn: "owner" },
  approved: { label: "To collect", tone: "reserved", turn: "warehouse" },
  collected: { label: "Collected", tone: "ok", turn: null },
  rejected: { label: "Rejected", tone: "dispatch", turn: "sales" },
  closed: { label: "Closed", tone: "tag", turn: null },
};

export const isOpenDeal = (d: Pick<Deal, "status">) => (OPEN_DEAL as readonly string[]).includes(d.status);

/** Only the period with recorded observations can support sales-rate claims. */
export function historyFrom(ledger: Snapshot): number {
  if (!ledger.settings.demoMode) return ledger.settings.seededAt;
  return ledger.movements.reduce((start, movement) => Math.min(start, movement.at), ledger.settings.seededAt);
}

export function flagsOf(ledger: Snapshot | null, now: number): BatchFlag[] {
  if (!ledger) return [];
  return flagBatches({
    batches: ledger.batches,
    reservations: ledger.reservations,
    movements: ledger.movements,
    rule: ledger.settings.ageing,
    now,
    historyFrom: historyFrom(ledger),
  });
}

export function useFlags() {
  const ledger = useWare((s) => s.ledger);
  const now = useNow();
  return useMemo(() => flagsOf(ledger, now), [ledger, now]);
}

export interface ReplenishRow {
  code: string;
  title: string;
  netSales: number;
  onHand: number;
  reserved: number;
  incoming: number;
  s: Suggestion;
}

export function suggestionsOf(ledger: Snapshot | null, now: number): ReplenishRow[] {
  if (!ledger) return [];
  const { replenish } = ledger.settings;
  const sales = netSalesBySku(ledger.movements, now - replenish.windowDays * DAY);
  const historyDays = Math.max(0, Math.floor((now - historyFrom(ledger)) / DAY));
  const freeBays = freeSlotSet(ledger.batches).size;
  const openPoSen = ledger.purchaseOrders.reduce((a, p) => {
    const sku = ledger.skus.find((x) => x.code === p.skuCode);
    return a + (sku ? (p.qty - p.qtyReceived) * sku.price.unitCostSen : 0);
  }, 0);
  const rows = ledger.skus.map((sku) => {
    const onHand = ledger.batches.filter((b) => b.skuCode === sku.code).reduce((a, b) => a + b.locations.reduce((x, l) => x + l.qty, 0), 0);
    const reserved = ledger.reservations.filter((r) => r.skuCode === sku.code).reduce((a, r) => a + r.qty, 0);
    const incoming = ledger.purchaseOrders.filter((p) => p.skuCode === sku.code).reduce((a, p) => a + p.qty - p.qtyReceived, 0);
    const netSales = sales.get(sku.code) ?? 0;
    return {
      code: sku.code,
      title: `${sku.model} · ${sku.variant}`,
      netSales,
      onHand,
      reserved,
      incoming,
      s: suggest({
        netSales,
        historyDays,
        onHand,
        reserved,
        incoming,
        freeBays,
        cap: sku.cap,
        unitCostSen: sku.price.unitCostSen,
        budgetLeftSen: Math.max(0, replenish.budgetSen - openPoSen),
        rule: replenish,
      }),
    };
  });
  return rows.filter((r) => r.s.status === "ok" && r.s.suggested > 0).sort((a, b) => b.netSales - a.netSales);
}

export function useSuggestions() {
  const ledger = useWare((s) => s.ledger);
  const now = useNow();
  return useMemo(() => suggestionsOf(ledger, now), [ledger, now]);
}

/** Work waiting for the current role, per command (palette badges). */
export function useStageCounts(): Partial<Record<Stage, number>> {
  const ledger = useWare((s) => s.ledger);
  const role = useWare((s) => s.role);
  const flags = useFlags();
  const suggestions = useSuggestions();
  return useMemo(() => {
    if (!ledger) return {};
    const openBatches = new Set(ledger.deals.filter(isOpenDeal).map((d) => d.batchId));
    const count = (st: DealStatus[]) => ledger.deals.filter((d) => st.includes(d.status)).length;
    return {
      receive: role === "warehouse" ? ledger.receipts.filter((r) => r.status === "needs_review").length : 0,
      ageing: role === "owner" ? flags.filter((f) => f.flagged && !openBatches.has(f.batch._id as never)).length : 0,
      deals: ledger.deals.filter((d) => DEAL_STATUS[d.status].turn === role).length,
      delivery: role === "sales" ? count(["offer_ready", "rejected"]) : 0,
      approve: role === "owner" ? count(["pending_approval"]) : 0,
      collect: role === "warehouse" ? count(["approved"]) : 0,
      replenish: role === "owner" ? suggestions.length : 0,
    };
  }, [ledger, role, flags, suggestions]);
}

export type BayState = "ageing" | "reserved" | "freed";

/** Workflow state per bay for the 3D map. Ageing shows only where it matters (Ageing / Deals). */
export function useBayOverlay(): Map<string, BayState> {
  const ledger = useWare((s) => s.ledger);
  const stage = useWare((s) => s.stage);
  const flags = useFlags();
  const now = useNow();
  return useMemo(() => {
    const m = new Map<string, BayState>();
    if (!ledger) return m;
    if (stage === "ageing" || stage === "deals") {
      for (const f of flags) if (f.flagged) for (const l of f.batch.locations) m.set(l.slot, "ageing");
    }
    for (const r of ledger.reservations) for (const p of r.pick) m.set(p.slot, "reserved");
    const occupied = new Set(ledger.batches.flatMap((b) => b.locations.map((l) => l.slot)));
    for (const mv of ledger.movements) {
      if (mv.kind !== "dispatch" || now - mv.at > DAY) continue;
      for (const l of mv.lines) if (!occupied.has(l.slot)) m.set(l.slot, "freed");
    }
    return m;
  }, [ledger, stage, flags, now]);
}
