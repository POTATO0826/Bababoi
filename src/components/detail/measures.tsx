// Receipt line measurements: stated values only. Inputs keep exactly what was typed, so an unreadable
// entry is shown as an error instead of quietly becoming "unknown" or a guessed number.
import type { Doc } from "@convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { lineTotals, MEASURE_LIMITS, parseMeasureInput, receiptTotals, type MeasureField } from "@/domain/measure";
import { cn } from "@/lib/utils";

type Line = Doc<"receipts">["lines"][number];
/** Raw text per line key and field, kept while the presenter edits. */
export type RawMeasures = Record<string, Partial<Record<MeasureField | "unit", string>>>;

const DIMS = ["lCm", "wCm", "hCm"] as const;
const fmt = (n: number | null | undefined) => (typeof n === "number" ? String(n) : "");

function stored(l: Line, f: MeasureField): number | null | undefined {
  return (DIMS as readonly string[]).includes(f) ? l.packageDimsCm?.[f as (typeof DIMS)[number]] : l[f as Exclude<MeasureField, (typeof DIMS)[number]>];
}

/** The line after typing `text` into `field`; invalid text stores unknown (null) and is reported by `measureErrors`. */
export function applyMeasure(l: Line, field: MeasureField | "unit", text: string): Partial<Line> {
  if (field === "unit") return { unit: text.trim().slice(0, 20) || null };
  const { value } = parseMeasureInput(text, field);
  if ((DIMS as readonly string[]).includes(field)) {
    const dims = { lCm: l.packageDimsCm?.lCm ?? null, wCm: l.packageDimsCm?.wCm ?? null, hCm: l.packageDimsCm?.hCm ?? null, [field]: value };
    return { packageDimsCm: dims.lCm === null && dims.wCm === null && dims.hCm === null ? null : dims };
  }
  return { [field]: value } as Partial<Line>;
}

/** Every typed value that is not a valid measurement, for the lines still on the receipt. */
export function measureErrors(lines: readonly Line[], raw: RawMeasures): { key: string; field: MeasureField; error: string }[] {
  return lines.flatMap((l) => Object.entries(raw[l.key] ?? {}).flatMap(([f, text]) => {
    if (f === "unit" || text === undefined) return [];
    const { error } = parseMeasureInput(text, f as MeasureField);
    return error ? [{ key: l.key, field: f as MeasureField, error }] : [];
  }));
}

function Field({ line, field, raw, disabled, onChange, className }: { line: Line; field: MeasureField; raw: RawMeasures; disabled: boolean; onChange: (field: MeasureField, text: string) => void; className?: string }) {
  const text = raw[line.key]?.[field] ?? fmt(stored(line, field));
  const { error } = parseMeasureInput(text, field);
  const label = MEASURE_LIMITS[field].label;
  return (
    <label className={cn("flex min-w-0 flex-col gap-0.5 text-[11px] text-muted-foreground", className)}>
      {label}
      <Input
        type="text"
        inputMode={MEASURE_LIMITS[field].integer ? "numeric" : "decimal"}
        value={text}
        disabled={disabled}
        placeholder="unknown"
        aria-label={`${line.rawText.slice(0, 40)} ${label}`}
        aria-invalid={!!error}
        onChange={(e) => onChange(field, e.target.value)}
        className={cn("h-7 font-mono text-[12px]", error && "border-dispatch")}
      />
      {error && <span className="text-[10.5px] text-dispatch">{error}</span>}
    </label>
  );
}

