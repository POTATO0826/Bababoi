import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { showOnMap } from "@/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { run } from "@/convex";
import { fmtRM, sen } from "@/domain/money";
import { cn } from "@/lib/utils";
import { actorNow, setWare, useWare } from "@/store";
import { usePlan, useSuggestions, type ReplenishRow } from "@/workflow";
import { NothingHere, WorkColumn, WorkList } from "./work-column";

const localNow = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

export function ReplenishList({ className }: { className?: string }) {
  const rows = useSuggestions();
  const plan = usePlan();
  const ledger = useWare((s) => s.ledger);
  const insufficient = (plan?.rows ?? []).filter((r) => r.s.status === "insufficient" && (r.netSales > 0 || r.priority !== null));
  const role = useWare((s) => s.role);
  const [entry, setEntry] = useState<{ code?: string; qty?: number; rationale?: string } | null>(null);
  const rule = ledger?.settings.replenish;
  const orders = ledger?.purchaseOrders ?? [];
  return <WorkColumn title="Replenish" className={className}
    aside={rule && <span className="font-mono text-[11px] text-muted-foreground">{rule.coverageDays}-day cover · {fmtRM(rule.budgetSen)}</span>}
    action={role === "owner" && <Button variant="outline" onClick={() => setEntry({})} disabled={!ledger?.skus.length}>Record confirmed purchase</Button>}
  >
    {role === "owner" && !ledger?.skus.length && <div className="p-3.5 text-[12px] text-muted-foreground">Create the real catalogue item before recording a supplier purchase.<Button size="sm" variant="outline" className="mt-2" onClick={() => setWare({ receiveOpen: true })}>Create item</Button></div>}
    {entry && <div className="border-b border-border p-3.5"><PurchaseOrderForm key={`${entry.code ?? "manual"}:${entry.qty ?? ""}`} initial={entry} onDone={() => setEntry(null)} /></div>}
    {orders.length > 0 && <WorkList label="Confirmed incoming" count={orders.length}>{orders.map((po) => <div key={po._id} className="flex flex-col gap-1 border-t border-border-inner px-3.5 py-2.5 text-[12px]"><span className="font-medium">{po.code} · {po.skuCode}</span><span className="text-muted-foreground">{po.supplier ?? "Supplier not recorded"} · {po.orderRef ?? "Reference not recorded"}</span><span className="font-mono text-faint">{po.qty - po.qtyReceived} outstanding / {po.qty} ordered{po.unitCostSen ? ` · ${fmtRM(po.unitCostSen)} / unit` : ""}</span><Button size="xs" variant="quiet" className="self-start" onClick={() => setWare({ stage: "receive" })}>Receive against this order</Button></div>)}</WorkList>}
    {plan && <PlanSummary plan={plan} />}
    <WorkList label="Suggested orders" count={rows.length}>{rows.map((r) => <SuggestionRow key={r.code} row={r} onRecord={() => setEntry({ code: r.code, qty: r.s.suggested, rationale: r.s.lines.join(" | ") })} />)}{!rows.length && <NothingHere title="No reorder suggestions" hint={plan?.commitments.budgetLeftSen === null ? "Remaining budget is unknown; see above." : undefined} />}</WorkList>
    {insufficient.length > 0 && <WorkList label="Not enough data" count={insufficient.length}>{insufficient.map((r) => <div key={r.code} className="flex flex-col gap-0.5 border-t border-border-inner px-3.5 py-2 text-[12px]"><span className="font-medium">{r.title}</span>{r.s.lines.map((l) => <span key={l} className="text-muted-foreground">{l}</span>)}</div>)}</WorkList>}
  </WorkColumn>;
}

function SuggestionRow({ row: r, onRecord }: { row: ReplenishRow; onRecord: () => void }) {
  const role = useWare((s) => s.role);
  const [open, setOpen] = useState(false);
  return <div className={cn("border-t border-border-inner px-3.5 py-2.5 transition-colors", open && "bg-hover-row")}>
    <button className="flex w-full items-center gap-3 text-left" onClick={() => { setOpen(!open); showOnMap(r.code); }}><span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="truncate text-[13.5px] font-medium">{r.title}</span><span className="truncate font-mono text-[11.5px] text-faint">{r.netSales} sold · {r.onHand - r.reserved} free · {r.incoming} in</span></span><span className="flex flex-col items-end gap-0.5"><Badge variant="brand" className="font-mono">+{r.s.suggested}</Badge>{r.s.suggested < r.candidateQty && <span className="font-mono text-[10.5px] text-warn">needs {r.candidateQty}</span>}</span></button>
    {open && <div className="mt-2 flex flex-col gap-2 pl-0.5"><span className="font-mono text-[11px]">Priority {r.priority} · {r.coverDays ?? "?"} days of cover · {fmtRM(r.costSen)} · {r.bays} {r.bays === 1 ? "bay" : "bays"}</span>{r.s.lines.map((l) => <span key={l} className="font-mono text-[11px] text-muted-foreground">{l}</span>)}{role === "owner" && <Button size="sm" onClick={onRecord}>Record confirmed supplier purchase</Button>}</div>}
  </div>;
}

