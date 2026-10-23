import { afterEach, describe, expect, test } from "bun:test";
import { createApp } from "@/server/app";
import { readConfig } from "@/server/config";
import { migrate, openDatabase, seedState } from "@/server/db/database";
import { seedDemo } from "@/server/db/seed";
import { FIXED_NOW, DN, SOFA, sku, snapshot, tableCounts, tempDb, totals } from "./helpers";

let cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.forEach((c) => c());
  cleanups = [];
});

describe("explicit demo initialization", () => {
  test("produces the exact seed totals", () => {
    const t = tempDb();
    cleanups.push(t.cleanup);
    const s = snapshot(t.db);
    expect(totals(s)).toEqual({ skus: 43, onHand: 527, reserved: 140, available: 387, incoming: 99, occupied: 140, bays: 144 });
    expect(s.locations.filter((l) => !l.sku).map((l) => l.id)).toEqual(["1B23", "1B24", "1B25", "2A25"]);
    expect(sku(s, SOFA)).toEqual([12, 5, 7, 4]);
    expect(s.locations.filter((l) => l.sku === SOFA).map((l) => `${l.id}x${l.quantity}`)).toEqual([
      "1A00x2",
      "1A01x2",
      "1A02x2",
      "1A03x2",
      "1A04x2",
      "1A05x2",
    ]);
    expect(s.revision).toBe(1);
    expect(s.warehouse.syntheticData).toBe(true);
  });

  test("ledger rows reconcile with balances, and every reservation stays within its lot/location balance", () => {
    const t = tempDb();
    cleanups.push(t.cleanup);
    const movement = t.db.query("SELECT SUM(quantity) AS q FROM stock_movement").get() as { q: number };
    const balance = t.db.query("SELECT SUM(on_hand) AS q FROM stock_balance").get() as { q: number };
    expect(movement.q).toBe(527);
    expect(balance.q).toBe(527);
    const over = t.db
      .query(
        `SELECT r.lot_id, r.location_id FROM reservation r JOIN stock_balance b ON b.lot_id = r.lot_id AND b.location_id = r.location_id
         WHERE r.status = 'active' GROUP BY r.lot_id, r.location_id HAVING SUM(r.remaining_qty) > MAX(b.on_hand)`,
      )
      .all();
    expect(over).toEqual([]);
    expect((t.db.query("SELECT COUNT(*) AS n FROM stock_movement WHERE kind <> 'demo_opening' OR synthetic <> 1").get() as { n: number }).n).toBe(0);
  });

  test("DN-2291 is a draft linked to the sofa's confirmed incoming units and contributes no physical stock", () => {
    const t = tempDb();
    cleanups.push(t.cleanup);
    const s = snapshot(t.db);
    expect(s.pendingReceivings).toHaveLength(1);
    expect(s.pendingReceivings[0]).toMatchObject({ id: DN, documentRef: "DN-2291", status: "draft", totalQuantity: 4, synthetic: true });
    const line = t.db.query("SELECT sku, quantity, purchase_line_id, received_on FROM receiving_line WHERE receiving_id = ?").get(DN);
    expect(line).toEqual({ sku: SOFA, quantity: 4, purchase_line_id: "demo-po-sofa-havn-2140-line-1", received_on: null });
    expect((t.db.query("SELECT COUNT(*) AS n FROM stock_lot l JOIN receiving_line rl ON rl.id = l.receiving_line_id WHERE rl.receiving_id = ?").get(DN) as { n: number }).n).toBe(0);
  });

  test("reseeding is a no-op and does not duplicate anything", () => {
    const t = tempDb();
    cleanups.push(t.cleanup);
    const before = tableCounts(t.db);
    expect(seedDemo(t.db, () => FIXED_NOW)).toEqual({ status: "already_seeded", seedVersion: "wareorb-demo-v1" });
    expect(tableCounts(t.db)).toEqual(before);
    expect(totals(snapshot(t.db))).toMatchObject({ onHand: 527, reserved: 140, incoming: 99, occupied: 140 });
  });

  test("refuses to seed over unmarked existing records", () => {
    const t = tempDb({ seed: false });
    cleanups.push(t.cleanup);
    migrate(t.db);
    t.db.run("INSERT INTO category (id, name, sort_order) VALUES ('x', 'X', 0)");
    t.db.run(
      "INSERT INTO product (sku, category_id, model_name, variant, color, kind, doors, units_per_bay, base_unit, home_floor, home_zone, sort_order, synthetic, created_at, updated_at) VALUES ('X-1', 'x', 'm', 'v', '#000', 'carton', 2, 1, 'piece', 1, 'A', 0, 0, 't', 't')",
    );
    expect(() => seedDemo(t.db, () => FIXED_NOW)).toThrow(/refusing to seed/);
    expect((t.db.query("SELECT COUNT(*) AS n FROM product").get() as { n: number }).n).toBe(1);
  });

  test("server startup migrates but never seeds", () => {
    const t = tempDb({ seed: false });
    cleanups.push(t.cleanup);
    t.db.close();
    const app = createApp({ ...readConfig({}), databasePath: t.file, demoAuth: true });
    expect(seedState(app.db)).toEqual({ seeded: false, seedVersion: null });
    expect((app.db.query("SELECT COUNT(*) AS n FROM product").get() as { n: number }).n).toBe(0);
    app.db.close();
  });

  test("disk database: seed, close, reopen — same totals, no duplication", () => {
    const t = tempDb();
    cleanups.push(t.cleanup);
    const before = tableCounts(t.db);
    t.db.close();
    const reopened = openDatabase(t.file);
    try {
      expect(tableCounts(reopened)).toEqual(before);
      expect(totals(snapshot(reopened))).toMatchObject({ onHand: 527, reserved: 140, available: 387, incoming: 99, occupied: 140 });
      expect(seedDemo(reopened, () => FIXED_NOW).status).toBe("already_seeded");
    } finally {
      reopened.close();
    }
  });
});
