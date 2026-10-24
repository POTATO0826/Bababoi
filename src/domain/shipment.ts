// What is being shipped: the measured or confirmed cargo for a deal, with its source. Shared by the UI,
// the backend and Jarvis. Unknown measurements stay unknown; nothing here guesses a size or weight.
import { fit, piecesFor, validPiece, type FitStatus, type VehicleSpec } from "./vehicle";
import type { Package } from "./types";

export type CargoSource = "receipt" | "catalogue" | "staff";

export const CARGO_SOURCE_LABEL: Record<CargoSource, string> = {
  receipt: "Measured at receiving",
  catalogue: "Catalogue (not measured)",
  staff: "Entered by staff",
};

/** A deal's confirmed cargo: the packages of ONE unit, as confirmed by a person. */
export interface ConfirmedCargo {
  packages: Package[];
  source: CargoSource;
  receiptId?: string;
  lineKey?: string;
  confirmedBy: string;
  confirmedAt: number;
}

/** The receipt-line fields needed to derive packages (a Convex receipt line satisfies this). */
export interface MeasuredLine {
  key: string;
  rawText: string;
  skuCode: string | null;
  qty: number | null;
  packageCount?: number | null;
  packageDimsCm?: { lCm: number | null; wCm: number | null; hCm: number | null } | null;
  itemWeightKg?: number | null;
  packageWeightKg?: number | null;
}

export interface LineCargo {
  lineKey: string;
  rawText: string;
  /** Packages of one unit, or null with the reason. */
  perUnit: Package[] | null;
  reason: string;
}

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places;

/** Packages per unit from one receipt line, only when its measurements determine them exactly. */
export function lineCargo(line: MeasuredLine): LineCargo {
  const base = { lineKey: line.key, rawText: line.rawText };
  const qty = line.qty;
  const pc = line.packageCount;
  const d = line.packageDimsCm;
  if (!qty || qty <= 0 || !Number.isSafeInteger(qty)) return { ...base, perUnit: null, reason: "counted quantity unknown" };
  if (!pc || !Number.isSafeInteger(pc)) return { ...base, perUnit: null, reason: "package count unknown" };
  if (!d || !(d.lCm && d.wCm && d.hCm)) return { ...base, perUnit: null, reason: "package size (L × W × H) unknown" };
  if (pc % qty !== 0) return { ...base, perUnit: null, reason: `${pc} packages for ${qty} units do not split evenly per unit` };
  const kg = line.packageWeightKg ?? (line.itemWeightKg ? (line.itemWeightKg * qty) / pc : null);
  if (!kg || !(kg > 0)) return { ...base, perUnit: null, reason: "package weight unknown (no per-package or per-item weight)" };
  const one: Package = { lCm: d.lCm, wCm: d.wCm, hCm: d.hCm, kg: round(kg) };
  return { ...base, perUnit: Array.from({ length: pc / qty }, () => ({ ...one })), reason: `${pc / qty} package(s) per unit from the receipt line` };
}

export type CargoPlan =
  | { status: "confirmed"; source: CargoSource; perUnit: Package[]; pieces: Package[]; note: string; confirmedBy: string }
  | { status: "suggested"; source: CargoSource; perUnit: Package[]; pieces: Package[]; note: string; lineKey?: string; receiptId?: string }
  | { status: "ambiguous"; candidates: LineCargo[]; note: string; catalogue: Package[] | null; receiptId?: string }
  | { status: "unknown"; note: string };

/**
 * The cargo for `qty` units. A confirmed cargo wins. Otherwise suggest the receipt measurements when exactly
 * one receipt line for this SKU determines them, else the catalogue packages (labelled), else unknown.
 * Several measured lines for the same SKU are never resolved automatically.
 */
export function planCargo(input: {
  qty: number;
  skuCode: string;
  cargo?: ConfirmedCargo | null;
  catalogue: readonly Package[];
  receipt?: { id: string; lines: readonly MeasuredLine[] } | null;
}): CargoPlan {
  const { qty } = input;
  if (input.cargo && input.cargo.packages.length && input.cargo.packages.every(validPiece)) {
    return { status: "confirmed", source: input.cargo.source, perUnit: input.cargo.packages, pieces: piecesFor(input.cargo.packages, qty), note: `${CARGO_SOURCE_LABEL[input.cargo.source]} · confirmed by ${input.cargo.confirmedBy}`, confirmedBy: input.cargo.confirmedBy };
  }
  const catalogue = input.catalogue.length && input.catalogue.every(validPiece) ? [...input.catalogue] : null;
  const lines = (input.receipt?.lines ?? []).filter((l) => l.skuCode === input.skuCode).map(lineCargo);
  if (lines.length > 1) {
    return { status: "ambiguous", candidates: lines, catalogue, receiptId: input.receipt?.id, note: `${lines.length} receipt lines recorded this SKU; choose which measurements belong to this stock, or enter them.` };
  }
  const only = lines[0];
  if (only?.perUnit) {
    return { status: "suggested", source: "receipt", perUnit: only.perUnit, pieces: piecesFor(only.perUnit, qty), note: `${CARGO_SOURCE_LABEL.receipt} (${only.reason}); confirm before quoting.`, lineKey: only.lineKey, receiptId: input.receipt?.id };
  }
  const why = only ? `The receipt line cannot be used: ${only.reason}. ` : "";
  if (catalogue) return { status: "suggested", source: "catalogue", perUnit: catalogue, pieces: piecesFor(catalogue, qty), note: `${why}${CARGO_SOURCE_LABEL.catalogue}; check and confirm the actual packages.` };
  return { status: "unknown", note: `${why}Package sizes and weights are unknown. Measure the packages and enter them.` };
}

export interface ServiceFit {
  service: VehicleSpec & { specialRequests?: string[] };
  status: FitStatus;
  reason: string;
  /** Quotable only for a confirmed cargo that fits (or needs a visual check), never for unknown cargo. */
  eligible: boolean;
}

/** Vehicle suitability for the cargo. Only confirmed cargo can make a service eligible for quotes. */
export function serviceFits(plan: CargoPlan, services: readonly (VehicleSpec & { specialRequests?: string[] })[]): ServiceFit[] {
  const pieces = plan.status === "confirmed" || plan.status === "suggested" ? plan.pieces : [];
  return services.map((service) => {
    const f = fit(pieces, service);
    return { service, status: f.status, reason: f.reasons[0] ?? "", eligible: plan.status === "confirmed" && (f.status === "fits" || f.status === "check") };
  });
}

export function cargoSummary(pieces: readonly Package[]) {
  return {
    packages: pieces.length,
    totalKg: round(pieces.reduce((a, p) => a + p.kg, 0)),
    volumeM3: round(pieces.reduce((a, p) => a + p.lCm * p.wCm * p.hCm, 0) / 1e6, 3),
  };
}
