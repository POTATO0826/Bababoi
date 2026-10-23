import { Problems, parseCreateReceiving } from "@/shared/validate";
import { afterEach, describe, expect, test } from "bun:test";
import { AppError, type FaultPoint } from "@/server/services/context";
import { cancelReceiving, createReceiving, getReceiving, postReceiving, updateReceiving } from "@/server/services/receiving";
import { getDailyActivity, getMovements } from "@/server/services/warehouse";
import { openDatabase } from "@/server/db/database";
import { DN, SOFA, SOFA_PO_LINE, TODAY, context, dnLine, owner, sales, sku, snapshot, tableCounts, tempDb, totals, warehouse } from "./helpers";

let cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.forEach((c) => c());
  cleanups = [];
});

function setup(faults?: (p: FaultPoint) => void) {
  const t = tempDb();
  cleanups.push(t.cleanup);
  return { ...t, ctx: context(t.db, faults) };
}

/** Runs fn and returns the AppError it throws. */
function appError(fn: () => unknown): AppError {
  try {
    fn();
  } catch (e) {
    if (e instanceof AppError) return e;
    throw e;
  }
  throw new Error("expected an AppError");
}

const physical = (s: ReturnType<typeof snapshot>) => s.locations.map((l) => `${l.id}:${l.sku ?? "-"}:${l.quantity}:${l.reserved}`);

/** Saves the reviewed DN-2291 line (adds the verified receipt date) → version 2. */
function review(ctx: ReturnType<typeof setup>["ctx"]) {
  return updateReceiving(ctx, warehouse, DN, { expectedVersion: 1, lines: [dnLine()] });
}

describe("receiving drafts never change stock", () => {
  test("editing DN-2291 changes nothing physical but versions the draft", () => {
    const { ctx, db } = setup();
    const before = snapshot(db);
    const counts = tableCounts(db);
    const updated = updateReceiving(ctx, warehouse, DN, { expectedVersion: 1, lines: [dnLine({ quantity: 3, allocations: [{ locationId: "1B23", quantity: 2 }, { locationId: "1B24", quantity: 1 }] })] });
    expect(updated.version).toBe(2);
    expect(updated.lines[0]!.quantity).toBe(3);
    const after = snapshot(db);
    expect(physical(after)).toEqual(physical(before));
    expect(totals(after)).toEqual(totals(before));
    expect(sku(after, SOFA)).toEqual([12, 5, 7, 4]);
    expect(after.revision).toBe(before.revision + 1); // the pending summary changed
    expect(after.pendingReceivings[0]!.totalQuantity).toBe(3);
    const c = tableCounts(db);
    expect([c.stock_lot, c.stock_balance, c.stock_movement, c.reservation]).toEqual([counts.stock_lot, counts.stock_balance, counts.stock_movement, counts.reservation]);
    expect(c.activity).toBe(counts.activity! + 1);
  });

  test("stale edits return a version conflict", () => {
    const { ctx } = setup();
    review(ctx);
    const e = appError(() => updateReceiving(ctx, warehouse, DN, { expectedVersion: 1, supplierRef: "Someone else" }));
    expect([e.status, e.code, e.extra.currentVersion]).toEqual([409, "version_conflict", 2]);
  });

  test("a sales persona can neither edit nor post", () => {
    const { ctx, db } = setup();
    const counts = tableCounts(db);
    expect(appError(() => updateReceiving(ctx, sales, DN, { expectedVersion: 1, lines: [dnLine()] })).status).toBe(403);
    expect(appError(() => postReceiving(ctx, sales, DN, { expectedVersion: 1, actualGoodsChecked: true }, "sales-key-0001")).status).toBe(403);
    expect(tableCounts(db)).toEqual(counts);
  });

  test("references to unknown SKUs or locations are rejected before saving", () => {
    const { ctx } = setup();
    const e = appError(() => updateReceiving(ctx, warehouse, DN, { expectedVersion: 1, lines: [dnLine({ sku: "NOPE-1" })] }));
    expect([e.status, e.code]).toEqual([422, "validation_failed"]);
    expect(Object.keys(e.extra.fields ?? {})).toContain("lines.0.sku");
  });
});