export function MeasureEditor({ line, raw, disabled, onChange }: { line: Line; raw: RawMeasures; disabled: boolean; onChange: (field: MeasureField | "unit", text: string) => void }) {
  const invalid = measureErrors([line], raw).length > 0;
  const t = lineTotals(line);
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border-inner p-2">
      <span className="text-[11px] font-medium tracking-[.04em] text-faint uppercase">Measurements as stated · blank = unknown</span>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="flex min-w-0 flex-col gap-0.5 text-[11px] text-muted-foreground">Unit
          <Input value={raw[line.key]?.unit ?? line.unit ?? ""} disabled={disabled} placeholder="pcs, sets, cartons" aria-label={`${line.rawText.slice(0, 40)} unit`} onChange={(e) => onChange("unit", e.target.value)} className="h-7 text-[12px]" />
        </label>
        <Field line={line} field="packageCount" raw={raw} disabled={disabled} onChange={onChange} />
      </div>
      <div className="grid grid-cols-3 gap-1.5">{DIMS.map((f) => <Field key={f} line={line} field={f} raw={raw} disabled={disabled} onChange={onChange} />)}</div>
      <div className="grid grid-cols-3 gap-1.5">{(["itemWeightKg", "packageWeightKg", "statedTotalWeightKg"] as const).map((f) => <Field key={f} line={line} field={f} raw={raw} disabled={disabled} onChange={onChange} />)}</div>
      {invalid ? (
        <span className="text-[11.5px] text-dispatch">Fix the highlighted value before saving; totals are not shown for unreadable input.</span>
      ) : (
        <div className="flex flex-col gap-0.5 font-mono text-[11.5px]">
          <span>{t.weightKg !== null ? <>Weight <b>{t.weightKg} kg</b> <span className="text-muted-foreground">· {t.weightBasis}: {t.weightWorking}</span></> : <span className="text-muted-foreground">Weight unknown</span>}</span>
          {t.weightBasis === "per item" && t.statedWeightKg !== null && <span className="text-muted-foreground">Document states {t.statedWeightKg} kg</span>}
          <span>{t.volumeM3 !== null ? <>Volume <b>{t.volumeM3} m³</b> <span className="text-muted-foreground">· {t.volumeWorking}</span></> : <span className="text-muted-foreground">Volume unknown</span>}</span>
          {t.warnings.map((w) => <span key={w} className="text-warn">⚠ {w}</span>)}
          {t.missing.length > 0 && <span className="text-faint">Missing: {t.missing.join(", ")}</span>}
        </div>
      )}
    </div>
  );
}

/** Receipt totals: a sum over known lines, always labelled complete or incomplete — never a silent zero. */
export function ReceiptTotalsView({ lines, raw }: { lines: readonly Line[]; raw: RawMeasures }) {
  if (!lines.length) return null;
  const errors = measureErrors(lines, raw);
  const t = receiptTotals(lines);
  const bases = Object.entries(t.weightBases).filter(([, n]) => n > 0).map(([b, n]) => `${n} ${b}`).join(", ");
  const units = [...new Set(lines.map((l) => l.unit?.trim()).filter(Boolean))];
  return (
    <div role="status" aria-label="Receipt totals" className="flex flex-col gap-1 rounded-md border border-border p-2.5 text-[12px]">
      <span className="text-[11px] font-medium tracking-[.06em] text-faint uppercase">Receipt totals</span>
      {errors.length > 0 && <span className="text-dispatch">{errors.length} unreadable {errors.length === 1 ? "value excludes its line" : "values exclude their lines"} until corrected.</span>}
      <span className="font-mono">
        {t.weightKg === null ? "Weight unknown (no line has a stated weight)" : <>Weight {t.weightComplete ? "" : "at least "}<b>{t.weightKg} kg</b></>}
        {t.weightKg !== null && <span className="text-muted-foreground"> · {t.knownWeightLines} of {t.lines} lines ({bases})</span>}
      </span>
      {t.weightKg !== null && !t.weightComplete && <span className="text-warn">Incomplete: {t.unknownWeightLines} {t.unknownWeightLines === 1 ? "line has" : "lines have"} no known weight, so the real total is higher.</span>}
      <span className="font-mono">
        {t.volumeM3 === null ? "Volume unknown (no line has package count and size)" : <>Volume {t.volumeComplete ? "" : "at least "}<b>{t.volumeM3} m³</b></>}
        {t.volumeM3 !== null && <span className="text-muted-foreground"> · {t.knownVolumeLines} of {t.lines} lines</span>}
      </span>
      {t.volumeM3 !== null && !t.volumeComplete && <span className="text-warn">Incomplete: {t.unknownVolumeLines} {t.unknownVolumeLines === 1 ? "line lacks" : "lines lack"} package count or size.</span>}
      {t.mismatchLines > 0 && <span className="text-warn">⚠ {t.mismatchLines} {t.mismatchLines === 1 ? "line has" : "lines have"} stated weights that disagree; check the document.</span>}
      {units.length > 1 && <span className="text-muted-foreground">Mixed units: {units.join(", ")}</span>}
    </div>
  );
}
