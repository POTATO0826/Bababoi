import { MapPinIcon, SparklesIcon } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { capFor, previewPlacement, receiveNewModel, skuPrefix } from "@/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORY_INFO, SHAPES, type CategoryId } from "@/data/catalog";
import { cn } from "@/lib/utils";
import { setWare, useWare } from "@/store";

const MATERIALS: [string, string][] = [
  ["Charcoal", "#3a3b40"],
  ["Grey", "#8b8f98"],
  ["Oatmeal", "#d8cdb8"],
  ["Sage", "#8fa58a"],
  ["Forest", "#3f5e4a"],
  ["Navy", "#44557a"],
  ["Terracotta", "#b8653f"],
  ["Mustard", "#c9a24a"],
  ["Oak", "#b48c5c"],
  ["Walnut", "#6e4b34"],
  ["White", "#dcdce0"],
  ["Blush", "#d9a7a0"],
];

const randomCode = () => String(Math.floor(1000 + Math.random() * 9000));

export function ReceiveDialog() {
  const open = useWare((s) => s.receiveOpen);
  return (
    <Dialog open={open} onOpenChange={(o) => setWare({ receiveOpen: o })}>
      <DialogContent className="max-h-[calc(100vh-32px)] overflow-y-auto sm:max-w-[460px]">
        {open && <ReceiveForm />}
      </DialogContent>
    </Dialog>
  );
}

