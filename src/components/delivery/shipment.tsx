// The shipment behind a delivery quote: stock, packages (with where the measurements came from), route and time.
// Staff confirm or correct the packages; unknown sizes stay unknown and block quotes instead of becoming zero.
import { useAction, useMutation, useQuery } from "convex/react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { run } from "@/convex";
import { localDemo } from "@/identity";
import { fetchLalamoveServices, type Service } from "@/local/lalamove-client";
import { mapsLink, WAREHOUSE } from "@/domain/places";
import { cargoSummary, planCargo, type CargoPlan, type CargoSource, type ConfirmedCargo } from "@/domain/shipment";
import type { Package } from "@/domain/types";
import { actorNow, useWare } from "@/store";
import { Section } from "../detail/detail-shell";

type DealDoc = Doc<"deals">;

/** The cargo plan for a deal, from its confirmed cargo, its batch's receipt, or the catalogue. */
export function useCargoPlan(deal: DealDoc): CargoPlan | null {
  const ledger = useWare((s) => s.ledger);
  const batch = ledger?.batches.find((b) => b._id === deal.batchId);
  const receipt = useQuery(api.receiving.get, batch?.receiptId ? { receiptId: batch.receiptId } : "skip");
  const sku = ledger?.skus.find((s) => s.code === deal.skuCode);
  if (!ledger || (batch?.receiptId && receipt === undefined)) return null;
  return planCargo({ qty: deal.qty, skuCode: deal.skuCode, cargo: (deal.cargo as ConfirmedCargo | undefined) ?? null, catalogue: sku?.packages ?? [], receipt: receipt ? { id: receipt._id, lines: receipt.lines } : null });
}

export type ServicesState =
  | { source: "lalamove" | "cache"; fetchedAt: number; services: Service[] }
  | { source: "live" | "fixture"; services: Service[] }
  | { source: "sample"; services: Service[] }
  | { source: "none"; services: []; error: string };

/** Illustrative vehicle sizes, only when the user explicitly asks for them (never used for quotes). */
export const SAMPLE_VEHICLES: Service[] = [
  { key: "VAN", label: "Van (sample size)", loadKg: 500, lengthCm: 210, widthCm: 120, heightCm: 120, specialRequests: [] },
  { key: "TRUCK330", label: "Lorry 10ft (sample size)", loadKg: 1000, lengthCm: 300, widthCm: 160, heightCm: 160, specialRequests: [] },
  { key: "TRUCK550", label: "Lorry 14ft (sample size)", loadKg: 2000, lengthCm: 420, widthCm: 190, heightCm: 190, specialRequests: [] },
];