describe("posting validation", () => {
  const cases: [string, Parameters<typeof dnLine>[0], string][] = [
    ["missing receipt date", { receivedOn: null }, "missing_received_on"],
    ["missing count", { quantity: null }, "missing_quantity"],
    ["missing unit", { unit: null }, "missing_unit"],
    ["unit without conversion", { unit: "set" }, "unit_mismatch"],
    ["missing location", { allocations: [] }, "missing_allocation"],
    ["allocation total differs from count", { allocations: [{ locationId: "1B23", quantity: 2 }] }, "allocation_mismatch"],
    ["receipt date in the future", { receivedOn: "2026-10-24" }, "received_on_in_future"],
  ];
  for (const [name, line, code] of cases) {
    test(`blocks posting: ${name}`, () => {
      const { ctx, db } = setup();
      updateReceiving(ctx, warehouse, DN, { expectedVersion: 1, lines: [dnLine(line)] });
      const before = tableCounts(db);
      const e = appError(() => postReceiving(ctx, warehouse, DN, { expectedVersion: 2, actualGoodsChecked: true }, "post-key-0001"));
      expect([e.status, e.code]).toEqual([422, "validation_failed"]);
      expect(e.extra.issues?.map((i) => i.code)).toContain(code);
      expect(tableCounts(db)).toEqual(before);
    });
  }

  test("requires explicit confirmation that the actual goods were checked", () => {
    const { ctx, db } = setup();
    review(ctx);
    const before = tableCounts(db);
    const e = appError(() => postReceiving(ctx, warehouse, DN, { expectedVersion: 2, actualGoodsChecked: false }, "post-key-0001"));
    expect([e.status, e.extra.fields?.actualGoodsChecked]).toEqual([422, "Required."]);
    expect(tableCounts(db)).toEqual(before);
  });

  test("requires an idempotency key", () => {
    const { ctx } = setup();
    review(ctx);
    expect(appError(() => postReceiving(ctx, warehouse, DN, { expectedVersion: 2, actualGoodsChecked: true }, null)).status).toBe(400);
  });

  test("rejects a stale expectedVersion and posts nothing", () => {
    const { ctx, db } = setup();
    review(ctx);
    const before = tableCounts(db);
    const e = appError(() => postReceiving(ctx, warehouse, DN, { expectedVersion: 1, actualGoodsChecked: true }, "post-key-0001"));
    expect([e.status, e.code, e.extra.currentVersion]).toEqual([409, "version_conflict", 2]);
    expect(tableCounts(db)).toEqual(before);
  });
});

