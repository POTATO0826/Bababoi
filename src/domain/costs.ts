// Delivery cost comparison and net recovery (AdvancedWareorb.md §5.3). Unknown cost is never zero.

export type ExtraStatus = "included" | "excluded" | "unknown";
export type QuoteSource = "lalamove_sandbox" | "manual" | "demo_fallback";

export interface QuoteLike {
  _id: string;
  source: QuoteSource;
  dealVersion: number;
  status: "pending" | "ok" | "error";
  service: string;
  carrier: string;
  totalSen?: number;
  expiresAt?: number;
  /** Is unloading inside `totalSen`? */
  unloading: ExtraStatus;
  /** Confirmed unloading charge outside `totalSen` (only with `unloading: "excluded"`). */
  unloadingSen?: number;
  reference?: string;
  terms?: string;
  verifiedAt?: number;
}

export interface DealCostLike {
  version: number;
  priceSen: number;
  packingSen: number;
  unloading: "requested" | "not_needed";
  freightPayer: "merchant" | "buyer";
}

export type Comparable =
  | { kind: "complete"; sen: number }
  | { kind: "incomplete"; knownSen: number; missing: string[] };

/** Quote total + confirmed required extras the total excludes. */
export function comparable(q: QuoteLike, deal: DealCostLike): Comparable {
  if (q.status !== "ok" || q.totalSen == null || !Number.isSafeInteger(q.totalSen) || q.totalSen <= 0) return { kind: "incomplete", knownSen: 0, missing: ["valid quote total"] };
  if (q.unloadingSen != null && (!Number.isSafeInteger(q.unloadingSen) || q.unloadingSen < 0)) return { kind: "incomplete", knownSen: q.totalSen, missing: ["valid unloading charge"] };
  if (q.unloading === "included" && q.unloadingSen != null) {
    throw new Error("Unloading is already inside the quoted total; it cannot be added again.");
  }
  if (deal.unloading === "not_needed" || q.unloading === "included") return { kind: "complete", sen: q.totalSen };
  if (q.unloading === "excluded" && q.unloadingSen != null) return { kind: "complete", sen: q.totalSen + q.unloadingSen };
  return { kind: "incomplete", knownSen: q.totalSen, missing: ["unloading charge"] };
}

export type QuoteState = "current" | "pending" | "error" | "stale" | "expired";

export function quoteState(q: QuoteLike, deal: Pick<DealCostLike, "version">, now: number): QuoteState {
  if (q.status === "pending") return "pending";
  if (q.status === "error") return "error";
  if (q.dealVersion !== deal.version) return "stale";
  if (q.expiresAt == null || !Number.isFinite(q.expiresAt) || q.expiresAt <= now) return "expired";
  return "current";
}

export interface Ranked<Q extends QuoteLike> {
  ranked: { quote: Q; sen: number }[];
  other: { quote: Q; reason: string }[];
}

/** Only current, complete, real quotes are ranked; everything else keeps its reason. */
export function rankQuotes<Q extends QuoteLike>(quotes: readonly Q[], deal: DealCostLike, now: number): Ranked<Q> {
  const ranked: Ranked<Q>["ranked"] = [];
  const other: Ranked<Q>["other"] = [];
  for (const q of quotes) {
    const st = quoteState(q, deal, now);
    if (st !== "current") {
      other.push({ quote: q, reason: { pending: "Pending", error: "Failed", stale: "Old version", expired: "Expired" }[st] });
      continue;
    }
    if (q.source === "demo_fallback") {
      other.push({ quote: q, reason: "Saved demo" });
      continue;
    }
    if (q.source === "lalamove_sandbox") {
      other.push({ quote: q, reason: "Sandbox only" });
      continue;
    }
    if (!q.verifiedAt || !q.reference?.trim() || !q.terms?.trim()) {
      other.push({ quote: q, reason: "Carrier confirmation needed" });
      continue;
    }
    const c = comparable(q, deal);
    if (c.kind === "incomplete") other.push({ quote: q, reason: "Incomplete" });
    else ranked.push({ quote: q, sen: c.sen });
  }
  ranked.sort((a, b) => a.sen - b.sen);
  return { ranked, other };
}

export interface Recovery {
  proceedsSen: number;
  /** Merchant-paid delivery; null when unknown. */
  deliverySen: number | null;
  packingSen: number;
  /** Net recovery before historical stock cost — not profit. Null when a merchant cost is unknown. */
  netSen: number | null;
  missing: string[];
}

export function netRecovery(deal: DealCostLike, delivery: Comparable): Recovery {
  const merchantPays = deal.freightPayer === "merchant";
  const deliverySen = !merchantPays ? 0 : delivery.kind === "complete" ? delivery.sen : null;
  const missing = merchantPays && delivery.kind === "incomplete" ? delivery.missing : [];
  return {
    proceedsSen: deal.priceSen,
    deliverySen,
    packingSen: deal.packingSen,
    netSen: deliverySen == null ? null : deal.priceSen - deliverySen - deal.packingSen,
    missing,
  };
}