function ReceiveForm() {
  const [category, setCategory] = useState<CategoryId>("sofas");
  const [shapeValue, setShapeValue] = useState(SHAPES.sofas[0]!.value);
  const [model, setModel] = useState("");
  const [variant, setVariant] = useState("");
  const [color, setColor] = useState(MATERIALS[3]![1]);
  const [supplier, setSupplier] = useState("HAVN");
  const [number] = useState(randomCode);
  const [skuEdited, setSkuEdited] = useState<string | null>(null);
  const [onHand, setOnHand] = useState("4");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const existing = useWare((s) => s.skus);

  const shape = SHAPES[category].find((x) => x.value === shapeValue) ?? SHAPES[category][0]!;
  const supplierCode = supplier.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
  const sku = (skuEdited ?? `${skuPrefix(category, shape)}-${supplierCode || "XXXX"}-${number}`).toUpperCase();
  const units = Math.max(0, Math.floor(Number(onHand) || 0));
  // `existing` is a dependency so the preview updates when stock moves while the dialog is open.
  const placement = useMemo(() => previewPlacement(category, shape, units), [category, shape, units, existing]);

  useEffect(() => setShapeValue(SHAPES[category][0]!.value), [category]);

  const errors = {
    model: !model.trim() ? "Enter the model name." : null,
    variant: !variant.trim() ? "Enter the variant (colour, size or finish)." : null,
    sku: !/^[A-Z]+-[A-Z]{2,5}-[0-9A-Z]{3,6}$/.test(sku)
      ? "Format: CATEGORY-SUPPLIER-MODEL, e.g. SOFA-HAVN-2150."
      : existing.some((r) => r.sku === sku)
        ? `${sku} already exists.`
        : null,
    units: units < 1 ? "At least 1 unit must be received." : !placement.fits ? `Not enough free bays (needs ${placement.need}, ${placement.bays.length} free).` : null,
  };
  const invalid = Object.values(errors).some(Boolean);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (invalid) return;
    const res = await receiveNewModel({
      category,
      shape,
      model,
      variant,
      color,
      sku,
      onHand: units,
      incoming: 0,
    });
    if (!res.ok) setError(res.error);
  };
  const show = (k: keyof typeof errors) => (submitted ? errors[k] : null);

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Receive new model</DialogTitle>
        <DialogDescription>Counted units go straight into free bays.</DialogDescription>
      </DialogHeader>

      <FieldGroup>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="rc-category">Category</FieldLabel>
            <Select value={category} onValueChange={(v) => setCategory(v as CategoryId)}>
              <SelectTrigger id="rc-category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {CATEGORY_INFO.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="rc-shape">3D shape</FieldLabel>
            <Select value={shape.value} onValueChange={setShapeValue}>
              <SelectTrigger id="rc-shape" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {SHAPES[category].map((x) => (
                    <SelectItem key={x.value} value={x.value}>
                      {x.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field data-invalid={!!show("model") || undefined}>
            <FieldLabel htmlFor="rc-model">Model</FieldLabel>
            <Input id="rc-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Corner Sofa" aria-invalid={!!show("model")} autoFocus />
            <FieldError>{show("model")}</FieldError>
          </Field>
          <Field data-invalid={!!show("variant") || undefined}>
            <FieldLabel htmlFor="rc-variant">Variant</FieldLabel>
            <Input id="rc-variant" value={variant} onChange={(e) => setVariant(e.target.value)} placeholder="Sage velvet" aria-invalid={!!show("variant")} />
            <FieldError>{show("variant")}</FieldError>
          </Field>
        </div>

        <Field>
          <FieldLabel>Material colour</FieldLabel>
          <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Material colour">
            {MATERIALS.map(([name, hex]) => (
              <button
                key={hex}
                type="button"
                role="radio"
                aria-checked={color === hex}
                aria-label={name}
                title={name}
                onClick={() => setColor(hex)}
                className={cn(
                  "size-[26px] rounded-md border border-white/15 transition-shadow",
                  color === hex && "ring-2 ring-brand ring-offset-2 ring-offset-background",
                )}
                style={{ background: hex }}
              />
            ))}
            <label className="relative inline-flex size-[26px] cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed border-border-strong text-[10px] text-muted-foreground" title="Custom colour">
              +
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Custom colour" />
            </label>
          </div>
        </Field>

        <div className="grid grid-cols-[1fr_1.6fr] gap-3">
          <Field>
            <FieldLabel htmlFor="rc-supplier">Supplier code</FieldLabel>
            <Input id="rc-supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="HAVN" maxLength={5} className="font-mono uppercase" />
          </Field>
          <Field data-invalid={!!show("sku") || undefined}>
            <FieldLabel htmlFor="rc-sku">SKU</FieldLabel>
            <Input id="rc-sku" value={sku} onChange={(e) => setSkuEdited(e.target.value)} className="font-mono uppercase" aria-invalid={!!show("sku")} />
            <FieldError>{show("sku")}</FieldError>
          </Field>
        </div>

        <Field data-invalid={!!show("units") || undefined}>
          <FieldLabel htmlFor="rc-onhand">Units counted</FieldLabel>
          <Input id="rc-onhand" type="number" min={1} value={onHand} onChange={(e) => setOnHand(e.target.value)} className="font-mono" aria-invalid={!!show("units")} />
        </Field>

        <div
          className={cn(
            "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[12.5px]",
            placement.fits && units > 0 ? "border-brand/35 bg-brand/8" : "border-warn/35 bg-warn/8",
          )}
        >
          <MapPinIcon className={cn("mt-0.5 size-4 flex-none", placement.fits && units > 0 ? "text-brand-light" : "text-warn")} />
          <span className="flex flex-col gap-0.5">
            {units < 1 ? (
              <span>Enter how many units arrived.</span>
            ) : placement.fits ? (
              <>
                <span>
                  Goes to <span className="font-mono">{placement.label}</span>
                </span>
                <FieldDescription className="text-[11.5px]">
                  Uses {placement.need} free {placement.need === 1 ? "bay" : "bays"} · up to {capFor(category, shape)} units per bay
                </FieldDescription>
              </>
            ) : (
              <span className="text-warn">
                Not enough free bays: needs {placement.need}, {placement.bays.length} free. Dispatch stock or receive fewer units.
              </span>
            )}
          </span>
        </div>
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => setWare({ receiveOpen: false })}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitted && invalid}>
          <SparklesIcon data-icon="inline-start" />
          Add & generate icon
        </Button>
      </DialogFooter>
    </form>
  );
}