describe("posting DN-2291 to 1B23 / 1B24", () => {
  test("changes SOFA-HAVN-2140 from 12/5/7/4 to 16/5/11/0 and warehouse totals to 531/140/391/95, 142/144 bays", () => {
    const { ctx, db } = setup();
    const before = snapshot(db);
    review(ctx);
    const result = postReceiving(ctx, warehouse, DN, { expectedVersion: 2, actualGoodsChecked: true }, "post-dn-2291-0001");
    expect(result).toMatchObject({ receivingId: DN, documentRef: "DN-2291", status: "posted", version: 3, postedUnits: 4, replayed: false });
    expect(result.lotIds).toHaveLength(1);
    expect(result.movementIds).toHaveLength(2);

    const after = snapshot(db);
    expect(sku(after, SOFA)).toEqual([16, 5, 11, 0]);
    expect(totals(after)).toEqual({ skus: 43, onHand: 531, reserved: 140, available: 391, incoming: 95, occupied: 142, bays: 144 });
    expect(after.revision).toBe(result.snapshotRevision);
    expect(after.pendingReceivings).toEqual([]);

    // Every previous stock position is unchanged; only the two empty bays filled.
    const beforeById = new Map(before.locations.map((l) => [l.id, `${l.sku}:${l.quantity}:${l.reserved}`]));
    const changed = after.locations.filter((l) => beforeById.get(l.id) !== `${l.sku}:${l.quantity}:${l.reserved}`);
    expect(changed.map((l) => `${l.id}:${l.sku}:${l.quantity}`)).toEqual([`1B23:${SOFA}:2`, `1B24:${SOFA}:2`]);
    expect(after.locations.filter((l) => !l.sku).map((l) => l.id)).toEqual(["1B25", "2A25"]);

    // One lot with the verified receipt date; movements and activity name the real document and actor.
    const lot = db.query("SELECT sku, received_on FROM stock_lot WHERE id = ?").get(result.lotIds[0]!);
    expect(lot).toEqual({ sku: SOFA, received_on: TODAY });
    const history = getMovements(ctx, SOFA, null, 2).rows;
    expect(history.map((m) => [m.kind, m.code, m.quantity, m.sourceRef, m.actorName])).toEqual([
      ["receipt", "B-3-05", 2, "DN-2291", "Jun Lim"],
      ["receipt", "B-3-04", 2, "DN-2291", "Jun Lim"],
    ]);
    const day = getDailyActivity(ctx, null);
    expect(day.receivedUnits).toBe(4); // synthetic opening balances are not "received today"
    expect(day.receipts.map((r) => r.documentRef)).toEqual(["DN-2291"]);
    expect(day.pendingReceivings).toBe(0);

    // The purchase line's outstanding (incoming) is consumed by the posted receipt.
    const posted = getReceiving(ctx, DN);
    expect(posted.status).toBe("posted");
    expect(posted.lines[0]!.purchaseLineId).toBe(SOFA_PO_LINE);
    expect(posted.purchaseOptions).toMatchObject([{ id: SOFA_PO_LINE, ordered: 4, received: 4, outstanding: 0 }]);
    expect(db.query("SELECT ordered_qty FROM purchase_line WHERE id = ?").get(SOFA_PO_LINE)).toEqual({ ordered_qty: 4 });
  });

  test("an owner may also post (owner can perform warehouse actions)", () => {
    const { ctx, db } = setup();
    review(ctx);
    postReceiving(ctx, owner, DN, { expectedVersion: 2, actualGoodsChecked: true }, "owner-post-0001");
    expect(sku(snapshot(db), SOFA)).toEqual([16, 5, 11, 0]);
  });

  test("same idempotency key replays the committed result without writing again", () => {
    const { ctx, db } = setup();
    review(ctx);
    const first = postReceiving(ctx, warehouse, DN, { expectedVersion: 2, actualGoodsChecked: true }, "post-dn-2291-0001");
    const counts = tableCounts(db);
    const again = postReceiving(ctx, warehouse, DN, { expectedVersion: 2, actualGoodsChecked: true }, "post-dn-2291-0001");
    expect(again).toEqual({ ...first, replayed: true });
    expect(tableCounts(db)).toEqual(counts);
    expect(sku(snapshot(db), SOFA)).toEqual([16, 5, 11, 0]);
  });

  test("a different key cannot repost; a reused key with a different payload conflicts; replays still check the role", () => {
    const { ctx, db } = setup();
    review(ctx);
    postReceiving(ctx, warehouse, DN, { expectedVersion: 2, actualGoodsChecked: true }, "post-dn-2291-0001");
    const counts = tableCounts(db);
    const repost = appError(() => postReceiving(ctx, warehouse, DN, { expectedVersion: 2, actualGoodsChecked: true }, "post-dn-2291-0002"));
    expect([repost.status, repost.code]).toEqual([409, "state_conflict"]);
    const reused = appError(() => postReceiving(ctx, warehouse, DN, { expectedVersion: 3, actualGoodsChecked: true }, "post-dn-2291-0001"));
    expect([reused.status, reused.code]).toEqual([409, "idempotency_conflict"]);
    expect(appError(() => postReceiving(ctx, sales, DN, { expectedVersion: 2, actualGoodsChecked: true }, "post-dn-2291-0001")).status).toBe(403);
    expect(tableCounts(db)).toEqual(counts);
    expect(sku(snapshot(db), SOFA)).toEqual([16, 5, 11, 0]);
  });

  test("posted receipts are locked: no edit, no cancel", () => {
    const { ctx } = setup();
    review(ctx);
    postReceiving(ctx, warehouse, DN, { expectedVersion: 2, actualGoodsChecked: true }, "post-dn-2291-0001");
    expect(appError(() => updateReceiving(ctx, warehouse, DN, { expectedVersion: 3, lines: [dnLine({ quantity: 9 })] })).code).toBe("state_conflict");
    expect(appError(() => cancelReceiving(ctx, warehouse, DN, { expectedVersion: 3, reason: "oops" })).code).toBe("state_conflict");
  });

  test("persists across close and reopen of the disk database", () => {
    const t = tempDb();
    cleanups.push(t.cleanup);
    const ctx = context(t.db);
    review(ctx);
    postReceiving(ctx, warehouse, DN, { expectedVersion: 2, actualGoodsChecked: true }, "post-dn-2291-0001");
    const posted = snapshot(t.db);
    t.db.close();
    const reopened = openDatabase(t.file);
    try {
      const s = snapshot(reopened);
      expect(sku(s, SOFA)).toEqual([16, 5, 11, 0]);
      expect(totals(s)).toMatchObject({ onHand: 531, reserved: 140, available: 391, incoming: 95, occupied: 142 });
      expect(s.revision).toBe(posted.revision);
      expect(physical(s)).toEqual(physical(posted));
      // The committed idempotency result survives too.
      const replay = postReceiving(context(reopened), warehouse, DN, { expectedVersion: 2, actualGoodsChecked: true }, "post-dn-2291-0001");
      expect(replay.replayed).toBe(true);
    } finally {
      reopened.close();
    }
  });
});

