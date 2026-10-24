import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@convex/_generated/api";
import { toSkuRecords } from "@/domain/stock";
import { DAY } from "@/domain/types";
import { setWare } from "@/store";

const HISTORY_DAYS = 95;

/** Mirrors the Convex ledger into the store so the 3D scene and lists keep reading `skus`. */
export function LedgerSync({ owner }: { owner: boolean }) {
  // Day-bucketed so the query args stay stable (queries can't read the clock themselves).
  const [day, setDay] = useState(() => Math.floor(Date.now() / DAY));
  useEffect(() => {
    const t = setInterval(() => setDay(Math.floor(Date.now() / DAY)), 60_000);
    return () => clearInterval(t);
  }, []);
  const snap = useQuery(api.ledger.snapshot, { since: (day - HISTORY_DAYS) * DAY });
  const ensure = useMutation(api.access.ensureBusinessSettings);
  const asked = useRef(false);

  useEffect(() => {
    if (snap === null && owner && !asked.current) {
      asked.current = true;
      void ensure({});
    }
  }, [snap, owner, ensure]);

  const skus = useMemo(() => (snap ? toSkuRecords(snap, Date.now()) : null), [snap]);

  useEffect(() => {
    if (!snap || !skus) return;
    setWare((s) => ({
      ledger: snap,
      skus,
      ledgerReady: true,
      settings: { ...s.settings, lowStockThreshold: snap.settings.lowStockThreshold },
      selected: s.selected && skus.some((r) => r.sku === s.selected && r.onHand > 0) ? s.selected : null,
    }));
  }, [snap, skus]);

  return null;
}