/** What the plan already accounts for, so the totals below can be trusted together. */
function PlanSummary({ plan }: { plan: NonNullable<ReturnType<typeof usePlan>> }) {
  const c = plan.commitments;
  return <div role="status" aria-label="Replenishment plan" className="flex flex-col gap-1 rounded-lg border border-border bg-panel p-3 text-[12px]">
    <span className="text-[11.5px] font-semibold tracking-[.06em] uppercase">Shared limits</span>
    <span className="font-mono text-muted-foreground">Budget {fmtRM(c.budgetSen)} − open orders {c.openOrderSen === null ? "unknown" : fmtRM(c.openOrderSen)} = {c.budgetLeftSen === null ? "unknown" : fmtRM(c.budgetLeftSen)} left</span>
    <span className="font-mono text-muted-foreground">{c.freeBays} free bays − {c.incomingBays} kept for incoming = {c.baysLeft} bays left</span>
    <span className="font-mono">Plan: {plan.totals.units} units · {fmtRM(plan.totals.costSen)} · {plan.totals.bays} bays → {plan.totals.budgetLeftAfterSen === null ? "budget unknown" : `${fmtRM(plan.totals.budgetLeftAfterSen)} left`} · {plan.totals.baysLeftAfter} bays left</span>
    {plan.notes.map((n) => <span key={n} className="text-warn">{n}</span>)}
    <span className="text-faint">Suggestions claim the shared budget and bays in priority order (least cover first), so they fit together. Purchases are recorded by a person.</span>
  </div>;
}

function PurchaseOrderForm({ initial, onDone }: { initial: { code?: string; qty?: number; rationale?: string }; onDone: () => void }) {
  const catalogue = useWare((s) => s.ledger?.skus);
  const skus = catalogue ?? [];
  const create = useMutation(api.replenish.createPO);
  const [code, setCode] = useState(initial.code ?? "");
  const [qty, setQty] = useState(initial.qty ? String(initial.qty) : "");
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [cost, setCost] = useState("");
  const [when, setWhen] = useState(localNow);
  const [rationale, setRationale] = useState(initial.rationale ?? "");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const at = new Date(when).getTime();
  const valid = code && Number.isSafeInteger(Number(qty)) && Number(qty) >= 1 && Number(qty) <= 500 && supplier.trim() && reference.trim() && Number.isFinite(Number(cost)) && Number(cost) > 0 && Number.isFinite(at) && at <= Date.now() && checked;
  return <div className="flex flex-col gap-2.5">
    <span className="text-[13px] font-medium">Record an existing supplier confirmation</span><span className="text-[12px] text-muted-foreground">Place and confirm the order with your supplier first. This records incoming stock; physical stock changes when its receipt is counted and posted.</span>
    <label className="text-[12px]">Catalogue item<Select value={code} disabled={busy} onValueChange={(v) => { setCode(v); setChecked(false); }}><SelectTrigger className="w-full"><SelectValue placeholder="Select SKU" /></SelectTrigger><SelectContent>{skus.map((sku) => <SelectItem key={sku.code} value={sku.code}>{sku.model} · {sku.variant} · {sku.code}</SelectItem>)}</SelectContent></Select></label>
    <div className="grid grid-cols-2 gap-2"><label className="text-[12px]">Confirmed units<Input type="number" min="1" max="500" step="1" value={qty} disabled={busy} onChange={(e) => { setQty(e.target.value); setChecked(false); }} /></label><label className="text-[12px]">Actual unit cost RM<Input type="number" min="0.01" step="0.01" value={cost} disabled={busy} onChange={(e) => { setCost(e.target.value); setChecked(false); }} /></label></div>
    <label className="text-[12px]">Supplier<Input value={supplier} maxLength={200} disabled={busy} onChange={(e) => { setSupplier(e.target.value); setChecked(false); }} /></label><label className="text-[12px]">Confirmed purchase reference<Input value={reference} maxLength={200} disabled={busy} onChange={(e) => { setReference(e.target.value); setChecked(false); }} /></label><label className="text-[12px]">Supplier confirmation date and time<Input type="datetime-local" value={when} disabled={busy} onChange={(e) => { setWhen(e.target.value); setChecked(false); }} /></label><label className="text-[12px]">Purchase notes<Input value={rationale} disabled={busy} onChange={(e) => setRationale(e.target.value)} maxLength={500} /></label><label className="flex items-center gap-2 text-[12px]"><Checkbox checked={checked} disabled={busy} onCheckedChange={(value) => setChecked(value === true)} />I verified the supplier confirmation, quantity and unit cost</label>
    <div className="flex gap-2"><Button size="sm" disabled={!valid || busy} onClick={async () => { setBusy(true); try { const result = await run(create({ actor: actorNow(), skuCode: code, qty: Number(qty), rationale, supplier, orderRef: reference, confirmedAt: at, unitCostSen: sen(Number(cost)), confirmed: checked }), "Confirmed purchase recorded"); if (result !== undefined) onDone(); } finally { setBusy(false); } }}>{busy ? "Saving…" : "Record purchase"}</Button><Button size="sm" variant="outline" disabled={busy} onClick={onDone}>Cancel</Button></div>
  </div>;
}