describe("stock conflicts", () => {
  test("cannot overfill a bay that already holds the same SKU", () => {
    const { ctx, db } = setup();
    updateReceiving(ctx, warehouse, DN, { expectedVersion: 1, lines: [dnLine({ allocations: [{ locationId: "1A00", quantity: 2 }, { locationId: "1B23", quantity: 2 }] })] });
    const before = tableCounts(db);
    const e = appError(() => postReceiving(ctx, warehouse, DN, { expectedVersion: 2, actualGoodsChecked: true }, "post-key-0001"));
    expect([e.status, e.code]).toEqual([409, "stock_conflict"]);
    expect(e.extra.issues?.map((i) => i.code)).toEqual(["capacity_exceeded"]);
    expect(tableCounts(db)).toEqual(before);
  });

  test("cannot put a SKU into a bay holding a different SKU", () => {
    const { ctx } = setup();
    updateReceiving(ctx, warehouse, DN, { expectedVersion: 1, lines: [dnLine({ allocations: [{ locationId: "1A10", quantity: 2 }, { locationId: "1B23", quantity: 2 }] })] });
    const e = appError(() => postReceiving(ctx, warehouse, DN, { expectedVersion: 2, actualGoodsChecked: true }, "post-key-0001"));
    expect(e.extra.issues?.map((i) => i.code)).toEqual(["location_occupied"]);
  });

  test("two drafts competing for the same free space: the second cannot overfill it", () => {
    const { ctx, db } = setup();
    const a = createReceiving(ctx, warehouse, {
      supplierRef: "Test supplier",
      documentRef: "T-1",
      lines: [{ ...dnLine({ sku: "SOFA-HAVN-2141", quantity: 2, purchaseLineId: null, allocations: [{ locationId: "1B25", quantity: 2 }] }) }],
    });
    const b = createReceiving(ctx, warehouse, {
      supplierRef: "Test supplier",
      documentRef: "T-2",
      lines: [{ ...dnLine({ sku: "SOFA-HAVN-2141", quantity: 1, purchaseLineId: null, allocations: [{ locationId: "1B25", quantity: 1 }] }) }],
    });
    // Both look postable while the bay is empty.
    expect(a.issues.filter((i) => i.severity !== "warning")).toEqual([]);
    expect(b.issues.filter((i) => i.severity !== "warning")).toEqual([]);
    postReceiving(ctx, warehouse, a.id, { expectedVersion: 1, actualGoodsChecked: true }, "post-a-00001");
    const e = appError(() => postReceiving(ctx, warehouse, b.id, { expectedVersion: 1, actualGoodsChecked: true }, "post-b-00001"));
    expect([e.status, e.extra.issues?.[0]?.code]).toEqual([409, "capacity_exceeded"]);
    expect(snapshot(db).locations.find((l) => l.id === "1B25")).toMatchObject({ sku: "SOFA-HAVN-2141", quantity: 2 });
  });

  test("rejects over-receipt against the linked purchase line", () => {
    const { ctx, db } = setup();
    updateReceiving(ctx, warehouse, DN, {
      expectedVersion: 1,
      lines: [dnLine({ quantity: 5, allocations: [{ locationId: "1B23", quantity: 2 }, { locationId: "1B24", quantity: 2 }, { locationId: "1B25", quantity: 1 }] })],
    });
    const before = tableCounts(db);
    const e = appError(() => postReceiving(ctx, warehouse, DN, { expectedVersion: 2, actualGoodsChecked: true }, "post-key-0001"));
    expect([e.status, e.extra.issues?.map((i) => i.code)]).toEqual([409, ["purchase_over_receipt"]]);
    expect(tableCounts(db)).toEqual(before);
  });

  test("database guards block a direct over-capacity write and any ledger rewrite", () => {
    const { db } = setup();
    expect(() => db.run("INSERT INTO stock_balance (lot_id, location_id, on_hand) VALUES ('lot-opening-sofa-havn-2140', '1A00', 1)")).toThrow(/bay_capacity_exceeded|UNIQUE|PRIMARY KEY/);
    expect(() => db.run("UPDATE stock_balance SET on_hand = 3 WHERE lot_id = 'lot-opening-sofa-havn-2140' AND location_id = '1A00'")).toThrow(/bay_capacity_exceeded/);
    expect(() => db.run("INSERT INTO stock_balance (lot_id, location_id, on_hand) VALUES ('lot-opening-sofa-havn-2140', '1A10', 1)")).toThrow(/bay_holds_other_sku/);
    expect(() => db.run("UPDATE stock_movement SET quantity = 99")).toThrow(/stock_movement_is_immutable/);
    expect(() => db.run("DELETE FROM stock_movement")).toThrow(/stock_movement_is_immutable/);
    expect(() => db.run("UPDATE stock_balance SET on_hand = 0 WHERE lot_id = 'lot-opening-sofa-havn-2140' AND location_id = '1A00'")).toThrow(/balance_below_reserved/);
  });
});

