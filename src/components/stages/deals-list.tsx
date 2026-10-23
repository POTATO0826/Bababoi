import { showOnMap } from "@/actions";
import { Badge } from "@/components/ui/badge";
import type { Deal } from "@/ledger";
import { fmtRM } from "@/domain/money";
import { setWare, useWare } from "@/store";
import { DEAL_STATUS, isOpenDeal } from "@/workflow";
import { NothingHere, WorkColumn, WorkList, WorkRow } from "./work-column";

export function openDeal(d: Pick<Deal, "_id" | "skuCode" | "batchId">, slot?: string) {
  setWare({ detail: { kind: "deal", id: d._id } });
  showOnMap(d.skuCode, slot);
}

type DealView = "deals" | "delivery" | "approve" | "collect";

const VIEW: Record<DealView, { title: string; only?: Deal["status"][]; empty: string }> = {
  deals: { title: "Deals", empty: "No open deals" },
  delivery: { title: "Delivery", only: ["offer_ready", "rejected", "pending_approval"], empty: "No deals need quotes" },
  approve: { title: "Approvals", only: ["pending_approval"], empty: "Nothing to approve" },
  collect: { title: "Collection", only: ["approved"], empty: "Nothing to collect" },
};

export function DealsList({ view = "deals", className }: { view?: DealView; className?: string }) {
  const ledger = useWare((s) => s.ledger);
  const role = useWare((s) => s.role);
  const detail = useWare((s) => s.detail);
  const v = VIEW[view];
  const deals = (ledger?.deals ?? []).filter((d) => !v.only || v.only.includes(d.status));
  const skus = new Map(ledger?.skus.map((s) => [s.code, s]));
  const mine = (d: Deal) => DEAL_STATUS[d.status].turn === role;
  const open = deals.filter(isOpenDeal).sort((a, b) => Number(mine(b)) - Number(mine(a)) || b.updatedAt - a.updatedAt);
  const done = view === "deals" ? deals.filter((d) => !isOpenDeal(d)).slice(0, 6) : [];

  const row = (d: Deal) => {
    const sku = skus.get(d.skuCode);
    const st = DEAL_STATUS[d.status];
    const batch = ledger?.batches.find((b) => b._id === d.batchId);
    return (
      <WorkRow
        key={d._id}
        title={sku ? `${sku.model} · ${sku.variant}` : d.skuCode}
        sub={`${d.code} · ${d.buyer?.name ?? d.assignee} · ${d.qty} × · ${fmtRM(d.priceSen)}`}
        active={detail?.id === d._id}
        mine={mine(d)}
        onClick={() => openDeal(d, batch?.locations[0]?.slot)}
        aside={<Badge variant={st.tone}>{st.label}</Badge>}
      />
    );
  };

  return (
    <WorkColumn title={v.title} className={className}>
      <WorkList label={view === "deals" ? "Open" : undefined} count={open.length}>
        {open.map(row)}
        {!open.length && <NothingHere title={v.empty} />}
      </WorkList>
      {done.length > 0 && <WorkList label="Done">{done.map(row)}</WorkList>}
    </WorkColumn>
  );
}
