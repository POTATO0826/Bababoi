import { describe, expect, test } from "bun:test";
import { cleanMeasures, lineTotals, parseMeasureInput, receiptTotals } from "./measure";
import { draftLine } from "./receipt-reading";

describe("line totals use only stated values", () => {
  test("per-item weight × counted quantity, with its working", () => {
    expect(lineTotals({ qty: 2, itemWeightKg: 20 })).toMatchObject({ weightKg: 40, weightBasis: "per item", weightWorking: "2 × 20 kg per item", warnings: [] });
  });
  test("per-package weight × package count when per-item is unknown", () => {
    expect(lineTotals({ qty: 2, packageCount: 3, packageWeightKg: 12.5 })).toMatchObject({ weightKg: 37.5, weightBasis: "per package" });
  });
  test("a stated total is used, labelled, never derived into per-item weights", () => {
    const t = lineTotals({ qty: 4, statedTotalWeightKg: 80 });
    expect(t).toMatchObject({ weightKg: 80, weightBasis: "stated total", calculatedWeightKg: null, weightWorking: "as stated on the document (not calculated)" });
  });
  test("mismatches are reported, not resolved", () => {
    const t = lineTotals({ qty: 2, itemWeightKg: 20, packageCount: 2, packageWeightKg: 25, statedTotalWeightKg: 60 });
    expect(t.weightKg).toBe(40);
    expect(t.warnings).toEqual(["Per-item weight gives 40 kg but per-package weight gives 50 kg", "Document states 60 kg total; counted values give 40 kg"]);
    expect(lineTotals({ qty: 2, itemWeightKg: 20, statedTotalWeightKg: 40.5 }).warnings).toEqual([]);
  });
  test("unknown stays unknown and says what is missing", () => {
    const t = lineTotals({ qty: null, itemWeightKg: 20, packageCount: 2, packageDimsCm: { lCm: 90, wCm: null, hCm: 45 } });
    expect(t.weightKg).toBeNull();
    expect(t.volumeM3).toBeNull();
    expect(t.missing).toEqual(["counted quantity (for the per-item weight)", "package width"]);
    expect(lineTotals({ qty: 3 })).toMatchObject({ weightKg: null, weightBasis: null, missing: ["weight per item, per package or stated total", "package count (for volume)", "package size (for volume)"] });
  });
  test("volume from package count and all three sides", () => {
    expect(lineTotals({ qty: 2, packageCount: 2, packageDimsCm: { lCm: 90, wCm: 60, hCm: 45 } })).toMatchObject({ volumeM3: 0.486, volumeWorking: "2 × 90 × 60 × 45 cm" });
  });
});

describe("receipt totals are never a misleading zero", () => {
  test("all unknown → null, not 0", () => {
    expect(receiptTotals([{ qty: 1 }, { qty: 2 }])).toMatchObject({ weightKg: null, volumeM3: null, weightComplete: false, unknownWeightLines: 2 });
  });
  test("partly known → a lower bound marked incomplete, with bases counted", () => {
    const t = receiptTotals([{ qty: 2, itemWeightKg: 20 }, { qty: 1, statedTotalWeightKg: 15 }, { qty: 5 }]);
    expect(t).toMatchObject({ weightKg: 55, knownWeightLines: 2, unknownWeightLines: 1, weightComplete: false, weightBases: { "per item": 1, "per package": 0, "stated total": 1 } });
  });
  test("complete and mismatched lines", () => {
    const t = receiptTotals([{ qty: 2, itemWeightKg: 20, statedTotalWeightKg: 50 }, { qty: 1, packageCount: 1, packageWeightKg: 10, packageDimsCm: { lCm: 100, wCm: 100, hCm: 100 } }]);
    expect(t).toMatchObject({ weightKg: 50, weightComplete: true, mismatchLines: 1, volumeM3: 1, knownVolumeLines: 1, volumeComplete: false });
  });
  test("empty receipt", () => {
    expect(receiptTotals([])).toMatchObject({ lines: 0, weightKg: null, weightComplete: false });
  });
});

describe("typed measurements", () => {
  test.each([
    ["", null, null], ["  ", null, null], ["12.5", 12.5, null], [" 7 ", 7, null], [".5", 0.5, null],
    ["abc", null, /Enter a number/], ["1,5", null, /no units or commas/], ["12kg", null, /Enter a number/],
    ["-3", null, /Enter a number/], ["0", null, /greater than 0/], ["1e3", null, /Enter a number/],
    ["Infinity", null, /Enter a number/], ["NaN", null, /Enter a number/], ["20000", null, /at most 10000/],
  ] as const)("weight %p", (text, value, error) => {
    const r = parseMeasureInput(text, "itemWeightKg");
    expect(r.value).toBe(value);
    if (error) expect(r.error).toMatch(error); else expect(r.error).toBeNull();
  });
  test("package count must be whole", () => {
    expect(parseMeasureInput("2.5", "packageCount").error).toMatch(/whole number/);
    expect(parseMeasureInput("3", "packageCount")).toEqual({ value: 3, error: null });
  });
});

describe("model output is sanitised, never guessed", () => {
  test("garbage and non-positive values become unknown", () => {
    expect(cleanMeasures({ unit: "  cartons ", packageCount: 2.5, packageDimsCm: { lCm: "120", wCm: -1, hCm: "abc" }, itemWeightKg: Number.NaN, packageWeightKg: "15", statedTotalWeightKg: Infinity })).toEqual({
      unit: "cartons", packageCount: null, packageDimsCm: { lCm: 120, wCm: null, hCm: null }, itemWeightKg: null, packageWeightKg: 15, statedTotalWeightKg: null,
    });
    expect(cleanMeasures({ packageDimsCm: "90x60" })).toMatchObject({ packageDimsCm: null, unit: null });
  });
  test("draft lines keep blank condition and unknown quantity", () => {
    expect(draftLine({ rawText: "Sofa x ?", qty: "two", condition: "", confidence: 7 })).toMatchObject({ qty: null, condition: "", confidence: 1, skuCode: null });
    expect(draftLine({ rawText: "" })).toBeNull();
    expect(draftLine("nope")).toBeNull();
  });
});
