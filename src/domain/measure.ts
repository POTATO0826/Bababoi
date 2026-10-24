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

export interface LineTotals {
  /** Calculated from confirmed per-item or per-package weight; null when unknown. */
  weightKg: number | null;
  weightBasis: "per item" | "per package" | null;
  /** Total package volume in m³; null unless the count and all three sides are known. */
  volumeM3: number | null;
  warnings: string[];
}

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places;
const known = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
/** Two weights that should agree but differ by more than 2%. */
const disagree = (a: number, b: number) => Math.abs(a - b) > 0.02 * Math.max(a, b);

export function lineTotals(m: LineMeasures): LineTotals {
  const warnings: string[] = [];
  const byItem = known(m.qty) && known(m.itemWeightKg) ? m.qty * m.itemWeightKg : null;
  const byPackage = known(m.packageCount) && known(m.packageWeightKg) ? m.packageCount * m.packageWeightKg : null;
  if (byItem !== null && byPackage !== null && disagree(byItem, byPackage)) {
    warnings.push(`Per-item weight gives ${round(byItem, 1)} kg but per-package weight gives ${round(byPackage, 1)} kg`);
  }
  const weightKg = byItem ?? byPackage;
  if (weightKg !== null && known(m.statedTotalWeightKg) && disagree(weightKg, m.statedTotalWeightKg)) {
    warnings.push(`Document states ${round(m.statedTotalWeightKg, 1)} kg total; counted values give ${round(weightKg, 1)} kg`);
  }
  const d = m.packageDimsCm;
  const volumeM3 = known(m.packageCount) && d && known(d.lCm) && known(d.wCm) && known(d.hCm) ? round((m.packageCount * d.lCm * d.wCm * d.hCm) / 1e6, 3) : null;
  return { weightKg: weightKg === null ? null : round(weightKg), weightBasis: byItem !== null ? "per item" : byPackage !== null ? "per package" : null, volumeM3, warnings };
}

/** Receipt totals; any line without a known weight keeps the total incomplete rather than understated. */
export function receiptTotals(lines: readonly LineMeasures[]): { weightKg: number; unknownWeightLines: number; volumeM3: number; unknownVolumeLines: number } {
  let weightKg = 0, volumeM3 = 0, unknownWeightLines = 0, unknownVolumeLines = 0;
  for (const l of lines) {
    const t = lineTotals(l);
    if (t.weightKg === null) unknownWeightLines++; else weightKg += t.weightKg;
    if (t.volumeM3 === null) unknownVolumeLines++; else volumeM3 += t.volumeM3;
  }
  return { weightKg: round(weightKg), unknownWeightLines, volumeM3: round(volumeM3, 3), unknownVolumeLines };
}

/** A stated measurement, or null when absent, unreadable or not a positive number. */
export function measure(value: unknown, { integer = false, max = 1e6 } = {}): number | null {
  const n = typeof value === "string" ? Number(value.trim().replace(/,/g, "")) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n > max) return null;
  return integer ? (Number.isInteger(n) ? n : null) : round(n, 3);
}

/** Normalise measurement fields from an untrusted source (model output or a client). */
export function cleanMeasures(x: Record<string, unknown>): Required<Omit<LineMeasures, "qty">> {
  const dims = x.packageDimsCm && typeof x.packageDimsCm === "object" ? x.packageDimsCm as Record<string, unknown> : null;
  const lCm = measure(dims?.lCm, { max: 2000 }), wCm = measure(dims?.wCm, { max: 2000 }), hCm = measure(dims?.hCm, { max: 2000 });
  const unit = typeof x.unit === "string" ? x.unit.trim().slice(0, 20) : "";
  return {
    unit: unit || null,
    packageCount: measure(x.packageCount, { integer: true, max: 10_000 }),
    packageDimsCm: lCm !== null || wCm !== null || hCm !== null ? { lCm, wCm, hCm } : null,
    itemWeightKg: measure(x.itemWeightKg, { max: 10_000 }),
    packageWeightKg: measure(x.packageWeightKg, { max: 10_000 }),
    statedTotalWeightKg: measure(x.statedTotalWeightKg, { max: 1_000_000 }),
  };
}
