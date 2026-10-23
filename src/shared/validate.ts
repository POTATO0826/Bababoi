// Minimal runtime validation for request bodies. TypeScript types alone are not input validation.
// Each validator returns the parsed value or records field errors keyed by a dotted path.

import { BASE_UNITS, type AllocationInput, type BaseUnit, type CargoSnapshot, type ReceivingLineInput } from "./contracts";

export class Problems {
  readonly fields: Record<string, string> = {};
  add(path: string, message: string) {
    if (!(path in this.fields)) this.fields[path] = message;
  }
  get ok() {
    return Object.keys(this.fields).length === 0;
  }
}

type Obj = Record<string, unknown>;

export const isObject = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in YYYY-MM-DD form. */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function optionalText(o: Obj, key: string, p: Problems, path: string, max = 120): string | null | undefined {
  if (!(key in o)) return undefined;
  const v = o[key];
  if (v === null) return null;
  if (typeof v !== "string") {
    p.add(path, "Must be text or null.");
    return undefined;
  }
  const t = v.trim();
  if (t.length > max) {
    p.add(path, `At most ${max} characters.`);
    return undefined;
  }
  return t.length ? t : null;
}

export function positiveInt(v: unknown, p: Problems, path: string, { nullable = false, max = 100_000 } = {}): number | null {
  if (v === null && nullable) return null;
  if (typeof v !== "number" || !Number.isInteger(v) || v <= 0 || v > max) {
    p.add(path, nullable ? "Must be a positive whole number or null." : "Must be a positive whole number.");
    return null;
  }
  return v;
}

function nonNegativeIntOrNull(v: unknown, p: Problems, path: string): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 100_000_000) {
    p.add(path, "Must be a whole number ≥ 0, or null when unknown.");
    return null;
  }
  return v;
}

function cargo(v: unknown, p: Problems, path: string): CargoSnapshot {
  const empty: CargoSnapshot = { lengthMm: null, widthMm: null, heightMm: null, weightGrams: null };
  if (v === undefined || v === null) return empty;
  if (!isObject(v)) {
    p.add(path, "Must be an object.");
    return empty;
  }
  return {
    lengthMm: nonNegativeIntOrNull(v.lengthMm, p, `${path}.lengthMm`),
    widthMm: nonNegativeIntOrNull(v.widthMm, p, `${path}.widthMm`),
    heightMm: nonNegativeIntOrNull(v.heightMm, p, `${path}.heightMm`),
    weightGrams: nonNegativeIntOrNull(v.weightGrams, p, `${path}.weightGrams`),
  };
}

function allocations(v: unknown, p: Problems, path: string): AllocationInput[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) {
    p.add(path, "Must be a list.");
    return [];
  }
  if (v.length > 50) p.add(path, "At most 50 allocations per line.");
  const out: AllocationInput[] = [];
  v.slice(0, 50).forEach((a, i) => {
    const ap = `${path}.${i}`;
    if (!isObject(a)) {
      p.add(ap, "Must be an object.");
      return;
    }
    if (typeof a.locationId !== "string" || !/^[12][ABCD][0-2][0-5]$/.test(a.locationId)) {
      p.add(`${ap}.locationId`, "Must be a location ID such as 1B23.");
      return;
    }
    const q = positiveInt(a.quantity, p, `${ap}.quantity`);
    if (q !== null) out.push({ locationId: a.locationId, quantity: q });
  });
  return out;
}

