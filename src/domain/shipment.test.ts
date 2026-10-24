import { describe, expect, test } from "bun:test";
import { breakdownLines, parseQuotation, parseServices } from "./lalamove";
import { lineCargo, planCargo, serviceFits, type MeasuredLine } from "./shipment";
import { fit } from "./vehicle";

const van = { key: "VAN", label: "Van", loadKg: 500, lengthCm: 210, widthCm: 120, heightCm: 120, specialRequests: [] };
const line = (over: Partial<MeasuredLine> = {}): MeasuredLine => ({ key: "l1", rawText: "Sofa x2", skuCode: "SOFA-A", qty: 2, packageCount: 4, packageDimsCm: { lCm: 100, wCm: 80, hCm: 50 }, packageWeightKg: 20, ...over });
const catalogue = [{ lCm: 200, wCm: 90, hCm: 80, kg: 45 }];

describe("cargo from received measurements", () => {
  test("a receipt line determines packages per unit only when it is exact", () => {
    expect(lineCargo(line()).perUnit).toEqual([{ lCm: 100, wCm: 80, hCm: 50, kg: 20 }, { lCm: 100, wCm: 80, hCm: 50, kg: 20 }]);
    expect(lineCargo(line({ packageWeightKg: null, itemWeightKg: 30 })).perUnit).toEqual([{ lCm: 100, wCm: 80, hCm: 50, kg: 15 }, { lCm: 100, wCm: 80, hCm: 50, kg: 15 }]);
    expect(lineCargo(line({ packageCount: 3 })).reason).toBe("3 packages for 2 units do not split evenly per unit");
    expect(lineCargo(line({ packageDimsCm: { lCm: 100, wCm: null, hCm: 50 } })).perUnit).toBeNull();
    expect(lineCargo(line({ packageWeightKg: null, itemWeightKg: null })).reason).toContain("package weight unknown");
    expect(lineCargo(line({ packageCount: null })).reason).toBe("package count unknown");
  });

  test("plan: confirmed wins; one measured line is suggested; several lines are never guessed", () => {
    const receipt = { id: "r1", lines: [line(), line({ key: "x", skuCode: "OTHER" })] };
    expect(planCargo({ qty: 1, skuCode: "SOFA-A", catalogue, receipt, cargo: { packages: catalogue, source: "staff", confirmedBy: "Ana", confirmedAt: 1 } })).toMatchObject({ status: "confirmed", source: "staff", pieces: catalogue });
    expect(planCargo({ qty: 3, skuCode: "SOFA-A", catalogue, receipt })).toMatchObject({ status: "suggested", source: "receipt", lineKey: "l1", receiptId: "r1" });
    expect((planCargo({ qty: 3, skuCode: "SOFA-A", catalogue, receipt }) as { pieces: unknown[] }).pieces).toHaveLength(6);
    const two = planCargo({ qty: 1, skuCode: "SOFA-A", catalogue, receipt: { id: "r1", lines: [line(), line({ key: "l2", packageCount: 2 })] } });
    expect(two).toMatchObject({ status: "ambiguous", candidates: [{ lineKey: "l1" }, { lineKey: "l2" }], catalogue });
  });

  test("an unusable receipt line falls back to the labelled catalogue, else unknown", () => {
    const p = planCargo({ qty: 1, skuCode: "SOFA-A", catalogue, receipt: { id: "r1", lines: [line({ packageCount: 3 })] } });
    expect(p).toMatchObject({ status: "suggested", source: "catalogue" });
    expect((p as { note: string }).note).toContain("Catalogue (not measured)");
    expect(planCargo({ qty: 1, skuCode: "SOFA-A", catalogue: [] })).toMatchObject({ status: "unknown" });
    expect(planCargo({ qty: 1, skuCode: "SOFA-A", catalogue: [{ lCm: 0, wCm: 1, hCm: 1, kg: 1 }] })).toMatchObject({ status: "unknown" });
  });

  test("only confirmed cargo that fits is eligible for quotes; unknown is never 'fits'", () => {
    const suggested = planCargo({ qty: 1, skuCode: "SOFA-A", catalogue: [{ lCm: 100, wCm: 80, hCm: 50, kg: 20 }] });
    expect(serviceFits(suggested, [van])[0]).toMatchObject({ status: "fits", eligible: false });
    const confirmed = planCargo({ qty: 1, skuCode: "SOFA-A", catalogue: [], cargo: { packages: [{ lCm: 100, wCm: 80, hCm: 50, kg: 20 }], source: "receipt", confirmedBy: "Ana", confirmedAt: 1 } });
    expect(serviceFits(confirmed, [van])[0]).toMatchObject({ status: "fits", eligible: true });
    expect(serviceFits(planCargo({ qty: 1, skuCode: "SOFA-A", catalogue: [] }), [van])[0]).toMatchObject({ status: "unknown", eligible: false });
  });
});

describe("vehicle fit edge cases", () => {
  test("overweight, oversize, missing capacity and unknown pieces", () => {
    expect(fit([{ lCm: 100, wCm: 80, hCm: 50, kg: 600 }], van)).toMatchObject({ status: "no", reasons: ["600 kg > 500 kg"] });
    expect(fit([{ lCm: 250, wCm: 80, hCm: 50, kg: 10 }], van)).toMatchObject({ status: "no" });
    expect(fit([{ lCm: 100, wCm: 80, hCm: 50, kg: 10 }], { ...van, widthCm: 0 })).toMatchObject({ status: "unknown", reasons: ["Vehicle capacity not provided"] });
    expect(fit([{ lCm: 100, wCm: Number.NaN, hCm: 50, kg: 10 }], van)).toMatchObject({ status: "unknown" });
    expect(fit([{ lCm: 200, wCm: 115, hCm: 115, kg: 10 }], van).status).toBe("check");
  });
});

describe("Lalamove payload parsing", () => {
  test("city info: m/cm/mm and kg/g units, KL preferred, missing capacities stay 0 (unknown)", () => {
    const s = parseServices({ data: [{ name: "Penang", services: [{ key: "X" }] }, { name: "Kuala Lumpur", services: [
      { key: "A", description: "a", dimensions: { length: { value: "1.5", unit: "m" }, width: { value: "900", unit: "mm" }, height: { value: "80", unit: "cm" } }, load: { value: "200000", unit: "g" } },
      { key: "B", description: "b" },
    ] }] });
    expect(s.map((x) => x.key)).toEqual(["A", "B"]);
    expect(s[0]).toMatchObject({ lengthCm: 150, widthCm: 90, heightCm: 80, loadKg: 200 });
    expect(s[1]).toMatchObject({ lengthCm: 0, widthCm: 0, heightCm: 0, loadKg: 0 });
  });

  test("quotations keep only returned values; breakdown lines are listed as returned", () => {
    expect(parseQuotation({ data: { quotationId: "q", priceBreakdown: { total: "0" } } })).toBeNull();
    expect(parseQuotation({ data: { quotationId: "q", priceBreakdown: { total: "12.30" } } })).toEqual({ quotationId: "q", totalSen: 1230, breakdownRaw: "{\"total\":\"12.30\"}" });
    expect(breakdownLines(JSON.stringify({ base: "38", extraMileage: "12.5", total: "50.5", currency: "MYR" }))).toEqual([{ name: "base", sen: 3800 }, { name: "extraMileage", sen: 1250 }]);
    expect(breakdownLines("not json")).toEqual([]);
  });
});
