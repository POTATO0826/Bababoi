import { useMutation, usePaginatedQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { run } from "@/convex";
import { showOnMap } from "@/actions";
import { Badge } from "@/components/ui/badge";
import type { Deal } from "@/ledger";
import { fmtRM } from "@/domain/money";
import { actorNow, setWare, useWare } from "@/store";
import { DEAL_STATUS, isOpenDeal } from "@/workflow";
import { LalamoveCard } from "@/components/delivery/lalamove-connection";
import { localDemo } from "@/identity";
import { missingFields } from "@/domain/deal";
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
  const [creating, setCreating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const history = usePaginatedQuery(api.ledger.dealHistory, showHistory && view === "deals" ? {} : "skip", { initialNumItems: 20 });
  const v = VIEW[view];
  // Delivery lists only deals ready for quotes; the rest appear under "Needs details before quoting".
  const deals = (ledger?.deals ?? []).filter((d) => (!v.only || v.only.includes(d.status)) && (view !== "delivery" || (missingFields(d).length === 0 && !!d.cargo)));
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
    <WorkColumn title={v.title} className={className} aside={view === "deals" && <Button variant="quiet" size="xs" onClick={() => setShowHistory(!showHistory)}>{showHistory ? "Current work" : "All history"}</Button>} action={view === "deals" && role === "owner" && <Button variant="outline" onClick={() => setCreating(!creating)}>Start sale from stock</Button>}>
      {creating && <NewSale onDone={() => setCreating(false)} />}
      {showHistory && view === "deals" ? <WorkList label="All deals" count={history.results.length}>
        {history.results.map(row)}
        {history.status === "LoadingFirstPage" && <NothingHere title="Loading deal history…" />}
        {history.status === "Exhausted" && !history.results.length && <NothingHere title="No deal history" />}
        {(history.status === "CanLoadMore" || history.status === "LoadingMore") && <Button size="sm" variant="outline" className="m-3" disabled={history.status === "LoadingMore"} onClick={() => history.loadMore(20)}>{history.status === "LoadingMore" ? "Loading…" : "Load more deals"}</Button>}
      </WorkList> : <>
        {view === "delivery" && localDemo && <LalamoveCard />}
        <WorkList label={view === "deals" ? "Open" : view === "delivery" ? "Ready for quotes" : undefined} count={open.length}>{open.map(row)}{!open.length && view !== "delivery" && <NothingHere title={v.empty} />}{!open.length && view === "delivery" && <DeliveryGuide onStart={() => setCreating(true)} canStart={role === "owner"} />}</WorkList>
        {view === "delivery" && <NeedsDetails />}
        {view === "delivery" && creating && <NewSale onDone={() => setCreating(false)} />}
        {done.length > 0 && <WorkList label="Done">{done.map(row)}</WorkList>}
      </>}
    </WorkColumn>
  );
}

/** What a delivery quote needs, and where to start, when no deal is ready yet. */
function DeliveryGuide({ onStart, canStart }: { onStart: () => void; canStart: boolean }) {
  return <div className="flex flex-col gap-2 border-t border-border-inner px-3.5 py-3 text-[12px]">
    <span className="text-[13px] font-medium">No deal is ready for delivery quotes yet</span>
    <span className="text-muted-foreground">A quote needs a sale of real stock with:</span>
    <ul className="ml-4 list-disc text-muted-foreground"><li>the stock batch and quantity</li><li>buyer name and agreed price</li><li>destination address with coordinates, confirmed with the buyer</li><li>a future collection time and delivery access (floor, lift)</li><li>confirmed package sizes and weights (from receiving, or measured)</li></ul>
    {canStart ? <Button size="sm" variant="outline" className="self-start" onClick={onStart}>Start sale from stock</Button> : <span className="text-muted-foreground">Ask the owner to start a sale from stock.</span>}
  </div>;
}

/** Open sales that are not ready for quotes yet, with what each still needs. */
function NeedsDetails() {
  const ledger = useWare((s) => s.ledger);
  const pending = (ledger?.deals ?? []).filter((d) => d.status === "finding_buyer" || (["offer_ready", "rejected", "pending_approval"].includes(d.status) && (missingFields(d).length > 0 || !d.cargo)));
  if (!pending.length) return null;
  const skus = new Map(ledger?.skus.map((s) => [s.code, s]));
  return <WorkList label="Needs details before quoting" count={pending.length}>{pending.map((d) => {
    const sku = skus.get(d.skuCode);
    const missing = [...missingFields(d), ...(d.cargo ? [] : ["Shipment measurements"])];
    return <WorkRow key={d._id} title={sku ? `${sku.model} · ${sku.variant}` : d.skuCode} sub={`${d.code} · needs ${missing.join(", ")}`} onClick={() => openDeal(d, ledger?.batches.find((b) => b._id === d.batchId)?.locations[0]?.slot)} aside={<Badge variant="warn">{missing.length} to do</Badge>} />;
  })}</WorkList>;
}

function NewSale({ onDone }: { onDone: () => void }) {
  const ledger = useWare((s) => s.ledger);
  const staff = useWare((s) => s.staff);
  const create = useMutation(api.deals.create);
  const [batchId, setBatchId] = useState("");
  const [assignee, setAssignee] = useState(staff?.name ?? "");
  const [busy, setBusy] = useState(false);
  const batches = (ledger?.batches ?? []).filter((b) => b.status === "active" && !ledger?.deals.some((d) => d.batchId === b._id && isOpenDeal(d)));
  const free = (id: string, qty: number) => qty - (ledger?.reservations ?? []).filter((r) => r.batchId === id && r.status === "active").reduce((sum, r) => sum + r.qty, 0);
  const available = batches.filter((b) => free(b._id, b.locations.reduce((sum, p) => sum + p.qty, 0)) > 0);
  return <div className="flex flex-col gap-2 border-b border-border p-3.5"><span className="text-[12px] text-muted-foreground">Choose a real stock batch to prepare a buyer offer.</span><Select value={batchId} disabled={busy} onValueChange={setBatchId}><SelectTrigger className="w-full"><SelectValue placeholder="Choose stock batch" /></SelectTrigger><SelectContent>{available.map((b) => <SelectItem key={b._id} value={b._id}>{b.code} · {b.skuCode} · {free(b._id, b.locations.reduce((sum, p) => sum + p.qty, 0))} free</SelectItem>)}</SelectContent></Select><label className="text-[12px]">Person managing this sale<Input value={assignee} disabled={busy} onChange={(e) => setAssignee(e.target.value)} /></label>{!available.length && <span className="text-[12px] text-warn">No unallocated batches are available. Receive stock or open an existing sale.</span>}<div className="flex gap-2"><Button size="sm" disabled={!batchId || !assignee.trim() || busy} onClick={async () => { const batch = available.find((b) => b._id === batchId); if (!batch) return; setBusy(true); try { const id = await run(create({ actor: actorNow(), batchId: batchId as Id<"batches">, assignee }), "Sale started"); if (id) { onDone(); openDeal({ _id: id, skuCode: batch.skuCode, batchId: batch._id }, batch.locations[0]?.slot); } } finally { setBusy(false); } }}>Start sale</Button><Button size="sm" variant="outline" disabled={busy} onClick={onDone}>Cancel</Button></div></div>;
}