/** Vehicle types: local demo → this computer's Lalamove connection; hosted → the backend action. */
export function useDeliveryServices(): [ServicesState | null, (opts?: { refresh?: boolean; sample?: boolean }) => void] {
  const hosted = useAction(api.lalamove.services);
  const connected = useWare((s) => s.lalamove?.connected);
  const [state, setState] = useState<ServicesState | null>(null);
  const load = (opts: { refresh?: boolean; sample?: boolean } = {}) => {
    if (opts.sample) { setState({ source: "sample", services: SAMPLE_VEHICLES }); return; }
    setState(null);
    if (localDemo) void fetchLalamoveServices(!!opts.refresh).then(setState);
    else hosted({}).then(setState, () => setState({ source: "none", services: [], error: "Vehicle types could not be loaded. Try again." }));
  };
  useEffect(() => { load(); }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps
  return [state, load];
}

const SOURCE_BADGE: Record<CargoSource, string> = { receipt: "Measured at receiving", catalogue: "Catalogue · not measured", staff: "Entered by staff" };
const fmtTime = (t?: number) => (t ? new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—");

export function ShipmentSection({ deal, plan }: { deal: DealDoc; plan: CargoPlan | null }) {
  const role = useWare((s) => s.role);
  const ledger = useWare((s) => s.ledger);
  const setCargo = useMutation(api.deals.setCargo);
  const [editing, setEditing] = useState<Package[] | null>(null);
  const batch = ledger?.batches.find((b) => b._id === deal.batchId);
  const canEdit = ["owner", "sales", "warehouse"].includes(role) && ["finding_buyer", "offer_ready", "pending_approval", "rejected"].includes(deal.status);
  useEffect(() => setEditing(null), [deal._id, deal.version]);

  const save = async (packages: Package[], source: CargoSource, ref?: { receiptId?: string; lineKey?: string }) => {
    const r = await run(setCargo({ actor: actorNow(), dealId: deal._id, expectedVersion: deal.version, packages, source, ...(ref?.receiptId ? { receiptId: ref.receiptId as Id<"receipts">, lineKey: ref.lineKey } : {}) }), "Shipment measurements confirmed");
    if (r !== undefined) setEditing(null);
  };

  return (
    <Section label="Shipment" aside={plan && <CargoBadge plan={plan} />}>
      <div className="flex flex-col gap-1 text-[12.5px]">
        <Row k="Stock" v={`${batch?.code ?? "batch"} · ${deal.skuCode} · ${deal.qty} unit${deal.qty === 1 ? "" : "s"}`} />
        <Row k="Pickup" v={<a className="underline-offset-2 hover:underline" href={mapsLink(WAREHOUSE.lat, WAREHOUSE.lng)} target="_blank" rel="noreferrer">{WAREHOUSE.label} · {WAREHOUSE.lat}, {WAREHOUSE.lng}</a>} />
        <Row k="Destination" v={deal.destination ? <a className="underline-offset-2 hover:underline" href={mapsLink(deal.destination.lat, deal.destination.lng)} target="_blank" rel="noreferrer">{deal.destination.label} · {deal.destination.lat}, {deal.destination.lng}{deal.destination.confirmedBy ? "" : " (not confirmed)"}</a> : "Not set"} />
        <Row k="Collection" v={fmtTime(deal.collectAt)} />
      </div>
      {!plan ? <span className="text-[12px] text-muted-foreground">Loading measurements…</span> : editing ? (
        <CargoForm initial={editing} onCancel={() => setEditing(null)} onSave={(p) => void save(p, "staff")} />
      ) : (
        <CargoView plan={plan} canEdit={canEdit} onEdit={(p) => setEditing(p)} onConfirm={(p, source, ref) => void save(p, source, ref)} />
      )}
      <span className="text-[11px] text-faint">Vehicle fit below is a size/weight estimate. Check the actual loading before sending for approval.</span>
    </Section>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-baseline justify-between gap-3"><span className="text-muted-foreground">{k}</span><span className="truncate text-right">{v}</span></div>;
}

function CargoBadge({ plan }: { plan: CargoPlan }) {
  if (plan.status === "confirmed") return <Badge variant="ok">Confirmed · {SOURCE_BADGE[plan.source]}</Badge>;
  if (plan.status === "suggested") return <Badge variant="warn">To confirm · {SOURCE_BADGE[plan.source]}</Badge>;
  if (plan.status === "ambiguous") return <Badge variant="warn">Choose measurements</Badge>;
  return <Badge variant="warn">Measurements unknown</Badge>;
}

function PackagesTable({ perUnit, pieces }: { perUnit: Package[]; pieces: Package[] }) {
  const sum = cargoSummary(pieces);
  return <div className="flex flex-col gap-0.5 font-mono text-[11.5px]">
    {perUnit.map((p, i) => <span key={i}>Package {i + 1}/unit: {p.lCm} × {p.wCm} × {p.hCm} cm · {p.kg} kg</span>)}
    <span className="text-muted-foreground">Shipment: {sum.packages} package{sum.packages === 1 ? "" : "s"} · {sum.totalKg} kg · {sum.volumeM3} m³</span>
  </div>;
}

function CargoView({ plan, canEdit, onEdit, onConfirm }: { plan: CargoPlan; canEdit: boolean; onEdit: (p: Package[]) => void; onConfirm: (p: Package[], source: CargoSource, ref?: { receiptId?: string; lineKey?: string }) => void }) {
  if (plan.status === "confirmed" || plan.status === "suggested") {
    return <div className="flex flex-col gap-1.5 rounded-md border border-border p-2">
      <PackagesTable perUnit={plan.perUnit} pieces={plan.pieces} />
      <span className="text-[11.5px] text-muted-foreground">{plan.note}</span>
      {canEdit && <div className="flex flex-wrap gap-1.5">
        {plan.status === "suggested" && <Button size="xs" onClick={() => onConfirm(plan.perUnit, plan.source, plan.status === "suggested" && plan.source === "receipt" ? { receiptId: plan.receiptId, lineKey: plan.lineKey } : undefined)}>Confirm these measurements</Button>}
        <Button size="xs" variant="outline" onClick={() => onEdit(plan.perUnit)}>Correct measurements</Button>
      </div>}
    </div>;
  }
  if (plan.status === "ambiguous") {
    return <div className="flex flex-col gap-1.5 rounded-md border border-warn/40 p-2 text-[12px]">
      <span>{plan.note}</span>
      {plan.candidates.map((c) => <div key={c.lineKey} className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-muted-foreground">“{c.rawText}” · {c.reason}</span>{canEdit && c.perUnit && <Button size="xs" variant="outline" onClick={() => onConfirm(c.perUnit!, "receipt", { receiptId: plan.receiptId, lineKey: c.lineKey })}>Use this line</Button>}</div>)}
      {canEdit && <div className="flex flex-wrap gap-1.5">{plan.catalogue && <Button size="xs" variant="outline" onClick={() => onEdit(plan.catalogue!)}>Start from catalogue (not measured)</Button>}<Button size="xs" variant="outline" onClick={() => onEdit([{ lCm: 0, wCm: 0, hCm: 0, kg: 0 }])}>Enter measurements</Button></div>}
    </div>;
  }
  return <div className="flex flex-col gap-1.5 rounded-md border border-warn/40 p-2 text-[12px]">
    <span>{plan.note}</span>
    {canEdit && <Button size="xs" variant="outline" className="self-start" onClick={() => onEdit([{ lCm: 0, wCm: 0, hCm: 0, kg: 0 }])}>Enter measurements</Button>}
  </div>;
}

const FIELDS = [["lCm", "L cm"], ["wCm", "W cm"], ["hCm", "H cm"], ["kg", "kg"]] as const;
const parse = (t: string) => (/^\d+(\.\d+)?$/.test(t.trim()) && Number(t) > 0 ? Number(t) : null);

/** Packages of ONE unit. Every value must be a positive number; blanks block saving instead of becoming zero. */
function CargoForm({ initial, onSave, onCancel }: { initial: Package[]; onSave: (p: Package[]) => void; onCancel: () => void }) {
  const [rows, setRows] = useState(initial.map((p) => Object.fromEntries(FIELDS.map(([k]) => [k, p[k] > 0 ? String(p[k]) : ""])) as Record<(typeof FIELDS)[number][0], string>));
  const parsed = rows.map((r) => Object.fromEntries(FIELDS.map(([k]) => [k, parse(r[k])])) as Record<(typeof FIELDS)[number][0], number | null>);
  const complete = parsed.length > 0 && parsed.every((p) => FIELDS.every(([k]) => p[k] !== null));
  return <div className="flex flex-col gap-1.5 rounded-md border border-border p-2">
    <span className="text-[11.5px] text-muted-foreground">Packages of one unit, as measured (cm, kg). Every value is required; measure anything unknown.</span>
    {rows.map((r, i) => <div key={i} className="grid grid-cols-[repeat(4,minmax(0,1fr))_auto] gap-1">
      {FIELDS.map(([k, label]) => <Input key={k} inputMode="decimal" aria-label={`Package ${i + 1} ${label}`} placeholder={label} value={r[k]} aria-invalid={r[k] !== "" && parsed[i]![k] === null} className="h-7 font-mono text-[12px]" onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />)}
      <Button size="icon-sm" variant="quiet" aria-label={`Remove package ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}><Trash2Icon /></Button>
    </div>)}
    <div className="flex flex-wrap gap-1.5">
      <Button size="xs" variant="quiet" disabled={rows.length >= 20} onClick={() => setRows((rs) => [...rs, { lCm: "", wCm: "", hCm: "", kg: "" }])}><PlusIcon data-icon="inline-start" />Package</Button>
      <Button size="xs" disabled={!complete} onClick={() => onSave(parsed as Package[])}>Save measurements</Button>
      <Button size="xs" variant="outline" onClick={onCancel}>Cancel</Button>
    </div>
    {!complete && <span className="text-[11.5px] text-warn">Enter a positive length, width, height and weight for every package.</span>}
  </div>;
}