function line(v: unknown, p: Problems, path: string): ReceivingLineInput | null {
  if (!isObject(v)) {
    p.add(path, "Must be an object.");
    return null;
  }
  const sku = v.sku === null || v.sku === undefined || v.sku === "" ? null : v.sku;
  if (sku !== null && (typeof sku !== "string" || sku.length > 40)) p.add(`${path}.sku`, "Must be a SKU code or null.");
  const unit = v.unit === null || v.unit === undefined || v.unit === "" ? null : v.unit;
  if (unit !== null && !BASE_UNITS.includes(unit as BaseUnit)) p.add(`${path}.unit`, `Must be one of ${BASE_UNITS.join(", ")} or null.`);
  const receivedOn = v.receivedOn === null || v.receivedOn === undefined || v.receivedOn === "" ? null : v.receivedOn;
  if (receivedOn !== null && !isIsoDate(receivedOn)) p.add(`${path}.receivedOn`, "Must be a date (YYYY-MM-DD) or null.");
  const pl = v.purchaseLineId === null || v.purchaseLineId === undefined || v.purchaseLineId === "" ? null : v.purchaseLineId;
  if (pl !== null && (typeof pl !== "string" || pl.length > 80)) p.add(`${path}.purchaseLineId`, "Must be an ID or null.");
  return {
    sku: typeof sku === "string" ? sku.trim().toUpperCase() : null,
    quantity: v.quantity === undefined ? null : positiveInt(v.quantity, p, `${path}.quantity`, { nullable: true }),
    unit: (unit as BaseUnit | null) ?? null,
    receivedOn: typeof receivedOn === "string" ? receivedOn : null,
    purchaseLineId: typeof pl === "string" ? pl : null,
    cargo: cargo(v.cargo, p, `${path}.cargo`),
    allocations: allocations(v.allocations, p, `${path}.allocations`),
  };
}

function lines(v: unknown, p: Problems, path: string): ReceivingLineInput[] {
  if (!Array.isArray(v)) {
    p.add(path, "Must be a list of lines.");
    return [];
  }
  if (v.length > 50) p.add(path, "At most 50 lines.");
  return v
    .slice(0, 50)
    .map((l, i) => line(l, p, `${path}.${i}`))
    .filter((l): l is ReceivingLineInput => l !== null);
}

function expectedVersion(o: Obj, p: Problems): number {
  return positiveInt(o.expectedVersion, p, "expectedVersion") ?? 0;
}

export interface CreateReceivingBody {
  supplierRef: string | null;
  documentRef: string | null;
  lines: ReceivingLineInput[];
}

export function parseCreateReceiving(body: unknown, p: Problems): CreateReceivingBody {
  if (!isObject(body)) {
    p.add("body", "Must be a JSON object.");
    return { supplierRef: null, documentRef: null, lines: [] };
  }
  return {
    supplierRef: optionalText(body, "supplierRef", p, "supplierRef") ?? null,
    documentRef: optionalText(body, "documentRef", p, "documentRef", 60) ?? null,
    lines: body.lines === undefined ? [] : lines(body.lines, p, "lines"),
  };
}

export interface UpdateReceivingBody {
  expectedVersion: number;
  supplierRef?: string | null;
  documentRef?: string | null;
  lines?: ReceivingLineInput[];
}

export function parseUpdateReceiving(body: unknown, p: Problems): UpdateReceivingBody {
  if (!isObject(body)) {
    p.add("body", "Must be a JSON object.");
    return { expectedVersion: 0 };
  }
  const out: UpdateReceivingBody = { expectedVersion: expectedVersion(body, p) };
  const s = optionalText(body, "supplierRef", p, "supplierRef");
  if (s !== undefined) out.supplierRef = s;
  const d = optionalText(body, "documentRef", p, "documentRef", 60);
  if (d !== undefined) out.documentRef = d;
  if (body.lines !== undefined) out.lines = lines(body.lines, p, "lines");
  return out;
}

export interface PostReceivingBody {
  expectedVersion: number;
  actualGoodsChecked: boolean;
}

export function parsePostReceiving(body: unknown, p: Problems): PostReceivingBody {
  if (!isObject(body)) {
    p.add("body", "Must be a JSON object.");
    return { expectedVersion: 0, actualGoodsChecked: false };
  }
  if (typeof body.actualGoodsChecked !== "boolean") p.add("actualGoodsChecked", "Must be true or false.");
  return { expectedVersion: expectedVersion(body, p), actualGoodsChecked: body.actualGoodsChecked === true };
}

export interface CancelReceivingBody {
  expectedVersion: number;
  reason: string;
}

export function parseCancelReceiving(body: unknown, p: Problems): CancelReceivingBody {
  if (!isObject(body)) {
    p.add("body", "Must be a JSON object.");
    return { expectedVersion: 0, reason: "" };
  }
  const reason = optionalText(body, "reason", p, "reason", 300);
  if (!reason) p.add("reason", "A reason is required.");
  return { expectedVersion: expectedVersion(body, p), reason: reason ?? "" };
}

const KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;
export const isIdempotencyKey = (v: string | null): v is string => v !== null && KEY_RE.test(v);