describe("atomicity", () => {
  for (const point of ["receiving.post:after-balances", "receiving.post:before-commit"] as const) {
    test(`an injected failure at ${point} leaves no partial stock, movement, purchase or idempotency update`, () => {
      let armed = false;
      const { ctx, db } = setup((p) => {
        if (armed && p === point) throw new Error(`injected failure at ${p}`);
      });
      review(ctx);
      const before = snapshot(db);
      const counts = tableCounts(db);
      armed = true;
      expect(() => postReceiving(ctx, warehouse, DN, { expectedVersion: 2, actualGoodsChecked: true }, "post-dn-2291-0001")).toThrow(/injected failure/);
      expect(tableCounts(db)).toEqual(counts);
      const after = snapshot(db);
      expect(physical(after)).toEqual(physical(before));
      expect(sku(after, SOFA)).toEqual([12, 5, 7, 4]);
      expect(after.revision).toBe(before.revision);
      expect(getReceiving(ctx, DN)).toMatchObject({ status: "draft", version: 2 });
      // The same key can be retried once the fault is gone.
      armed = false;
      expect(postReceiving(ctx, warehouse, DN, { expectedVersion: 2, actualGoodsChecked: true }, "post-dn-2291-0001").replayed).toBe(false);
      expect(sku(snapshot(db), SOFA)).toEqual([16, 5, 11, 0]);
    });
  }
});

