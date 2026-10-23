// Receiving review: a small drawer for checking a delivery against the goods, choosing bays and posting.
// Editing saves a draft (no stock change). Only "Confirm receipt" posts, with an explicit goods check,
// the reviewed version and an idempotency key. The server re-validates everything.
import { CheckCircle2Icon, PlusIcon, ScanLineIcon, Trash2Icon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { closeReceiving, openReceiving, selectSku } from "@/actions";
import { CardHeading, Kicker } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, api, newIdempotencyKey } from "@/lib/api";
import { skuTitle, type Inventory, type LocationView } from "@/lib/inventory";
import { cn } from "@/lib/utils";
import { canConfirmStock, refreshSnapshot, useInventory, useServerData } from "@/server-data";
import {
  BASE_UNITS,
  IDEMPOTENCY_HEADER,
  type BaseUnit,
  type PostReceivingResult,
  type Receiving,
  type ReceivingIssue,
  type ReceivingLineInput,
  type ReceivingSummary,
} from "@/shared/contracts";
import { localTime } from "@/shared/time";
import { useWare } from "@/store";
import { receiptLoadDecision } from "./load-policy";

const fieldCls =
  "h-8 w-full min-w-0 rounded-md border border-input bg-input/30 px-2 text-[12.5px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60";

export function ReceivingDrawer() {
  const open = useWare((s) => s.receivingOpen);
  const id = useWare((s) => s.receivingId);
  if (!open) return null;
  return (
    <aside
      aria-label="Receiving review"
      className="fixed top-16 right-3 bottom-3 z-30 flex w-[min(420px,calc(100vw-24px))] animate-slide-in flex-col overflow-hidden rounded-lg border border-border-strong bg-panel shadow-[0_16px_40px_rgba(0,0,0,.6)]"
    >
      <div className="flex items-center justify-between border-b border-border py-2.5 pr-2.5 pl-3.5">
        <span className="flex items-center gap-2">
          <ScanLineIcon className="size-4 text-warn" />
          <CardHeading>Receiving review</CardHeading>
        </span>
        <Button variant="quiet" size="icon-xs" onClick={closeReceiving} aria-label="Close receiving review" className="size-[26px]">
          <XIcon />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{id ? <DraftView key={id} id={id} /> : <DraftList />}</div>
    </aside>
  );
}

// ── List ──────────────────────────────────────────────────────────────────

