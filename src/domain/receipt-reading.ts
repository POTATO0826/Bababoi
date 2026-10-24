// Shared rules for reading delivery evidence into draft receipt lines (cloud Claude path and local Pi agent).
import { cleanMeasures } from "./measure";

export const RECEIPT_READING_RULES = `You read furniture warehouse delivery evidence: photos of handwritten notes, printed delivery documents, and spoken notes in English or Mandarin.
Turn them into draft lines. Staff will physically count and check everything; you only draft.
Rules:
- Never guess a SKU: set skuCode only when model and variant clearly match the catalogue. Otherwise leave it empty, give up to 3 catalogue candidates and ask a question.
- Never guess a quantity: null when unreadable or absent, and ask.
- Copy measurements only when they are written or said: unit (pcs, sets, cartons…), package count, size of one package (L × W × H in cm), weight per item, weight per package, and total weight. Keep these three weights separate and never derive one from another. Convert only explicit units (1.2 m = 120 cm, 500 g = 0.5 kg). Use null for anything absent, unclear or unreadable. Never estimate.
- Condition: copy what is stated (e.g. "1 carton damaged"); use "good" only when stated fine; leave empty when not stated.
- List anything you could not read in "unreadable" (e.g. "line 3 quantity smudged").
Common Chinese words: 沙发 sofa, 桌 table, 椅 chair, 衣柜 wardrobe, 床 bed, 床垫 mattress, 镜 mirror, 灯 lamp, 箱 carton, 件 piece, 套 set, 公斤 kg, 厘米 cm, 毛重 gross weight, 净重 net weight, 破损 damaged.`;

export interface DraftLine {
  rawText: string;
  skuCode: string | null;
  candidates: string[];
  qty: number | null;
  condition: string;
  confidence: number;
  questions: string[];
  unit: string | null;
  packageCount: number | null;
  packageDimsCm: { lCm: number | null; wCm: number | null; hCm: number | null } | null;
  itemWeightKg: number | null;
  packageWeightKg: number | null;
  statedTotalWeightKg: number | null;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strings = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.flatMap((x) => (typeof x === "string" && x.trim() ? [x.trim().slice(0, max)] : [])).slice(0, n) : []);

/** Validate one model-produced line; anything malformed becomes unknown instead of failing the draft. */
export function draftLine(raw: unknown): DraftLine | null {
  if (!raw || typeof raw !== "object") return null;
  const l = raw as Record<string, unknown>;
  const rawText = str(l.rawText, 200);
  if (!rawText) return null;
  const qty = typeof l.qty === "number" && Number.isSafeInteger(l.qty) && l.qty > 0 ? l.qty : null;
  const confidence = typeof l.confidence === "number" && Number.isFinite(l.confidence) ? Math.max(0, Math.min(1, l.confidence)) : 0;
  return {
    rawText,
    skuCode: str(l.skuCode, 40) || null,
    candidates: strings(l.candidates, 4, 40),
    qty,
    condition: str(l.condition, 60),
    confidence,
    questions: strings(l.questions, 4, 160),
    ...cleanMeasures(l),
  };
}
