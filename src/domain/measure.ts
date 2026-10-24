// Received-goods measurements: what a delivery note or the presenter states, never estimates.
// A missing or unreadable value stays null ("unknown"); totals are calculated only from known values.

export interface PackageDims {
  lCm: number | null;
  wCm: number | null;
  hCm: number | null;
}

export interface LineMeasures {
  qty: number | null;
  /** Counting unit as written: pcs, sets, cartons… */
  unit?: string | null;
  /** Packages (cartons, crates) delivered for this line. */
  packageCount?: number | null;
  /** Size of one package. */
  packageDimsCm?: PackageDims | null;
  /** Weight of one item (one counted unit). */
  itemWeightKg?: number | null;
  /** Weight of one package. */
  packageWeightKg?: number | null;
  /** Total weight exactly as stated on the document. */
  statedTotalWeightKg?: number | null;
}

export type WeightBasis = "per item" | "per package" | "stated total";

export interface LineTotals {
  /** The line weight used in receipt totals: calculated when possible, else the stated total; null when unknown. */
  weightKg: number | null;
  weightBasis: WeightBasis | null;
  /** Calculated from confirmed per-item (preferred) or per-package weight; null when not calculable. */
  calculatedWeightKg: number | null;
  /** Total weight as stated on the document; null when not stated. */
  statedWeightKg: number | null;
  /** Human-readable working for the weight, e.g. "2 × 20 kg per item". */
  weightWorking: string | null;
  /** Total package volume in m³; null unless the count and all three sides are known. */
  volumeM3: number | null;
  volumeWorking: string | null;
  /** Inconsistent stated values (never resolved automatically). */
  warnings: string[];
  /** Why a total is unknown, e.g. "package height". */
  missing: string[];
}

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places;
const known = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
/** Two weights that should agree but differ by more than 2%. */
const disagree = (a: number, b: number) => Math.abs(a - b) > 0.02 * Math.max(a, b);
const kg = (n: number) => `${round(n, 2)} kg`;

export function lineTotals(m: LineMeasures): LineTotals {
  const warnings: string[] = [];
  const missing: string[] = [];
  const byItem = known(m.qty) && known(m.itemWeightKg) ? m.qty * m.itemWeightKg : null;
  const byPackage = known(m.packageCount) && known(m.packageWeightKg) ? m.packageCount * m.packageWeightKg : null;
  if (known(m.itemWeightKg) && !known(m.qty)) missing.push("counted quantity (for the per-item weight)");
  if (known(m.packageWeightKg) && !known(m.packageCount)) missing.push("package count (for the per-package weight)");
  if (byItem !== null && byPackage !== null && disagree(byItem, byPackage)) {
    warnings.push(`Per-item weight gives ${kg(byItem)} but per-package weight gives ${kg(byPackage)}`);
  }
  const calculated = byItem ?? byPackage;
  const stated = known(m.statedTotalWeightKg) ? m.statedTotalWeightKg : null;
  if (calculated !== null && stated !== null && disagree(calculated, stated)) {
    warnings.push(`Document states ${kg(stated)} total; counted values give ${kg(calculated)}`);
  }
  const weightBasis: WeightBasis | null = byItem !== null ? "per item" : byPackage !== null ? "per package" : stated !== null ? "stated total" : null;
  const weightWorking = byItem !== null ? `${m.qty} × ${kg(m.itemWeightKg!)} per item`
    : byPackage !== null ? `${m.packageCount} × ${kg(m.packageWeightKg!)} per package`
    : stated !== null ? "as stated on the document (not calculated)" : null;
  if (weightBasis === null && !missing.length) missing.push("weight per item, per package or stated total");

  const d = m.packageDimsCm;
  const sides = d ? ([["length", d.lCm], ["width", d.wCm], ["height", d.hCm]] as const) : null;
  let volumeM3: number | null = null;
  let volumeWorking: string | null = null;
  if (known(m.packageCount) && d && known(d.lCm) && known(d.wCm) && known(d.hCm)) {
    volumeM3 = round((m.packageCount * d.lCm * d.wCm * d.hCm) / 1e6, 3);
    volumeWorking = `${m.packageCount} × ${d.lCm} × ${d.wCm} × ${d.hCm} cm`;
  } else {
    if (!known(m.packageCount)) missing.push("package count (for volume)");
    if (!sides) missing.push("package size (for volume)");
    else for (const [name, v] of sides) if (!known(v)) missing.push(`package ${name}`);
  }
  return {
    weightKg: weightBasis === "stated total" ? round(stated!) : calculated === null ? null : round(calculated),
    weightBasis,
    calculatedWeightKg: calculated === null ? null : round(calculated),
    statedWeightKg: stated === null ? null : round(stated),
    weightWorking,
    volumeM3,
    volumeWorking,
    warnings,
    missing,
  };
}

