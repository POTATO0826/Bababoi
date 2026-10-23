// Money is stored as integer sen (1 RM = 100 sen) so sums never drift.

export const sen = (rm: number) => Math.round(rm * 100);

export function fmtRM(s: number | null | undefined) {
  if (s == null) return "—";
  const rm = s / 100;
  return `RM${rm.toLocaleString("en-MY", { minimumFractionDigits: rm % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** Parse a provider amount string ("126.50") into sen. */
export function parseAmount(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number.parseFloat(v) : Number.NaN;
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
