import { describe, expect, test } from "bun:test";
import { flagBatches } from "./ageing";
import { authorityProblem } from "./costs";
import { buildSeed } from "./seed";
import { batchQty, freeSlotSet } from "./stock";
import { DAY, type BatchLike, type ReservationLike } from "./types";

const NOW = Date.UTC(2026, 9, 24, 8);

describe("demo scenarios", () => {
  test("deterministic: the same moment gives the same dataset", () => {
    expect(JSON.stringify(buildSeed(NOW))).toBe(JSON.stringify(buildSeed(NOW)));
  });

  test("inventory shows healthy, low and ageing stock, and free bays", () => {
    const s = buildSeed(NOW);
    const batches: BatchLike[] = s.batches.map((b) => ({ ...b, _id: b.code, status: "active" }));
    const reservations: ReservationLike[] = s.reservations
      .filter((r) => (r.status ?? "active") === "active")
      .map((r, i) => ({ _id: `r${i}`, skuCode: r.skuCode, batchId: r.batchCode, qty: r.qty, pick: r.pick ?? [], status: "active", label: r.label }));
    const available = new Map(s.skus.map((k) => [k.code, 0]));
    for (const b of batches) available.set(b.skuCode, (available.get(b.skuCode) ?? 0) + batchQty(b));
    for (const r of reservations) available.set(r.skuCode, available.get(r.skuCode)! - r.qty);
    const low = [...available].filter(([, n]) => n <= s.settings.lowStockThreshold).map(([code]) => code);
    expect(low).toContain("LAMP-ORBI-0450");
    expect([...available.values()].filter((n) => n > 5).length).toBeGreaterThan(20);
    const flags = flagBatches({ batches, reservations, movements: s.movements, rule: s.settings.ageing, now: NOW, historyFrom: NOW - 200 * DAY });
    expect(flags.filter((f) => f.flagged).length).toBe(5);
    expect(freeSlotSet(batches).size).toBeGreaterThanOrEqual(30);
  });

  test("every quote is a labelled synthetic reply that cannot authorise stock", () => {
    const s = buildSeed(NOW);
    expect(s.quotes.length).toBeGreaterThan(0);
    for (const q of s.quotes) expect(authorityProblem(q)).not.toBeNull();
    for (const d of s.deals) expect(d.booking?.simulated ?? true).toBe(true);
  });
});

describe("authorityProblem", () => {
  const verified = { source: "manual" as const, verifiedAt: NOW, reference: "Reply 1", terms: "All in", currency: "MYR" };
  test("only a verified MYR carrier reply authorises", () => {
    expect(authorityProblem(verified)).toBeNull();
    expect(authorityProblem({ ...verified, note: "Synthetic" })).toMatch(/synthetic/);
    expect(authorityProblem({ ...verified, verifiedAt: undefined })).toMatch(/verify/);
    expect(authorityProblem({ ...verified, source: "lalamove_sandbox" })).toMatch(/Sandbox/);
    expect(authorityProblem({ ...verified, currency: "USD" })).toMatch(/MYR/);
  });
});
