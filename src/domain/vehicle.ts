// Does the consignment fit a vehicle? Weight + per-piece box check + a loose volume check.
import type { Package } from "./types";

export interface VehicleSpec {
  key: string;
  label: string;
  loadKg: number;
  /** Cargo space, cm. */
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

export type FitStatus = "fits" | "check" | "no" | "unknown";

export function fit(pieces: readonly Package[], v: VehicleSpec): { status: FitStatus; reasons: string[] } {
  if (!pieces.length || !v.loadKg || !v.lengthCm) return { status: "unknown", reasons: ["Missing size or weight"] };
  const kg = pieces.reduce((a, p) => a + p.kg, 0);
  if (kg > v.loadKg) return { status: "no", reasons: [`${kg} kg > ${v.loadKg} kg`] };
  const space = [v.lengthCm, v.widthCm, v.heightCm].sort((a, b) => b - a);
  const tooBig = pieces.find((p) => {
    const d = [p.lCm, p.wCm, p.hCm].sort((a, b) => b - a);
    return d.some((x, i) => x > space[i]!);
  });
  if (tooBig) return { status: "no", reasons: [`${tooBig.lCm}×${tooBig.wCm}×${tooBig.hCm} cm piece too large`] };
  const vol = pieces.reduce((a, p) => a + p.lCm * p.wCm * p.hCm, 0);
  const ratio = vol / (v.lengthCm * v.widthCm * v.heightCm);
  if (ratio > 0.8) return { status: "check", reasons: [`Fills ${Math.round(ratio * 100)}% of space`] };
  return { status: "fits", reasons: [`${kg} kg · ${Math.round(ratio * 100)}% of space`] };
}

export const piecesFor = (packages: readonly Package[], qty: number): Package[] =>
  Array.from({ length: qty }, () => packages).flat();