export interface ReceiptTotals {
  lines: number;
  /** Sum of the known line weights; null when no line weight is known (never a misleading 0). */
  weightKg: number | null;
  knownWeightLines: number;
  unknownWeightLines: number;
  /** True only when every line has a known weight. */
  weightComplete: boolean;
  /** How many known line weights came from each basis. */
  weightBases: Record<WeightBasis, number>;
  volumeM3: number | null;
  knownVolumeLines: number;
  unknownVolumeLines: number;
  volumeComplete: boolean;
  /** Lines with conflicting stated values. */
  mismatchLines: number;
}

/** Receipt totals; any line without a known value keeps that total incomplete rather than understated. */
export function receiptTotals(lines: readonly LineMeasures[]): ReceiptTotals {
  let weight = 0, volume = 0, knownWeightLines = 0, knownVolumeLines = 0, mismatchLines = 0;
  const weightBases: Record<WeightBasis, number> = { "per item": 0, "per package": 0, "stated total": 0 };
  for (const l of lines) {
    const t = lineTotals(l);
    if (t.weightKg !== null && t.weightBasis) { weight += t.weightKg; knownWeightLines++; weightBases[t.weightBasis]++; }
    if (t.volumeM3 !== null) { volume += t.volumeM3; knownVolumeLines++; }
    if (t.warnings.length) mismatchLines++;
  }
  return {
    lines: lines.length,
    weightKg: knownWeightLines ? round(weight) : null,
    knownWeightLines,
    unknownWeightLines: lines.length - knownWeightLines,
    weightComplete: lines.length > 0 && knownWeightLines === lines.length,
    weightBases,
    volumeM3: knownVolumeLines ? round(volume, 3) : null,
    knownVolumeLines,
    unknownVolumeLines: lines.length - knownVolumeLines,
    volumeComplete: lines.length > 0 && knownVolumeLines === lines.length,
    mismatchLines,
  };
}

/** A stated measurement, or null when absent, unreadable or not a positive number. */
export function measure(value: unknown, { integer = false, max = 1e6 } = {}): number | null {
  const n = typeof value === "string" ? Number(value.trim().replace(/,/g, "")) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n > max) return null;
  return integer ? (Number.isInteger(n) ? n : null) : round(n, 3);
}

export type MeasureField = "packageCount" | "lCm" | "wCm" | "hCm" | "itemWeightKg" | "packageWeightKg" | "statedTotalWeightKg";

/** Limits shared by staff input, model output and the backend. */
export const MEASURE_LIMITS: Record<MeasureField, { integer: boolean; max: number; label: string }> = {
  packageCount: { integer: true, max: 10_000, label: "Packages" },
  lCm: { integer: false, max: 2000, label: "Length cm" },
  wCm: { integer: false, max: 2000, label: "Width cm" },
  hCm: { integer: false, max: 2000, label: "Height cm" },
  itemWeightKg: { integer: false, max: 10_000, label: "Weight per item kg" },
  packageWeightKg: { integer: false, max: 10_000, label: "Weight per package kg" },
  statedTotalWeightKg: { integer: false, max: 1_000_000, label: "Stated total weight kg" },
};

/**
 * Parse what a person typed. Blank means unknown (null, no error). Anything else must be a plain
 * positive decimal such as "12.5": units, commas, "abc", "1e9", 0 or negatives are refused with a
 * reason instead of silently becoming unknown or a guessed number.
 */
export function parseMeasureInput(text: string, field: MeasureField): { value: number | null; error: string | null } {
  const s = text.trim();
  if (!s) return { value: null, error: null };
  const { integer, max } = MEASURE_LIMITS[field];
  if (!/^\d+(\.\d+)?$/.test(s) && !/^\.\d+$/.test(s)) {
    return { value: null, error: integer ? "Enter a whole number, or leave blank if unknown" : "Enter a number such as 12.5 (no units or commas), or leave blank if unknown" };
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return { value: null, error: "Must be greater than 0; leave blank if unknown" };
  if (integer && !Number.isInteger(n)) return { value: null, error: "Enter a whole number" };
  if (n > max) return { value: null, error: `Must be at most ${max}` };
  return { value: integer ? n : round(n, 3), error: null };
}

/** Normalise measurement fields from an untrusted source (model output or a client). */
export function cleanMeasures(x: Record<string, unknown>): Required<Omit<LineMeasures, "qty">> {
  const dims = x.packageDimsCm && typeof x.packageDimsCm === "object" ? x.packageDimsCm as Record<string, unknown> : null;
  const lim = MEASURE_LIMITS;
  const lCm = measure(dims?.lCm, lim.lCm), wCm = measure(dims?.wCm, lim.wCm), hCm = measure(dims?.hCm, lim.hCm);
  const unit = typeof x.unit === "string" ? x.unit.trim().slice(0, 20) : "";
  return {
    unit: unit || null,
    packageCount: measure(x.packageCount, lim.packageCount),
    packageDimsCm: lCm !== null || wCm !== null || hCm !== null ? { lCm, wCm, hCm } : null,
    itemWeightKg: measure(x.itemWeightKg, lim.itemWeightKg),
    packageWeightKg: measure(x.packageWeightKg, lim.packageWeightKg),
    statedTotalWeightKg: measure(x.statedTotalWeightKg, lim.statedTotalWeightKg),
  };
}