describe("manual drafts", () => {
  test("duplicate supplier document references are refused", () => {
    const { ctx } = setup();
    const e = appError(() => createReceiving(ctx, warehouse, { supplierRef: "Havn Living (synthetic supplier)", documentRef: "dn-2291", lines: [] }));
    expect([e.status, e.code]).toEqual([409, "duplicate_reference"]);
  });

  test("a draft without a document reference shows its weaker duplicate coverage", () => {
    const { ctx } = setup();
    const r = createReceiving(ctx, warehouse, { supplierRef: null, documentRef: null, lines: [] });
    expect(r.issues.map((i) => [i.code, i.severity])).toEqual([
      ["no_lines", "field"],
      ["no_document_reference", "warning"],
    ]);
  });

  test("cancelling a draft removes it from pending without touching stock", () => {
    const { ctx, db } = setup();
    const before = snapshot(db);
    const r = cancelReceiving(ctx, warehouse, DN, { expectedVersion: 1, reason: "Wrong supplier note" });
    expect(r.status).toBe("cancelled");
    const after = snapshot(db);
    expect(after.pendingReceivings).toEqual([]);
    expect(physical(after)).toEqual(physical(before));
    expect(sku(after, SOFA)).toEqual([12, 5, 7, 4]); // incoming stays: the purchase is still confirmed
  });
});


describe("review regressions", () => {
  for (const reversed of [false, true]) {
    test(`every linked SKU is checked, reversed=${reversed}, without persisted side effects`, () => {
      const { ctx, db } = setup();
      const lines = [
        dnLine({ quantity: 2, allocations: [{ locationId: "1B23", quantity: 2 }] }),
        dnLine({ sku: "SOFA-HAVN-2141", quantity: 2, allocations: [{ locationId: "1B24", quantity: 2 }] }),
      ];
      if (reversed) lines.reverse();
      const problems = new Problems();
      const input = parseCreateReceiving({ supplierRef: "Review supplier", documentRef: "SKU-REVIEW", lines }, problems);
      expect(problems.ok).toBe(true);
      const rec = createReceiving(ctx, warehouse, input);
      const mismatchLine = reversed ? 1 : 2;
      expect(rec.issues).toContainEqual(expect.objectContaining({ code: "purchase_sku_mismatch", lineNo: mismatchLine }));
      const persisted = () => (db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[])
        .map(({ name }) => [name, db.query(`SELECT * FROM "${name}" ORDER BY rowid`).all()]);
      const before = persisted();
      const e = appError(() => postReceiving(ctx, warehouse, rec.id, { expectedVersion: 1, actualGoodsChecked: true }, "review-sku-key-001"));
      expect(e.extra.issues).toContainEqual(expect.objectContaining({ code: "purchase_sku_mismatch", lineNo: mismatchLine }));
      expect(persisted()).toEqual(before);
    });
  }

  test("same SKU split lines can consume the aggregate purchase outstanding", () => {
    const { ctx, db } = setup();
    const rec = createReceiving(ctx, warehouse, { supplierRef: "Split", documentRef: "SPLIT", lines: [
      dnLine({ quantity: 2, allocations: [{ locationId: "1B23", quantity: 2 }] }),
      dnLine({ quantity: 2, allocations: [{ locationId: "1B24", quantity: 2 }] }),
    ] });
    postReceiving(ctx, warehouse, rec.id, { expectedVersion: 1, actualGoodsChecked: true }, "review-split-key-001");
    expect(sku(snapshot(db), SOFA)).toEqual([16, 5, 11, 0]);
  });

  for (const [supplierRef, documentRef, missing] of [
    [null, "DOC", "supplier"], ["Supplier", null, "document"], [null, null, "supplier and document"],
    ["Supplier", "DOC", null],
  ] as const) {
    test(`duplicate warning for ${missing ?? "complete reference"}`, () => {
      const { ctx } = setup();
      const rec = createReceiving(ctx, warehouse, { supplierRef, documentRef, lines: [] });
      const warning = rec.issues.find((i) => i.code === "no_document_reference" || i.code === "incomplete_duplicate_reference");
      if (missing) {
        expect(warning?.severity).toBe("warning");
        expect(warning?.message.toLowerCase()).toContain(missing);
      } else expect(warning).toBeUndefined();
    });
  }
  test("different suppliers may use the same document reference", () => {
    const { ctx } = setup();
    createReceiving(ctx, warehouse, { supplierRef: "Supplier A", documentRef: "SHARED", lines: [] });
    expect(createReceiving(ctx, warehouse, { supplierRef: "Supplier B", documentRef: "SHARED", lines: [] }).status).toBe("draft");
  });
});
