import { useMutation, useQuery } from "convex/react";
import { FileTextIcon, ImageIcon, PlusIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { SLOT_BY_ID } from "@/data/layout";
import { errorText, run } from "@/convex";
import { slotCode } from "@/domain/stock";
import { cn } from "@/lib/utils";
import { shrink, uploadTo } from "@/scan";
import { actorNow, useWare } from "@/store";
import { DetailShell, Section } from "./detail-shell";
import { History } from "./deal-detail";
import { DictateButton } from "./dictate";

type Line = Doc<"receipts">["lines"][number];
const localDate = (at: number) => {
  const date = new Date(at);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

export function ReceiptDetail({ id }: { id: string }) {
  const r = useQuery(api.receiving.get, { receiptId: id as Id<"receipts"> });
  const role = useWare((s) => s.role);
  const ledger = useWare((s) => s.ledger);
  const genUrl = useMutation(api.receiving.generateUploadUrl);
  const addEvidence = useMutation(api.receiving.addEvidence);
  const saveLines = useMutation(api.receiving.saveLines);
  const saveDetails = useMutation(api.receiving.saveDetails);
  const post = useMutation(api.receiving.post);
  const reject = useMutation(api.receiving.reject);
  const extract = useMutation(api.receiving.requestExtraction);
  const [lines, setLines] = useState<Line[]>([]);
  const [supplier, setSupplier] = useState("");
  const [docRef, setDocRef] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const loaded = useRef<{ id: string; version: number } | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const documentRef = useRef<HTMLInputElement>(null);

  const reload = () => {
    if (!r) return;
    loaded.current = { id, version: r.version ?? 1 };
    setLines(r.lines);
    setSupplier(r.supplier ?? "");
    setDocRef(r.docRef ?? "");
    setReceivedAt(r.receivedAt ? localDate(r.receivedAt) : "");
    setDirty(false);
    setConflict(false);
  };

  useEffect(() => {
    if (!r || busy) return;
    if (loaded.current?.id !== id) { reload(); return; }
    const remoteVersion = r.version ?? 1;
    if (remoteVersion < loaded.current.version) return;
    if (dirty) {
      if (remoteVersion > loaded.current.version) setConflict(true);
    } else reload();
  }, [r, id, dirty, busy]);

  if (!r) return null;
  const open = r.status === "needs_review";
  const canEdit = open && (role === "warehouse" || role === "owner");
  const editable = canEdit && !busy && !conflict;
  const reading = r.extraction.status === "running";
  const skus = ledger?.skus ?? [];
  const occupied = new Set((ledger?.batches ?? []).filter((b) => b.status === "active").flatMap((b) => b.locations.map((l) => l.slot)));
  const allSlots = [...SLOT_BY_ID.keys()];
  const edit = (i: number, patch: Partial<Line>) => {
    setDirty(true);
    setLines((ls) => ls.map((l, j) => j === i ? { ...l, verified: false, ...patch, source: "staff" } : l));
  };

  // Chain returned versions so a later write never depends on subscription timing.
  const persist = async (): Promise<number | undefined> => {
    const base = loaded.current;
    if (!base || conflict || (r.version ?? 1) > base.version) {
      setConflict(true);
      return undefined;
    }
    if (!dirty) return base.version;
    const at = new Date(receivedAt).getTime();
    if (!Number.isFinite(at)) { toast.error("Enter the actual received date and time"); return undefined; }
    const detailVersion = await run(saveDetails({ actor: actorNow(), receiptId: r._id, expectedVersion: base.version, supplier, docRef, receivedAt: at }));
    if (detailVersion === undefined) return undefined;
    loaded.current = { id, version: detailVersion };
    const lineVersion = await run(saveLines({ actor: actorNow(), receiptId: r._id, expectedVersion: detailVersion, lines }));
    if (lineVersion === undefined) { setConflict(true); return undefined; }
    loaded.current = { id, version: lineVersion };
    setDirty(false);
    return lineVersion;
  };

  const save = async () => {
    setBusy(true);
    try { await persist(); } finally { setBusy(false); }
  };
  const onEvidence = async (kind: "photo" | "document" | "voice", evidence: { storageId?: Id<"_storage">; text?: string; mime?: string }) => {
    const version = await persist();
    if (version === undefined) return;
    const next = await run(addEvidence({ actor: actorNow(), receiptId: r._id, expectedVersion: version, kind, ...evidence }));
    if (next !== undefined) loaded.current = { id, version: next };
  };
  const onFile = async (f: File | undefined, kind: "photo" | "document") => {
    if (!f) return;
    setBusy(true);
    try {
      const url = await genUrl({ actor: actorNow() });
      const blob = await shrink(f);
      const storageId = await uploadTo(url, blob);
      await onEvidence(kind, { storageId, mime: blob.type || f.type });
    } catch (e) { toast.error(errorText(e)); }
    finally { setBusy(false); }
  };
  const ready = !!receivedAt && lines.length > 0 && lines.every((l) => {
    const sku = skus.find((s) => s.code === l.skuCode);
    const allocations = l.locations ?? [];
    return sku && Number.isSafeInteger(l.qty) && l.qty! > 0 && l.verified && l.condition.trim().toLowerCase() === "good"
      && allocations.length > 0 && allocations.reduce((sum, p) => sum + p.qty, 0) === l.qty
      && allocations.every((p) => SLOT_BY_ID.has(p.slot) && !occupied.has(p.slot) && Number.isSafeInteger(p.qty) && p.qty > 0 && p.qty <= sku.cap);
  }) && new Set(lines.flatMap((l) => (l.locations ?? []).map((p) => p.slot))).size === lines.flatMap((l) => l.locations ?? []).length;

  return <DetailShell title={r.docRef ?? r.code} sub={[r.code, r.supplier].filter(Boolean).join(" · ")}
    badges={<><Badge variant={open ? "warn" : r.status === "posted" ? "ok" : "tag"}>{open ? "To verify" : r.status === "posted" ? "Posted" : "Rejected"}</Badge><Badge variant="tag">v{r.version ?? 1}</Badge>{r.synthetic && <Badge variant="tag">Synthetic</Badge>}</>}
    footer={canEdit && <><Button disabled={!ready || busy || conflict} onClick={async () => {
      setBusy(true);
      try { const version = await persist(); if (version !== undefined) await run(post({ actor: actorNow(), receiptId: r._id, expectedVersion: version }), "Posted to stock"); }
      finally { setBusy(false); }
    }}>{busy && <Spinner data-icon="inline-start" />}Post counted stock</Button><RejectReceipt disabled={busy || dirty || conflict} onReject={async (reason) => { setBusy(true); try { await run(reject({ actor: actorNow(), receiptId: r._id, expectedVersion: loaded.current?.version ?? r.version ?? 1, reason })); } finally { setBusy(false); } }} /></>}
  >
    {conflict && <div role="alert" className="flex flex-col gap-2 rounded-md border border-warn/40 p-3 text-[12.5px]"><span>This receipt changed while you were editing. Your unsaved edits are still shown. Reload the latest receipt before continuing; reloading discards these edits.</span><Button size="sm" variant="outline" onClick={reload} disabled={busy}>Reload latest receipt</Button></div>}
    <Section label="Arrival details">{open && (!supplier.trim() || !docRef.trim()) && <span className="text-[12px] text-warn">Supplier or document reference is missing. Record both when available so duplicate deliveries can be checked.</span>}<div className="grid gap-2"><label className="text-[12px]">Supplier<Input value={supplier} disabled={!editable} onChange={(e) => { setSupplier(e.target.value); setDirty(true); }} placeholder="Supplier name" /></label><label className="text-[12px]">Supplier document reference<Input value={docRef} disabled={!editable} onChange={(e) => { setDocRef(e.target.value); setDirty(true); }} placeholder="Delivery note / invoice" /></label><label className="text-[12px]">Actual received date and time<Input type="datetime-local" value={receivedAt} disabled={!editable} onChange={(e) => { setReceivedAt(e.target.value); setDirty(true); }} /></label></div></Section>
    <Section label="Evidence" aside={canEdit && <div className="flex gap-1"><Button variant="quiet" size="icon-xs" title="Photo" disabled={!editable} onClick={() => photoRef.current?.click()}><ImageIcon /></Button><Button variant="quiet" size="icon-xs" title="Document" disabled={!editable} onClick={() => documentRef.current?.click()}><FileTextIcon /></Button><DictateButton disabled={!editable} onText={async (text, storageId) => { setBusy(true); try { await onEvidence("voice", { text, ...(storageId ? { storageId } : {}) }); } finally { setBusy(false); } }} /></div>}>
      <input ref={photoRef} type="file" hidden accept="image/*" capture="environment" onChange={(e) => { void onFile(e.target.files?.[0], "photo"); e.target.value = ""; }} />
      <input ref={documentRef} type="file" hidden accept="image/*,application/pdf" onChange={(e) => { void onFile(e.target.files?.[0], "document"); e.target.value = ""; }} />
      <div className="flex flex-wrap gap-2">{r.evidence.map((e, i) => <EvidenceView key={i} evidence={e} />)}{busy && <Spinner />}{!r.evidence.length && !busy && <span className="text-[12.5px] text-faint">Add a photo, document or voice note</span>}</div>
      {canEdit && r.evidence.length > 0 && <Button variant="outline" size="sm" disabled={reading || !editable} onClick={async () => { setBusy(true); try { const version = await persist(); if (version !== undefined) { const next = await run(extract({ actor: actorNow(), receiptId: r._id, expectedVersion: version })); if (next != null) loaded.current = { id, version: next }; } } finally { setBusy(false); } }}>{reading ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}{reading ? "Reading…" : "Read with AI"}</Button>}
      {r.extraction.status === "error" && <span className="text-[12px] text-dispatch">{r.extraction.error ?? "Couldn't read. Enter the counted lines manually."}</span>}
    </Section>
    <Section label="Count and bay allocations" aside={canEdit && <Button variant="quiet" size="xs" disabled={!editable || lines.length >= 30} onClick={() => { setDirty(true); setLines((ls) => [...ls, { key: crypto.randomUUID(), rawText: "Added by staff", skuCode: null, candidates: [], qty: null, condition: "good", confidence: 1, questions: [], verified: false, source: "staff" }]); }}><PlusIcon data-icon="inline-start" />Line</Button>}>
      {lines.map((l, i) => {
        const sku = skus.find((s) => s.code === l.skuCode);
        const locs = l.locations ?? [];
        const otherUsed = new Set(lines.flatMap((row, index) => index === i ? [] : (row.locations ?? []).map((p) => p.slot)));
        const orders = (ledger?.purchaseOrders ?? []).filter((po) => po.skuCode === l.skuCode && po.status === "open");
        return <div key={l.key} className={cn("flex flex-col gap-2 rounded-md border border-border p-2.5", l.verified && "border-ok/40")}>
          <div className="flex items-center justify-between gap-2"><span className="truncate text-[12px] text-muted-foreground">{l.rawText}</span>{l.source === "ai" && <Badge variant="tag">AI {Math.round(l.confidence * 100)}%</Badge>}</div>
          <div className="flex gap-2"><Select value={l.skuCode ?? ""} onValueChange={(value) => edit(i, { skuCode: value, purchaseOrderId: undefined, locations: [] })} disabled={!editable}><SelectTrigger size="sm" className="min-w-0 flex-1"><SelectValue placeholder="Pick SKU" /></SelectTrigger><SelectContent>{skus.map((s) => <SelectItem key={s.code} value={s.code}>{s.model} · {s.variant} · {s.code}</SelectItem>)}</SelectContent></Select><Input type="number" min={1} step={1} aria-label={`Line ${i + 1} counted units`} value={l.qty ?? ""} onChange={(e) => edit(i, { qty: e.target.value === "" ? null : Number(e.target.value) })} disabled={!editable} className="h-8 w-20 font-mono" placeholder="Qty" />{canEdit && <Button variant="quiet" size="icon-sm" aria-label="Remove line" disabled={!editable} onClick={() => { setDirty(true); setLines((ls) => ls.filter((_, j) => j !== i)); }}><Trash2Icon /></Button>}</div>
          <label className="text-[12px]">Condition<Input value={l.condition} disabled={!editable} onChange={(e) => edit(i, { condition: e.target.value })} /></label>
          <Select value={l.purchaseOrderId ?? "none"} disabled={!editable || !l.skuCode} onValueChange={(value) => edit(i, { purchaseOrderId: value === "none" ? undefined : value as Id<"purchaseOrders"> })}><SelectTrigger size="sm" className="w-full"><SelectValue placeholder="Purchase order" /></SelectTrigger><SelectContent><SelectItem value="none">No purchase order linked</SelectItem>{orders.map((po) => <SelectItem key={po._id} value={po._id}>{po.code} · {po.qty - po.qtyReceived} outstanding{po.supplier ? ` · ${po.supplier}` : ""}</SelectItem>)}</SelectContent></Select>
          <span className="text-[11.5px] text-muted-foreground">Assign the actual counted bays{sku ? ` · up to ${sku.cap} units per bay` : ""}</span>
          {locs.map((p, j) => <div key={j} className="flex gap-2"><Select value={p.slot} disabled={!editable} onValueChange={(value) => edit(i, { locations: locs.map((x, index) => index === j ? { ...x, slot: value } : x) })}><SelectTrigger size="sm" className="min-w-0 flex-1"><SelectValue placeholder="Choose bay" /></SelectTrigger><SelectContent>{allSlots.filter((slot) => slot === p.slot || (!occupied.has(slot) && !otherUsed.has(slot) && !locs.some((x) => x.slot === slot))).map((slot) => <SelectItem key={slot} value={slot}>{slotCode(slot)}{occupied.has(slot) ? " · occupied" : ""}</SelectItem>)}</SelectContent></Select><Input type="number" min={1} max={sku?.cap} step={1} value={p.qty} aria-label={`Units in ${slotCode(p.slot)}`} disabled={!editable} className="h-8 w-20 font-mono" onChange={(e) => edit(i, { locations: locs.map((x, index) => index === j ? { ...x, qty: Number(e.target.value) } : x) })} /><Button size="icon-sm" variant="quiet" aria-label="Remove bay" disabled={!editable} onClick={() => edit(i, { locations: locs.filter((_, index) => index !== j) })}><Trash2Icon /></Button></div>)}
          {canEdit && <Button size="xs" variant="outline" disabled={!editable || !sku} onClick={() => { const slot = allSlots.find((s) => !occupied.has(s) && !otherUsed.has(s) && !locs.some((p) => p.slot === s)); if (!slot) { toast.error("No empty bays available"); return; } edit(i, { locations: [...locs, { slot, qty: Math.min(sku!.cap, Math.max(1, (l.qty ?? 1) - locs.reduce((sum, p) => sum + p.qty, 0))) }] }); }}>Add bay</Button>}
          <span className="font-mono text-[11.5px] text-muted-foreground">{locs.reduce((sum, p) => sum + p.qty, 0)} / {l.qty ?? "?"} allocated</span>
          {l.questions.map((q) => <span key={q} className="text-[11.5px] text-warn">{q}</span>)}
          <label className="flex items-center gap-2 text-[12.5px]"><Checkbox checked={l.verified} disabled={!editable} onCheckedChange={(value) => edit(i, { verified: value === true })} />Counted goods and bay locations checked</label>
        </div>;
      })}
      {!lines.length && <span className="text-[12.5px] text-faint">No lines yet. Add a counted line or read attached evidence.</span>}
      {dirty && canEdit && <Button variant="outline" size="sm" disabled={busy || conflict} onClick={() => void save()}>Save receipt</Button>}
      {r.rejectReason && <span className="text-[12px] text-dispatch">{r.rejectReason}</span>}
    </Section><History entity={`receipt:${r._id}`} />
  </DetailShell>;
}

function RejectReceipt({ onReject, disabled }: { onReject: (reason: string) => Promise<void>; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return open ? <div className="flex gap-2"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why reject?" className="h-8" disabled={disabled} /><Button size="sm" variant="outline" disabled={disabled || !reason.trim()} onClick={() => void onReject(reason)}>Reject</Button></div> : <Button variant="quiet" size="sm" className="text-muted-foreground" disabled={disabled} onClick={() => setOpen(true)}>Reject</Button>;
}

function EvidenceView({ evidence: e }: { evidence: Doc<"receipts">["evidence"][number] & { url: string | null } }) {
  if (e.url && e.kind === "voice") return <div className="flex w-full min-w-0 flex-col gap-1 rounded-md border border-border p-2 text-[12px]"><span>{e.text || "Original voice recording · no transcript available"}</span><audio controls preload="none" src={e.url} className="h-9 w-full" aria-label="Original receiving voice evidence" /></div>;
  if (e.url && e.mime?.startsWith("image/")) return <a href={e.url} target="_blank" rel="noreferrer"><img src={e.url} alt="Receipt evidence" className="size-16 rounded-md border border-border object-cover" /></a>;
  return <span className="max-w-full rounded-md border border-border px-2 py-1.5 text-[12px] text-text-2">{e.text ?? (e.url ? <a href={e.url} target="_blank" rel="noreferrer" className="underline">Document</a> : e.kind)}</span>;
}
