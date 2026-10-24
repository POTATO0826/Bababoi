import { useMutation } from "convex/react";
import { PackagePlusIcon, Trash2Icon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { capFor } from "@/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORY_INFO, SHAPES, type CategoryId, type FloorId, type ZoneId } from "@/data/catalog";
import { errorText } from "@/convex";
import { cn } from "@/lib/utils";
import { actorNow, setWare, useWare } from "@/store";

const MATERIALS: [string, string][] = [
  ["Charcoal", "#3a3b40"], ["Grey", "#8b8f98"], ["Oatmeal", "#d8cdb8"],
  ["Sage", "#8fa58a"], ["Forest", "#3f5e4a"], ["Navy", "#44557a"],
  ["Terracotta", "#b8653f"], ["Mustard", "#c9a24a"], ["Oak", "#b48c5c"],
  ["Walnut", "#6e4b34"], ["White", "#dcdce0"], ["Blush", "#d9a7a0"],
];

type PackageDraft = { lCm: string; wCm: string; hCm: string; kg: string };
const blankPackage = (): PackageDraft => ({ lCm: "", wCm: "", hCm: "", kg: "" });
const sen = (rm: string) => Math.round(Number(rm || 0) * 100);

export function ReceiveDialog() {
  const open = useWare((s) => s.receiveOpen);
  return <Dialog open={open} onOpenChange={(o) => setWare({ receiveOpen: o })}>
    <DialogContent className="max-h-[calc(100vh-32px)] overflow-y-auto sm:max-w-[560px]">
      {open && <CatalogForm />}
    </DialogContent>
  </Dialog>;
}

function CatalogForm() {
  const create = useMutation(api.receiving.createCatalogItem);
  const [category, setCategory] = useState<CategoryId>("sofas");
  const [shapeValue, setShapeValue] = useState(SHAPES.sofas[0]!.value);
  const [model, setModel] = useState("");
  const [variant, setVariant] = useState("");
  const [code, setCode] = useState("");
  const [color, setColor] = useState(MATERIALS[3]![1]);
  const [cap, setCap] = useState(String(capFor("sofas", SHAPES.sofas[0]!)));
  const [homeFloor, setHomeFloor] = useState<FloorId>(1);
  const [homeZone, setHomeZone] = useState<ZoneId>("A");
  const [packages, setPackages] = useState<PackageDraft[]>([blankPackage()]);
  const [listRm, setListRm] = useState("");
  const [clearanceRm, setClearanceRm] = useState("");
  const [costRm, setCostRm] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const catalogue = useWare((s) => s.ledger?.skus);
  const existingCodes = catalogue?.map((sku) => sku.code) ?? [];
  const shape = SHAPES[category].find((s) => s.value === shapeValue) ?? SHAPES[category][0]!;
  const normalizedCode = code.trim().toUpperCase();
  const numericPackages = packages.map((p) => ({ lCm: Number(p.lCm), wCm: Number(p.wCm), hCm: Number(p.hCm), kg: Number(p.kg) }));
  const validPackages = numericPackages.every((p) => Object.values(p).every((n) => Number.isFinite(n) && n > 0));
  const validPrices = [listRm, clearanceRm, costRm].every((s) => s === "" || (Number.isFinite(Number(s)) && Number(s) >= 0));
  const validation = !model.trim() || !variant.trim() ? "Enter a model and variant."
    : !/^[A-Z]+-[A-Z]{2,5}-[0-9A-Z]{3,6}$/.test(normalizedCode) ? "Enter a SKU such as SOFA-HAVN-2150."
    : existingCodes.includes(normalizedCode) ? "That SKU already exists."
    : !Number.isInteger(Number(cap)) || Number(cap) < 1 ? "Enter a positive whole number of units per bay."
    : !validPackages ? "Enter real positive dimensions and weight for every package."
    : !validPrices ? "Prices must be nonnegative amounts in RM."
    : listRm && clearanceRm && Number(clearanceRm) > Number(listRm) ? "Clearance price cannot exceed list price." : null;

  function chooseShape(value: string) {
    setShapeValue(value);
    const next = SHAPES[category].find((s) => s.value === value) ?? SHAPES[category][0]!;
    setCap(String(capFor(category, next)));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (validation || busy) return;
    setBusy(true);
    setError(null);
    try {
      await create({
        actor: actorNow(), category, kind: shape.kind, cap: Number(cap), doors: shape.doors ?? 2,
        model: model.trim(), variant: variant.trim(), color, code: normalizedCode,
        homeFloor, homeZone, packages: numericPackages,
        price: { listSen: sen(listRm), clearanceSen: sen(clearanceRm), unitCostSen: sen(costRm) },
      });
      setWare({ receiveOpen: false, stage: "receive", query: "" });
      toast.success(`${normalizedCode} added to catalogue`, { description: "Create a receipt, count the goods and choose bays before stock appears." });
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="flex flex-col gap-5">
    <DialogHeader>
      <DialogTitle>Create catalogue item</DialogTitle>
      <DialogDescription>Add the real item details first. Stock appears only after a reviewed receipt is posted.</DialogDescription>
    </DialogHeader>
    <FieldGroup>
      <div className="grid grid-cols-2 gap-3">
        <Field><FieldLabel>Category</FieldLabel><Select value={category} onValueChange={(v) => { const c = v as CategoryId; setCategory(c); setShapeValue(SHAPES[c][0]!.value); setCap(String(capFor(c, SHAPES[c][0]!))); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{CATEGORY_INFO.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field><FieldLabel>3D shape</FieldLabel><Select value={shape.value} onValueChange={chooseShape}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{SHAPES[category].map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field><FieldLabel htmlFor="ci-model">Model</FieldLabel><Input id="ci-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Corner sofa" autoFocus /></Field>
        <Field><FieldLabel htmlFor="ci-variant">Variant</FieldLabel><Input id="ci-variant" value={variant} onChange={(e) => setVariant(e.target.value)} placeholder="Sage velvet" /></Field>
      </div>
      <div className="grid grid-cols-[1.5fr_1fr] gap-3">
        <Field><FieldLabel htmlFor="ci-code">SKU</FieldLabel><Input id="ci-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SOFA-HAVN-2150" className="font-mono uppercase" /></Field>
        <Field><FieldLabel htmlFor="ci-cap">Units per bay</FieldLabel><Input id="ci-cap" type="number" min={1} step={1} value={cap} onChange={(e) => setCap(e.target.value)} /></Field>
      </div>
      <Field><FieldLabel>Material colour</FieldLabel><div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Material colour">{MATERIALS.map(([name, hex]) => <button key={hex} type="button" role="radio" aria-checked={color === hex} aria-label={name} title={name} onClick={() => setColor(hex)} className={cn("size-[26px] rounded-md border border-white/15", color === hex && "ring-2 ring-brand ring-offset-2 ring-offset-background")} style={{ background: hex }} />)}<label className="relative inline-flex size-[26px] cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed border-border-strong text-[10px] text-muted-foreground" title="Custom colour">+<input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Custom colour" /></label></div></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field><FieldLabel>Home floor</FieldLabel><Select value={String(homeFloor)} onValueChange={(v) => setHomeFloor(Number(v) as FloorId)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">Floor 1</SelectItem><SelectItem value="2">Floor 2</SelectItem></SelectContent></Select></Field>
        <Field><FieldLabel>Home zone</FieldLabel><Select value={homeZone} onValueChange={(v) => setHomeZone(v as ZoneId)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{(["A", "B", "C", "D"] as const).map((z) => <SelectItem key={z} value={z}>Zone {z}</SelectItem>)}</SelectContent></Select></Field>
      </div>
      <Field><FieldLabel>Package dimensions and weight</FieldLabel><FieldDescription>Use the actual size and weight of each package for delivery planning.</FieldDescription><div className="space-y-2">{packages.map((p, i) => <div key={i} className="grid grid-cols-[repeat(4,minmax(0,1fr))_auto] gap-1.5">{(["lCm", "wCm", "hCm", "kg"] as const).map((k) => <Input key={k} type="number" min="0.01" step="any" aria-label={`Package ${i + 1} ${k}`} placeholder={k === "kg" ? "kg" : k === "lCm" ? "L cm" : k === "wCm" ? "W cm" : "H cm"} value={p[k]} onChange={(e) => setPackages((rows) => rows.map((row, j) => j === i ? { ...row, [k]: e.target.value } : row))} />)}<Button type="button" variant="quiet" size="icon-sm" aria-label={`Remove package ${i + 1}`} disabled={packages.length === 1} onClick={() => setPackages((rows) => rows.filter((_, j) => j !== i))}><Trash2Icon /></Button></div>)}</div><Button type="button" variant="outline" size="xs" onClick={() => setPackages((rows) => [...rows, blankPackage()])}>Add package</Button></Field>
      <Field><FieldLabel>Prices in RM</FieldLabel><FieldDescription>Leave an amount blank or enter 0 if unknown. A real selling price is required before making an offer.</FieldDescription><div className="grid grid-cols-3 gap-2"><Input type="number" min={0} step="0.01" aria-label="List price RM" placeholder="List" value={listRm} onChange={(e) => setListRm(e.target.value)} /><Input type="number" min={0} step="0.01" aria-label="Clearance price RM" placeholder="Clearance" value={clearanceRm} onChange={(e) => setClearanceRm(e.target.value)} /><Input type="number" min={0} step="0.01" aria-label="Unit cost RM" placeholder="Cost" value={costRm} onChange={(e) => setCostRm(e.target.value)} /></div></Field>
      {submitted && validation && <FieldError>{validation}</FieldError>}
      {error && <FieldError>{error}</FieldError>}
    </FieldGroup>
    <DialogFooter><Button type="button" variant="outline" onClick={() => setWare({ receiveOpen: false })}>Cancel</Button><Button type="submit" disabled={busy}><PackagePlusIcon data-icon="inline-start" />{busy ? "Creating…" : "Create item"}</Button></DialogFooter>
  </form>;
}
