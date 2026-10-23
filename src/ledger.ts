// Small selectors over the Convex snapshot mirrored in the store.
import { useWare, type Snapshot } from "@/store";

export type Receipt = Snapshot["receipts"][number];
export type Deal = Snapshot["deals"][number];

/** The receipt waiting at the inbound dock (drawn on Floor 1), if any. */
export function inboundOf(ledger: Snapshot | null) {
  const r = ledger?.receipts.find((x) => x.status === "needs_review");
  if (!r) return null;
  const qty = r.lines.reduce((a, l) => a + (l.qty ?? 0), 0);
  return { receipt: r, qty: Math.min(Math.max(qty, 1), 4) };
}

export function useInbound() {
  return inboundOf(useWare((s) => s.ledger));
}
