import { afterEach, expect, test } from "bun:test";
import path from "node:path";
import { createReceiving } from "@/server/services/receiving";
import { openDatabase } from "@/server/db/database";
import { context, dnLine, snapshot, tempDb, warehouse } from "./helpers";

let cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.forEach((c) => c());
  cleanups = [];
});

const WORKER = path.join(import.meta.dir, "fixtures", "post-worker.ts");

test("two OS processes posting into the same remaining space: one wins, the bay is never overfilled", async () => {
  const t = tempDb();
  cleanups.push(t.cleanup);
  const ctx = context(t.db);
  const draft = (doc: string, qty: number) =>
    createReceiving(ctx, warehouse, {
      supplierRef: "Race supplier",
      documentRef: doc,
      lines: [dnLine({ sku: "SOFA-HAVN-2141", quantity: qty, purchaseLineId: null, allocations: [{ locationId: "1B25", quantity: qty }] })],
    }).id;
  const a = draft("PROC-A", 2);
  const b = draft("PROC-B", 1);
  t.db.close();

  const startAt = Date.now() + 400;
  const spawn = (id: string, key: string) =>
    Bun.spawn(["bun", WORKER, t.file, id, key, String(startAt)], { cwd: path.join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  const procs = [spawn(a, "proc-a-000001"), spawn(b, "proc-b-000001")];
  const outputs = await Promise.all(
    procs.map(async (p) => {
      const out = await new Response(p.stdout).text();
      const err = await new Response(p.stderr).text();
      await p.exited;
      if (!out.trim()) throw new Error(`worker produced no output: ${err}`);
      return JSON.parse(out.trim().split("\n").at(-1)!) as { ok: boolean; code?: string; issue?: string };
    }),
  );
  expect(outputs.filter((o) => o.ok)).toHaveLength(1);
  const loser = outputs.find((o) => !o.ok)!;
  expect([loser.code, loser.issue]).toEqual(["stock_conflict", "capacity_exceeded"]);

  const db = openDatabase(t.file);
  try {
    const bay = snapshot(db).locations.find((l) => l.id === "1B25")!;
    expect(bay.sku).toBe("SOFA-HAVN-2141");
    expect(bay.quantity).toBeLessThanOrEqual(2);
    expect(bay.quantity).toBeGreaterThan(0);
  } finally {
    db.close();
  }
});
