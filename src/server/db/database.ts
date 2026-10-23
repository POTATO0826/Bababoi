import { Database } from "bun:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** Versioned, forward-only SQL migrations. Applying them never seeds or deletes business data. */
const MIGRATIONS: readonly { version: number; name: string; file: string }[] = [
  { version: 1, name: "initial", file: "001_initial.sql" },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.at(-1)!.version;

export type Db = Database;

/** Opens the SQLite file with foreign keys, WAL and a bounded busy timeout. Does not migrate or seed. */
export function openDatabase(file: string, { busyTimeoutMs = 5000 }: { busyTimeoutMs?: number } = {}): Db {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file, { create: true, strict: true });
  db.run("PRAGMA foreign_keys = ON");
  db.run(`PRAGMA busy_timeout = ${Math.max(0, Math.floor(busyTimeoutMs))}`);
  if (file !== ":memory:") db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");
  return db;
}

export function schemaVersion(db: Db): number {
  const has = db.query("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
  if (!has) return 0;
  const row = db.query("SELECT MAX(version) AS v FROM schema_migrations").get() as { v: number | null };
  return row.v ?? 0;
}

/** Applies pending migrations, each in its own immediate transaction. Returns the versions applied. */
export function migrate(db: Db, now: () => Date = () => new Date()): number[] {
  db.run("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT");
  const applied: number[] = [];
  for (const m of MIGRATIONS) {
    const apply = db.transaction(() => {
      // Re-check inside the write lock so two processes cannot apply the same migration.
      const done = db.query("SELECT 1 AS x FROM schema_migrations WHERE version = ?").get(m.version);
      if (done) return false;
      const sql = readFileSync(new URL(`./migrations/${m.file}`, import.meta.url), "utf8");
      db.run(sql);
      db.query("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(m.version, m.name, now().toISOString());
      return true;
    });
    if (apply.immediate()) applied.push(m.version);
  }
  return applied;
}

export interface SeedState {
  seeded: boolean;
  seedVersion: string | null;
}

export function seedState(db: Db): SeedState {
  if (schemaVersion(db) < 1) return { seeded: false, seedVersion: null };
  const row = db.query("SELECT seed_version FROM warehouse_settings LIMIT 1").get() as { seed_version: string | null } | null;
  return { seeded: !!row?.seed_version, seedVersion: row?.seed_version ?? null };
}
