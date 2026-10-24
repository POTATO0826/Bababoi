// Does the consignment fit a vehicle? Weight + per-piece box check + a loose volume check.
// An estimate only: it does not prove that furniture loads through the door or stacks safely.
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

const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
export const validPiece = (p: Package) => positive(p.lCm) && positive(p.wCm) && positive(p.hCm) && positive(p.kg);

export function fit(pieces: readonly Package[], v: VehicleSpec): { status: FitStatus; reasons: string[] } {
  if (!pieces.length) return { status: "unknown", reasons: ["Missing size or weight"] };
  if (!pieces.every(validPiece)) return { status: "unknown", reasons: ["Some package sizes or weights are unknown"] };
  if (!positive(v.loadKg) || !positive(v.lengthCm) || !positive(v.widthCm) || !positive(v.heightCm)) return { status: "unknown", reasons: ["Vehicle capacity not provided"] };
  const kg = Math.round(pieces.reduce((a, p) => a + p.kg, 0) * 100) / 100;
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