function DraftList() {
  const inv = useInventory();
  const role = useServerData((s) => s.session?.user.role);
  const epoch = useServerData((s) => s.historyEpoch);
  const [posted, setPosted] = useState<ReceivingSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canCreate = role === "warehouse" || role === "owner";

  useEffect(() => {
    let live = true;
    api<ReceivingSummary[]>("GET", "/receivings?status=posted")
      .then((r) => live && setPosted(r.data.slice(0, 5)))
      .catch(() => live && setPosted(null));
    return () => {
      live = false;
    };
  }, [epoch]);

  const createDraft = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<Receiving>("POST", "/receivings", { supplierRef: null, documentRef: null, lines: [] });
      await refreshSnapshot();
      openReceiving(r.data.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create a draft.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-3.5">
      <div>
        <Kicker className="mb-2 block">Awaiting verification</Kicker>
        {!inv && <div className="text-xs text-faint">Ledger not loaded.</div>}
        {inv?.pending.map((r) => (
          <button
            key={r.id}
            onClick={() => openReceiving(r.id)}
            className="mb-1.5 flex w-full items-center gap-2.5 rounded-md border border-warn/30 bg-warn/6 px-2.5 py-[9px] text-left transition-colors hover:bg-warn/10"
          >
            <ScanLineIcon className="size-4 flex-none text-warn" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-xs">{r.documentRef ? `Delivery note ${r.documentRef}` : "Manual receipt (no document ref)"}</span>
              <span className="truncate font-mono text-[10.5px] text-muted-foreground">
                {r.lines.map((l) => `${l.quantity ?? "?"} × ${l.sku ?? "unresolved SKU"}`).join(" · ") || "No lines yet"} · not yet on hand
              </span>
            </span>
            <span className="text-[11px] font-semibold text-warn">Review</span>
          </button>
        ))}
        {inv && !inv.pending.length && <div className="border-t border-border py-2 text-xs text-faint">Nothing is awaiting verification.</div>}
      </div>
      {canCreate && (
        <Button variant="outline" disabled={busy} onClick={() => void createDraft()} className="h-[34px] bg-transparent text-[12.5px] shadow-none dark:bg-transparent">
          <PlusIcon /> New manual receipt
        </Button>
      )}
      {err && <div className="text-[12px] text-red-400">{err}</div>}
      {posted && posted.length > 0 && (
        <div>
          <Kicker className="mb-1 block">Recently posted</Kicker>
          {posted.map((r) => (
            <button
              key={r.id}
              onClick={() => openReceiving(r.id)}
              className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t border-border py-[7px] text-left text-xs hover:bg-hover-row"
            >
              <span className="truncate text-text-2">{r.documentRef ?? "Manual receipt"}</span>
              <span className="font-mono text-[11.5px] text-ok-light">+{r.totalQuantity}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── One receiving ─────────────────────────────────────────────────────────

interface FormState {
  supplierRef: string;
  documentRef: string;
  lines: ReceivingLineInput[];
}

const emptyLine = (): ReceivingLineInput => ({
  sku: null,
  quantity: null,
  unit: null,
  receivedOn: null,
  purchaseLineId: null,
  cargo: { lengthMm: null, widthMm: null, heightMm: null, weightGrams: null },
  allocations: [],
});

const toForm = (r: Receiving): FormState => ({
  supplierRef: r.supplierRef ?? "",
  documentRef: r.documentRef ?? "",
  lines: r.lines.map(({ sku, quantity, unit, receivedOn, purchaseLineId, cargo, allocations }) => ({
    sku,
    quantity,
    unit,
    receivedOn,
    purchaseLineId,
    cargo: { ...cargo },
    allocations: allocations.map((a) => ({ ...a })),
  })),
});

const body = (f: FormState) => ({
  supplierRef: f.supplierRef.trim() || null,
  documentRef: f.documentRef.trim() || null,
  lines: f.lines.map((l) => ({ ...l, sku: l.sku?.trim().toUpperCase() || null })),
});

function DraftView({ id }: { id: string }) {
  const inv = useInventory();
  const role = useServerData((s) => s.session?.user.role ?? null);
  const confirmable = useServerData(canConfirmStock);
  const epoch = useServerData((s) => s.historyEpoch);
  const [rec, setRec] = useState<Receiving | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState<null | "save" | "post" | "cancel">(null);
  const [error, setError] = useState<{ message: string; issues?: ReceivingIssue[]; conflict?: boolean } | null>(null);
  const [remoteChange, setRemoteChange] = useState<number | null>(null);
  const [result, setResult] = useState<PostReceivingResult | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const keyRef = useRef<{ forVersion: number; key: string } | null>(null);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const recRef = useRef<Receiving | null>(null);
  const generationRef = useRef(0);
  const mutationRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; generationRef.current += 1; };
  }, []);

  const canEdit = role === "warehouse" || role === "owner";

  const apply = (r: Receiving) => {
    generationRef.current += 1; // reads started before this application are obsolete
    recRef.current = r;
    dirtyRef.current = false;
    setRec(r);
    setForm(toForm(r));
    setDirty(false);
    setRemoteChange(null);
  };

  const load = useCallback(
    async (force: boolean) => {
      if (!force && mutationRef.current) return;
      const requestGeneration = ++generationRef.current;
      try {
        const r = await api<Receiving>("GET", `/receivings/${id}`);
        const cur = recRef.current;
        if (!mountedRef.current) return;
        const decision = receiptLoadDecision({
          currentVersion: cur?.version ?? null,
          incomingVersion: r.data.version,
          dirty: dirtyRef.current,
          force,
          requestGeneration,
          currentGeneration: generationRef.current,
        });
        if (decision === "discard" || decision === "preserve") return;
        if (decision === "conflict") {
          setChecked(false);
          setRemoteChange(r.data.version); // keep local edits until an explicit reload
          return;
        }
        if (force || (cur && r.data.version !== cur.version)) setChecked(false);
        apply(r.data);
      } catch (e) {
        if (!mountedRef.current || requestGeneration !== generationRef.current) return;
        setError({ message: e instanceof Error ? e.message : "Could not load the receiving." });
      }
    },
    [id],
  );

  useEffect(() => {
    void load(false);
  }, [load, epoch]);

  const edit = (fn: (f: FormState) => FormState) => {
    generationRef.current += 1;
    dirtyRef.current = true;
    setForm((f) => (f ? fn(f) : f));
    setDirty(true);
    setChecked(false);
    setError(null);
  };
  const editLine = (i: number, patch: Partial<ReceivingLineInput>) =>
    edit((f) => ({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  /** Saves the form if needed; returns the saved receiving (new version) or null on failure. */
  const save = async (): Promise<Receiving | null> => {
    if (!rec || !form) return null;
    if (!dirty) return rec;
    generationRef.current += 1;
    const r = await api<Receiving>("PATCH", `/receivings/${id}`, { expectedVersion: rec.version, ...body(form) });
    apply(r.data);
    void refreshSnapshot(); // pending summary / dock meshes may have changed
    return r.data;
  };

  const handle = (e: unknown) => {
    if (e instanceof ApiError) {
      setError({
        message: e.message,
        issues: e.issues,
        conflict: e.code === "version_conflict" || e.code === "state_conflict",
      });
      if (e.code === "state_conflict") void refreshSnapshot();
    } else setError({ message: e instanceof Error ? e.message : "Something went wrong." });
  };

  const onSave = async () => {
    mutationRef.current = true;
    generationRef.current += 1;
    setBusy("save");
    setError(null);
    try {
      await save();
    } catch (e) {
      handle(e);
    } finally {
      mutationRef.current = false;
      setBusy(null);
    }
  };

  const onPost = async () => {
    mutationRef.current = true;
    generationRef.current += 1;
    setBusy("post");
    setError(null);
    try {
      const saved = await save();
      if (!saved) return;
      const blocking = saved.issues.filter((i) => i.severity !== "warning");
      if (blocking.length) {
        setError({ message: "Resolve these before confirming the receipt.", issues: blocking });
        return;
      }
      // One key per reviewed version: a retry after a lost response replays instead of reposting.
      if (keyRef.current?.forVersion !== saved.version) keyRef.current = { forVersion: saved.version, key: newIdempotencyKey(`post-${id}`) };
      const r = await api<PostReceivingResult>(
        "POST",
        `/receivings/${id}/post`,
        { expectedVersion: saved.version, actualGoodsChecked: checked },
        { [IDEMPOTENCY_HEADER]: keyRef.current.key },
      );
      setResult(r.data);
      await refreshSnapshot();
      await load(true);
    } catch (e) {
      handle(e);
    } finally {
      mutationRef.current = false;
      setBusy(null);
    }
  };

  const onCancel = async () => {
    if (!rec || !cancelling?.trim()) return;
    mutationRef.current = true;
    generationRef.current += 1;
    setBusy("cancel");
    setError(null);
    try {
      await api<Receiving>("POST", `/receivings/${id}/cancel`, { expectedVersion: rec.version, reason: cancelling.trim() });
      setCancelling(null);
      await refreshSnapshot();
      await load(true);
    } catch (e) {
      handle(e);
    } finally {
      mutationRef.current = false;
      setBusy(null);
    }
  };

  if (!rec || !form || !inv) {
    return <div className="p-3.5 text-xs text-faint">{error ? error.message : "Loading receiving…"}</div>;
  }

  const draft = rec.status === "draft";
  const editable = draft && canEdit && busy === null;
  const tz = inv.warehouse.timezone;
  const blocking = rec.issues.filter((i) => i.severity !== "warning");
  const warnings = rec.issues.filter((i) => i.severity === "warning");

  return (
    <div className="flex flex-col gap-3.5 p-3.5 text-[12.5px]">
      <div className="flex items-center justify-between gap-2">
        <Button variant="quiet" size="xs" onClick={() => openReceiving(null)} className="-ml-1.5 text-muted-foreground">
          ← All receipts
        </Button>
        <span className="flex items-center gap-1.5">
          {rec.synthetic && <Badge variant="neutral" className="h-5 px-2 text-[11px]">Synthetic demo record</Badge>}
          <Badge variant={draft ? "warn" : rec.status === "posted" ? "neutral" : "outline"} className="h-5 px-2 text-[11px]">
            {rec.status === "draft" ? "Draft" : rec.status === "posted" ? "Posted" : "Cancelled"} · v{rec.version}
          </Badge>
        </span>
      </div>

      {rec.status === "posted" && (
        <div className="flex items-start gap-2 rounded-md border border-ok/30 bg-ok/8 px-2.5 py-2 text-ok-light">
          <CheckCircle2Icon className="mt-px size-4 flex-none" />
          <span>
            Posted {rec.postedAt ? localTime(rec.postedAt, tz) : ""} by {rec.postedByName ?? "—"}. These units are now on hand at the bays below.
            {result?.replayed && " (Replayed the already committed result.)"}
          </span>
        </div>
      )}
      {rec.status === "cancelled" && <div className="rounded-md border border-border px-2.5 py-2 text-muted-foreground">Cancelled: {rec.cancelReason}</div>}
      {draft && !canEdit && (
        <div className="rounded-md border border-border bg-inset px-2.5 py-2 text-muted-foreground">
          Your persona ({role ?? "signed out"}) can view this draft but cannot edit or post receipts.
        </div>
      )}
      {remoteChange !== null && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-warn/40 bg-warn/6 px-2.5 py-2 text-warn">
          <span>Someone saved version {remoteChange} while you were editing.</span>
          <Button variant="outline" size="xs" onClick={() => void load(true)} className="bg-transparent">
            Reload
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Field label="Document ref">
          <Input
            value={form.documentRef}
            disabled={!editable}
            onChange={(e) => edit((f) => ({ ...f, documentRef: e.target.value }))}
            className="h-8 text-[12.5px] md:text-[12.5px]"
            placeholder="e.g. DN-2291"
          />
        </Field>
        <Field label="Supplier">
          <Input
            value={form.supplierRef}
            disabled={!editable}
            onChange={(e) => edit((f) => ({ ...f, supplierRef: e.target.value }))}
            className="h-8 text-[12.5px] md:text-[12.5px]"
            placeholder="Supplier name"
          />
        </Field>
      </div>

      {form.lines.map((l, i) => (
        <LineEditor
          key={i}
          n={i + 1}
          line={l}
          inv={inv}
          rec={rec}
          editable={editable}
          onChange={(patch) => editLine(i, patch)}
          onRemove={form.lines.length > 1 ? () => edit((f) => ({ ...f, lines: f.lines.filter((_, j) => j !== i) })) : undefined}
        />
      ))}
      {editable && (
        <Button variant="quiet" size="xs" onClick={() => edit((f) => ({ ...f, lines: [...f.lines, emptyLine()] }))} className="self-start">
          <PlusIcon /> Add line
        </Button>
      )}

      {draft && (
        <>
          <Preview inv={inv} lines={form.lines} rec={rec} />
          <IssueList issues={blocking} warnings={warnings} dirty={dirty} />
        </>
      )}

      {error && (
        <div role="alert" className="rounded-md border border-red-900 bg-red-500/10 px-2.5 py-2 text-red-300">
          <div>{error.message}</div>
          {error.issues?.map((x, k) => (
            <div key={k} className="mt-1 text-[11.5px] text-red-300/90">
              · {x.message}
            </div>
          ))}
          {error.conflict && (
            <Button variant="outline" size="xs" onClick={() => void load(true)} className="mt-1.5 bg-transparent">
              Reload latest version
            </Button>
          )}
        </div>
      )}

      {draft && canEdit && (
        <div className="flex flex-col gap-2.5 border-t border-border pt-3">
          <label className="flex cursor-pointer items-start gap-2 text-[12.5px] text-text-2">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 size-4 accent-[var(--brand)]" />
            <span>I have physically checked the actual goods against this note: SKU, count and condition.</span>
          </label>
          {!confirmable && <div className="text-[11.5px] text-warn">The ledger is not current (stale or offline), so receipts cannot be confirmed right now.</div>}
          <div className="flex gap-2">
            <Button variant="outline" disabled={!dirty || busy !== null} onClick={() => void onSave()} className="h-[34px] flex-1 bg-transparent text-[12.5px] shadow-none dark:bg-transparent">
              {busy === "save" ? "Saving…" : dirty ? "Save draft" : "Saved"}
            </Button>
            <Button
              disabled={!checked || busy !== null || !confirmable || (!dirty && blocking.length > 0)}
              onClick={() => void onPost()}
              className="h-[34px] flex-[1.4] text-[12.5px]"
            >
              {busy === "post" ? "Posting…" : "Confirm receipt"}
            </Button>
          </div>
          <div className="text-[11px] leading-snug text-faint">
            Saving changes nothing physical. Confirming posts the reviewed version as stock in one transaction.
          </div>
          {cancelling === null ? (
            <button onClick={() => setCancelling("")} className="self-start text-[11.5px] text-faint underline-offset-2 hover:text-muted-foreground hover:underline">
              Cancel this draft…
            </button>
          ) : (
            <div className="flex gap-2">
              <Input
                autoFocus
                value={cancelling}
                onChange={(e) => setCancelling(e.target.value)}
                placeholder="Reason for cancelling"
                className="h-8 text-[12.5px] md:text-[12.5px]"
              />
              <Button variant="outline" size="sm" disabled={!cancelling.trim() || busy !== null} onClick={() => void onCancel()} className="h-8 bg-transparent">
                Cancel draft
              </Button>
            </div>
          )}
        </div>
      )}

      {rec.status === "posted" && rec.lines[0]?.sku && (
        <Button variant="outline" onClick={() => selectSku(rec.lines[0]!.sku!)} className="h-[34px] bg-transparent text-[12.5px] shadow-none dark:bg-transparent">
          Show {rec.lines[0].sku} in the warehouse
        </Button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[10.5px] tracking-[.05em] text-faint uppercase">{label}</span>
      {children}
    </label>
  );
}

const numOrNull = (v: string) => (v.trim() === "" ? null : Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null);

/** Bays this SKU may go into: empty bays, or bays already holding the same SKU with room left. */
function bayOptions(inv: Inventory, sku: string | null, current: string[]) {
  const p = sku ? inv.bySku.get(sku) : undefined;
  return inv.locations.filter((l) => {
    if (current.includes(l.id)) return true;
    if (!p) return !l.sku;
    return !l.sku || (l.sku === p.sku && l.quantity < p.unitsPerBay);
  });
}

function bayLabel(inv: Inventory, l: LocationView, sku: string | null) {
  const p = sku ? inv.bySku.get(sku) : undefined;
  if (!l.sku) return `F${l.floor} · ${l.code} · empty${p ? ` (holds ${p.unitsPerBay})` : ""}`;
  const cap = inv.bySku.get(l.sku)?.unitsPerBay ?? "?";
  return `F${l.floor} · ${l.code} · ${l.quantity}/${cap} ${l.sku}`;
}

function LineEditor({
  n,
  line: l,
  inv,
  rec,
  editable,
  onChange,
  onRemove,
}: {
  n: number;
  line: ReceivingLineInput;
  inv: Inventory;
  rec: Receiving;
  editable: boolean;
  onChange: (patch: Partial<ReceivingLineInput>) => void;
  onRemove?: () => void;
}) {
  const product = l.sku ? inv.bySku.get(l.sku) : undefined;
  const allocated = l.allocations.reduce((a, x) => a + x.quantity, 0);
  const options = useMemo(() => bayOptions(inv, l.sku, l.allocations.map((a) => a.locationId)), [inv, l.sku, l.allocations]);
  const purchase = rec.purchaseOptions.filter((o) => !l.sku || o.sku === l.sku);
  const savedLine = rec.lines[n - 1];

  return (
    <section className="flex flex-col gap-2 rounded-md border border-border bg-inset p-2.5">
      <div className="flex items-center justify-between">
        <Kicker>Line {n}</Kicker>
        {editable && onRemove && (
          <Button variant="quiet" size="icon-xs" onClick={onRemove} aria-label={`Remove line ${n}`}>
            <Trash2Icon />
          </Button>
        )}
      </div>
      <Field label="SKU">
        <input
          list="receiving-sku-options"
          value={l.sku ?? ""}
          disabled={!editable}
          onChange={(e) => onChange({ sku: e.target.value.toUpperCase() || null, allocations: [], purchaseLineId: null })}
          className={cn(fieldCls, "font-mono")}
          placeholder="Choose the SKU"
        />
        <datalist id="receiving-sku-options">
          {inv.products.map((p) => (
            <option key={p.sku} value={p.sku}>
              {skuTitle(p)}
            </option>
          ))}
        </datalist>
        <span className="truncate text-[11px] text-faint">
          {product ? `${skuTitle(product)} · ${product.unitsPerBay} per bay · counted in ${product.baseUnit}s` : l.sku ? "Not in the catalogue" : "Unresolved"}
        </span>
      </Field>
      <div className="grid grid-cols-[1fr_1fr_1.4fr] gap-2">
        <Field label="Counted">
          <input
            type="number"
            min={1}
            value={l.quantity ?? ""}
            disabled={!editable}
            onChange={(e) => onChange({ quantity: numOrNull(e.target.value) })}
            className={cn(fieldCls, "font-mono")}
          />
        </Field>
        <Field label="Unit">
          <select value={l.unit ?? ""} disabled={!editable} onChange={(e) => onChange({ unit: (e.target.value || null) as BaseUnit | null })} className={fieldCls}>
            <option value="">—</option>
            {BASE_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Received on">
          <span className="flex gap-1">
            <input
              type="date"
              value={l.receivedOn ?? ""}
              max={inv.warehouse.today}
              disabled={!editable}
              onChange={(e) => onChange({ receivedOn: e.target.value || null })}
              className={cn(fieldCls, "font-mono [color-scheme:dark]")}
            />
            {editable && l.receivedOn !== inv.warehouse.today && (
              <Button variant="outline" size="xs" onClick={() => onChange({ receivedOn: inv.warehouse.today })} className="h-8 bg-transparent px-1.5">
                Today
              </Button>
            )}
          </span>
        </Field>
      </div>
      <Field label="Confirmed purchase">
        <select value={l.purchaseLineId ?? ""} disabled={!editable} onChange={(e) => onChange({ purchaseLineId: e.target.value || null })} className={fieldCls}>
          <option value="">Not linked to a purchase</option>
          {purchase.map((o) => (
            <option key={o.id} value={o.id}>
              {o.purchaseRef ?? o.purchaseId} · {o.outstanding} of {o.ordered} outstanding{o.synthetic ? " (synthetic)" : ""}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex flex-col gap-1.5">
        <span className="flex items-baseline justify-between">
          <span className="text-[10.5px] tracking-[.05em] text-faint uppercase">Put away to</span>
          <span className={cn("font-mono text-[11px]", l.quantity !== null && allocated !== l.quantity ? "text-warn" : "text-faint")}>
            {allocated} / {l.quantity ?? "?"} allocated
          </span>
        </span>
        {l.allocations.map((a, j) => (
          <div key={j} className="grid grid-cols-[minmax(0,1fr)_64px_auto] gap-1.5">
            <select
              aria-label={`Bay ${j + 1}`}
              value={a.locationId}
              disabled={!editable}
              onChange={(e) => onChange({ allocations: l.allocations.map((x, k) => (k === j ? { ...x, locationId: e.target.value } : x)) })}
              className={cn(fieldCls, "font-mono")}
            >
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {bayLabel(inv, o, l.sku)}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              aria-label={`Quantity for bay ${j + 1}`}
              value={a.quantity}
              disabled={!editable}
              onChange={(e) => onChange({ allocations: l.allocations.map((x, k) => (k === j ? { ...x, quantity: numOrNull(e.target.value) ?? 0 } : x)) })}
              className={cn(fieldCls, "font-mono")}
            />
            {editable ? (
              <Button variant="quiet" size="icon-xs" className="h-8" onClick={() => onChange({ allocations: l.allocations.filter((_, k) => k !== j) })} aria-label="Remove bay">
                <XIcon />
              </Button>
            ) : (
              <span />
            )}
          </div>
        ))}
        {editable && (
          <Button
            variant="quiet"
            size="xs"
            disabled={!options.some((o) => !l.allocations.some((a) => a.locationId === o.id))}
            onClick={() => {
              const next = options.find((o) => !l.allocations.some((a) => a.locationId === o.id));
              if (!next) return;
              const room = product ? product.unitsPerBay - (next.sku === product.sku ? next.quantity : 0) : 1;
              const want = Math.max(1, Math.min(room, (l.quantity ?? room) - allocated));
              onChange({ allocations: [...l.allocations, { locationId: next.id, quantity: want }] });
            }}
            className="self-start"
          >
            <PlusIcon /> Add bay
          </Button>
        )}
        {!l.allocations.length && !editable && <span className="text-[11px] text-faint">No bays chosen.</span>}
      </div>

      <details className="text-[11.5px] text-faint">
        <summary className="cursor-pointer select-none">Packed dimensions (optional)</summary>
        <div className="mt-1.5 grid grid-cols-4 gap-1.5">
          {(
            [
              ["lengthMm", "L mm"],
              ["widthMm", "W mm"],
              ["heightMm", "H mm"],
              ["weightGrams", "g"],
            ] as const
          ).map(([k, lab]) => (
            <input
              key={k}
              type="number"
              min={0}
              aria-label={lab}
              placeholder={lab}
              value={l.cargo[k] ?? ""}
              disabled={!editable}
              onChange={(e) => onChange({ cargo: { ...l.cargo, [k]: numOrNull(e.target.value) } })}
              className={cn(fieldCls, "font-mono")}
            />
          ))}
        </div>
      </details>
      {savedLine?.lotId && <div className="font-mono text-[10.5px] text-faint">Lot {savedLine.lotId}</div>}
    </section>
  );
}

/** What posting would change, from the current ledger. A preview only: the server recalculates. */
function Preview({ inv, lines, rec }: { inv: Inventory; lines: ReceivingLineInput[]; rec: Receiving }) {
  const rows = lines
    .filter((l) => l.sku && l.quantity && inv.bySku.has(l.sku))
    .map((l) => {
      const p = inv.bySku.get(l.sku!)!;
      const linked = l.purchaseLineId ? rec.purchaseOptions.find((o) => o.id === l.purchaseLineId) : undefined;
      const inc = linked ? Math.min(l.quantity!, linked.outstanding) : 0;
      return { p, q: l.quantity!, inc };
    });
  if (!rows.length) return null;
  return (
    <div className="rounded-md border border-border px-2.5 py-2">
      <Kicker className="mb-1 block">If confirmed</Kicker>
      {rows.map(({ p, q, inc }) => (
        <div key={p.sku} className="font-mono text-[11.5px] leading-relaxed text-text-2">
          {p.sku}: on hand {p.onHand} → <span className="text-ok-light">{p.onHand + q}</span> · available {p.available} → {p.available + q}
          {inc > 0 && (
            <>
              {" "}
              · incoming {p.incoming} → {p.incoming - inc}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function IssueList({ issues, warnings, dirty }: { issues: ReceivingIssue[]; warnings: ReceivingIssue[]; dirty: boolean }) {
  if (!issues.length && !warnings.length) return dirty ? <div className="text-[11.5px] text-faint">Unsaved changes — checks run when you save or confirm.</div> : null;
  return (
    <div className="flex flex-col gap-1">
      {dirty && <div className="text-[11px] text-faint">Checks below are for the last saved version.</div>}
      {issues.map((x, k) => (
        <div key={`i${k}`} className="text-[11.5px] text-warn">
          ● {x.message}
        </div>
      ))}
      {warnings.map((x, k) => (
        <div key={`w${k}`} className="text-[11.5px] text-faint">
          ○ {x.message}
        </div>
      ))}
    </div>
  );
}
