// Separate OS process that posts one receiving against a shared SQLite file.
// Usage: bun tests/fixtures/post-worker.ts <dbFile> <receivingId> <idempotencyKey> <startAtEpochMs>
import { openDatabase } from "@/server/db/database";
import { WAREHOUSE_ID } from "@/server/db/seed";
import { AppError } from "@/server/services/context";
import { postReceiving } from "@/server/services/receiving";
import { DEMO_USERS } from "@/server/auth/users";

const [file, receivingId, key, startAt] = process.argv.slice(2) as [string, string, string, string];
const db = openDatabase(file, { busyTimeoutMs: 10_000 });
const actor = DEMO_USERS.find((u) => u.role === "warehouse")!;
while (Date.now() < Number(startAt)) {
  // spin until both workers are released together
}
try {
  const r = postReceiving({ db, clock: () => new Date("2026-10-23T02:00:00.000Z"), warehouseId: WAREHOUSE_ID }, actor, receivingId, { expectedVersion: 1, actualGoodsChecked: true }, key);
  console.log(JSON.stringify({ ok: true, units: r.postedUnits }));
} catch (e) {
  console.log(JSON.stringify({ ok: false, code: e instanceof AppError ? e.code : String(e), issue: e instanceof AppError ? e.extra.issues?.[0]?.code : null }));
} finally {
  db.close();
}
